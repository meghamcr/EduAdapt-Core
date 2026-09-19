'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizePrerequisites:normalize,evaluatePrerequisites:evaluate}=require('../../src/services/adaptiveLearning/prerequisitePolicy');
const context={curriculum:{artifactVersionId:'v',nodeId:'n',hierarchyPath:[{nodeId:'parent'},{nodeId:'n'}]}};
const relation={relationshipId:'r',approvedBy:'curriculum-reviewer',artifactVersionId:'v',nodeId:'prerequisite'};
const policy=requirements=>normalize({learnerId:'learner',artifactVersionId:'v',nodeId:'n',requirements});
test('parent hierarchy is never inferred as prerequisite',()=>{const p=evaluate(policy([]),context,'learner');assert.equal(p.status,'NOT_SUPPLIED');assert.deepEqual(p.requirements,[]);});
for(const status of ['MASTERED','NOT_MASTERED','UNKNOWN'])test(`explicit ${status} prerequisite`,()=>{
  const p=evaluate(policy([{...relation,masteryStatus:status,...(status!=='UNKNOWN'?{evidenceReference:'trusted-observation'}:{})}]),context,'learner');
  assert.equal(p.dependentWorkAllowed,status==='MASTERED');assert.equal(p.status,{MASTERED:'SATISFIED',NOT_MASTERED:'GAP',UNKNOWN:'UNKNOWN'}[status]);
});
test('reject unapproved relationships, unsupported fields, known state without evidence and wrong target',()=>{
  for(const r of [{...relation,approvedBy:'',masteryStatus:'UNKNOWN'},{...relation,masteryStatus:'MASTERED'},{...relation,masteryStatus:'UNKNOWN',inferFromParent:true}])assert.throws(()=>policy([r]));
  assert.throws(()=>evaluate(policy([]),{curriculum:{artifactVersionId:'other',nodeId:'n'}},'learner'));assert.throws(()=>evaluate({requirements:[]},context,'learner'));
});
test('reject duplicate and self prerequisites; never fetch external node content',()=>{
  const r={...relation,masteryStatus:'UNKNOWN'};assert.throws(()=>policy([r,r]));assert.throws(()=>policy([{...r,nodeId:'n'}]));
  const p=evaluate(policy([{...r,artifactVersionId:'external'}]),context,'learner');assert.equal(p.dependentWorkAllowed,false);assert.equal('content' in p.unresolved[0],false);
});
test('prerequisite result immutable and deterministic independent of relationship input order',()=>{
  const a={...relation,masteryStatus:'UNKNOWN'},b={...a,relationshipId:'b',nodeId:'other'};
  assert.deepEqual(evaluate(policy([a,b]),context,'learner'),evaluate(policy([b,a]),context,'learner'));assert.throws(()=>evaluate(policy([a]),context,'learner').unresolved.push({}),TypeError);
});
test('prerequisite evidence cannot be transferred to another learner',()=>assert.throws(()=>evaluate(policy([]),context,'another-learner'),/PREREQUISITE_LEARNER_MISMATCH/));
test('one relationship identifier cannot assert two different prerequisite targets',()=>{
  const a={...relation,masteryStatus:'UNKNOWN'};assert.throws(()=>policy([a,{...a,nodeId:'other'}]),/INVALID_PREREQUISITE_RELATIONSHIP/);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {decideAdaptiveLearning:decide,POLICY}=require('../../src/services/adaptiveLearning/adaptiveDecision');
const {normalizeLearnerState}=require('../../src/services/adaptiveLearning/learnerStateProvider');
const {normalizePrerequisites}=require('../../src/services/adaptiveLearning/prerequisitePolicy');
const {createGenerationContextService}=require('../../src/services/gameGeneration/generationContext');
const {createArtifactService}=require('../../src/services/curriculumArtifacts/artifactService');
const {artifact,database}=require('../curriculumArtifacts/fixtures/serviceFixture');
async function fixture() {
  const db=database(),service=createArtifactService(db,{dbNull:null}); const {versionId}=await service.persist(artifact());
  await service.review(versionId,'IN_REVIEW',{expectedRevision:0});await service.review(versionId,'APPROVED',{expectedRevision:1,reviewerReference:'synthetic-reviewer'});await service.importVersion(versionId);
  const context=await createGenerationContextService(db).build({curriculumArtifactVersionId:versionId,curriculumNodeId:'worked'});db.trace=[];
  const scope={artifactVersionId:versionId,nodeId:'worked'};
  return {db,context,run:(state={},requirements=[])=>decide({context,learnerState:normalizeLearnerState({learnerId:'synthetic-learner',...scope,...state}),prerequisites:normalizePrerequisites({learnerId:'synthetic-learner',...scope,requirements})}),scope};
}
const strong=(count=3,overrides={})=>Array.from({length:count},(_,i)=>({id:`event-${i}`,correctness:true,attempts:1,hintsUsed:0,mistakes:0,completion:true,abandoned:false,skipped:false,...overrides}));
test('cold start EASY, strong scaffolding, hints and no mastery fabrication',async()=>{
  const {run}=await fixture(),d=run();assert.equal(d.instructionalDecision.difficulty,'EASY');assert.equal(d.instructionalDecision.scaffoldingLevel,'HIGH');assert.equal(d.instructionalDecision.hintsAllowed,true);assert.equal(d.evidence.suppliedMastery.status,'UNKNOWN');assert.ok(d.evidence.reasonCodes.includes('INSUFFICIENT_EVIDENCE'));
});
test('one correct answer cannot jump EASY to HARD',async()=>{const {run}=await fixture();assert.equal(run({previousDifficulty:'EASY',observations:strong(1)}).instructionalDecision.difficulty,'EASY');});
for(const [from,to] of [['EASY','MEDIUM'],['MEDIUM','HARD'],['HARD','HARD']])test(`sustained multiple-signal evidence ${from} → ${to}`,async()=>{const {run}=await fixture();assert.equal(run({previousDifficulty:from,observations:strong()}).instructionalDecision.difficulty,to);});
for(const [from,to] of [['HARD','MEDIUM'],['MEDIUM','EASY']])test(`weak evidence reduces ${from} gradually`,async()=>{const {run}=await fixture();assert.equal(run({previousDifficulty:from,observations:strong(3,{correctness:false,mistakes:1})}).instructionalDecision.difficulty,to);});
test('isolated HARD mistake does not collapse difficulty',async()=>{const {run}=await fixture();assert.equal(run({previousDifficulty:'HARD',observations:strong(1,{correctness:false,mistakes:1})}).instructionalDecision.difficulty,'HARD');});
for(const [field,value,reason] of [['mistakes',1,'REPEATED_MISTAKES'],['hintsUsed',3,'HIGH_HINT_DEPENDENCE'],['attempts',4,'REPEATED_ATTEMPTS'],['skipped',true,'REPEATED_SKIPS'],['abandoned',true,'REPEATED_ABANDONMENT']])test(`${field} affects support and prevents escalation`,async()=>{
  const {run}=await fixture();const d=run({previousDifficulty:'MEDIUM',observations:strong(3,{[field]:value,...(['skipped','abandoned'].includes(field)?{completion:false}:{})})});assert.equal(d.academicDecision.mode,'REMEDIATION');assert.equal(d.instructionalDecision.scaffoldingLevel,'HIGH');assert.ok(d.evidence.reasonCodes.includes(reason));assert.notEqual(d.instructionalDecision.difficulty,'HARD');
});
test('missing, slow and fast time do not determine mastery or difficulty',async()=>{
  const {run}=await fixture();for(const responseTimeSec of [undefined,0,900]){const d=run({previousDifficulty:'EASY',observations:strong(3,{responseTimeSec})});assert.equal(d.instructionalDecision.difficulty,'MEDIUM');assert.equal(d.evidence.suppliedMastery.status,'UNKNOWN');assert.equal(d.evidence.responseTimeUsedForDifficulty,false);}
  const d=run({observations:[{id:'time-only',responseTimeSec:0}]});assert.equal(d.instructionalDecision.difficulty,'EASY');assert.equal(d.evidence.suppliedMastery.status,'UNKNOWN');
});
test('null-only observations do not constitute sufficient evidence',async()=>{const {run}=await fixture();const d=run({previousDifficulty:'HARD',observations:[{id:'1'},{id:'2'},{id:'3'}]});assert.ok(d.evidence.reasonCodes.includes('INSUFFICIENT_EVIDENCE'));assert.equal(d.instructionalDecision.scaffoldingLevel,'HIGH');});
for(const status of ['MASTERED','NOT_MASTERED','UNKNOWN'])test(`prerequisite ${status} gates dependent work without switching academic target`,async()=>{
  const {run,scope}=await fixture();const d=run({previousDifficulty:'HARD',observations:strong()},[{relationshipId:'trusted-edge',approvedBy:'reviewer',artifactVersionId:'another-version',nodeId:'other-node',masteryStatus:status,...(status==='UNKNOWN'?{}:{evidenceReference:'evidence-id'})}]);
  assert.equal(d.academicDecision.targetNodeId,scope.nodeId);assert.equal(d.academicDecision.artifactVersionId,scope.artifactVersionId);assert.equal(d.academicDecision.dependentWorkAllowed,status==='MASTERED');
  if(status!=='MASTERED'){assert.equal(d.academicDecision.mode,'PREREQUISITE');assert.equal(d.instructionalDecision.difficulty,'EASY');assert.equal(d.academicDecision.requiresSeparatelyGroundedPrerequisiteContext,true);}
});
test('trusted mastery gap prevents escalation; conflict with recent evidence is explicit',async()=>{
  const {run}=await fixture();const gap=run({previousDifficulty:'MEDIUM',observations:strong(),mastery:{status:'NOT_MASTERED',sampleSize:5}});assert.equal(gap.academicDecision.mode,'REMEDIATION');assert.equal(gap.instructionalDecision.difficulty,'MEDIUM');
  const d=run({previousDifficulty:'MEDIUM',observations:strong(3,{correctness:false}),mastery:{status:'MASTERED',sampleSize:5}});assert.ok(d.evidence.reasonCodes.includes('MASTERY_CONFLICTS_WITH_RECENT_EVIDENCE'));assert.equal(d.academicDecision.mode,'REMEDIATION');
});
test('academic identity/scope stays fixed at HARD; no added content/objectives',async()=>{
  const {run,context}=await fixture(),before=JSON.stringify(context),d=run({previousDifficulty:'MEDIUM',observations:strong()});assert.equal(d.academicDecision.targetNodeId,context.curriculum.nodeId);assert.equal(d.instructionalDecision.difficulty,'HARD');assert.equal(d.constraints.difficultyCannotExpandScope,true);assert.equal('content' in d.academicDecision,false);assert.equal('learningObjectives' in d.academicDecision,false);assert.equal(JSON.stringify(context),before);
});
test('titles have no effect; input determinism and deep immutability',async()=>{
  const {run,context,scope}=await fixture(),state={previousDifficulty:'EASY',observations:strong()};const a=run(state);assert.deepEqual(a,run(state));assert.throws(()=>a.evidence.observationsUsed[0].attempts=100,TypeError);assert.equal(state.observations[0].attempts,1);
  const changed={...context,curriculum:{...context.curriculum,hierarchyPath:context.curriculum.hierarchyPath.map(n=>({...n,title:'same title'}))}};Object.freeze(changed);
  assert.deepEqual(decide({context:changed,learnerState:normalizeLearnerState({learnerId:'synthetic-learner',...scope,...state}),prerequisites:normalizePrerequisites({learnerId:'synthetic-learner',...scope,requirements:[]})}),a);
});
test('raw learner state, invalid context and mismatched scope fail closed',async()=>{
  const {context,scope}=await fixture();const p=normalizePrerequisites({learnerId:'synthetic-learner',...scope,requirements:[]});assert.throws(()=>decide({context,learnerState:{},prerequisites:p}));assert.throws(()=>decide({context:{},learnerState:{},prerequisites:p}));assert.throws(()=>decide({context,learnerState:normalizeLearnerState({learnerId:'l',...scope,nodeId:'other'}),prerequisites:p}),/LEARNER_SCOPE_MISMATCH/);
});
test('policy window bounded; no DB or network dependencies used for decisions',async()=>{
  const {db,run}=await fixture();const before=structuredClone(db.state);const oldFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Network forbidden');};try{const d=run({previousDifficulty:'EASY',observations:strong(10)});assert.equal(d.evidence.observationsUsed.length,POLICY.window);assert.equal(db.trace.length,0);assert.deepEqual(db.state,before);}finally{globalThis.fetch=oldFetch;}
});
test('documented accuracy threshold is inclusive and missing support signals cannot promote',async()=>{
  const {run}=await fixture();for(const [accuracy,expected] of [[0.85,'MEDIUM'],[0.84,'EASY']])assert.equal(run({previousDifficulty:'EASY',observations:strong(3,{correctness:undefined,accuracy})}).instructionalDecision.difficulty,expected);
  assert.equal(run({previousDifficulty:'EASY',observations:strong(3,{hintsUsed:undefined})}).instructionalDecision.difficulty,'EASY');
});
test('response-time-only observations remain insufficient regardless of speed',async()=>{
  const {run}=await fixture();for(const responseTimeSec of [0,900]){const d=run({previousDifficulty:'HARD',observations:Array.from({length:3},(_,i)=>({id:`time-${i}`,responseTimeSec}))});assert.equal(d.evidence.confidence,'LIMITED');assert.ok(d.evidence.reasonCodes.includes('INSUFFICIENT_EVIDENCE'));assert.equal(d.instructionalDecision.scaffoldingLevel,'HIGH');}
});

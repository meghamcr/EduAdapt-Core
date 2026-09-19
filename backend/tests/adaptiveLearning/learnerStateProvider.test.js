'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLearnerState: normalize, requireLearnerState } = require('../../src/services/adaptiveLearning/learnerStateProvider');
const base = { learnerId: 'learner', artifactVersionId: 'version', nodeId: 'node' };
test('missing evidence remains unknown, with no manufactured mastery', () => {
  const s = normalize({ ...base, observations: [{ id: 'one' }] });
  assert.equal(s.observations[0].accuracy, null); assert.equal(s.observations[0].responseTimeSec, null);
  assert.deepEqual(s.mastery, {status:'UNKNOWN',sampleSize:null,confidence:null}); assert.equal(s.previousDifficulty, null);
});
for (const [field,value] of [['attempts',-1],['attempts',0],['attempts',1.5],['accuracy',1.1],['accuracy',-0.1],['accuracy','0.8'],['hintsUsed',-1],['hintsUsed',0.5],['hintsUsed',NaN],['responseTimeSec',Infinity],['responseTimeSec',-1],['mistakes',-2],['completion','true']]) test(`reject malformed ${field}=${value}`,()=>assert.throws(()=>normalize({...base,observations:[{id:'one',[field]:value}]})));
for(const field of ['xp','score','dashboardMastery','browserDifficulty','masteryPercentage']) test(`reject unsupported ${field}`,()=>assert.throws(()=>normalize({...base,[field]:100}),/INVALID_EVIDENCE_FIELDS/));
test('reject invalid difficulty, unsupported observation fields and duplicate events',()=>{
  assert.throws(()=>normalize({...base,previousDifficulty:'Extreme'}));
  assert.throws(()=>normalize({...base,observations:[{id:'one',score:100}]}));
  assert.throws(()=>normalize({...base,observations:[{id:'one'},{id:'one'}]}),/DUPLICATE_OBSERVATION/);
});
test('reject contradictory outcomes and completion',()=>{
  for(const row of [{correctness:true,accuracy:0},{completion:true,abandoned:true},{completion:true,skipped:true}]) assert.throws(()=>normalize({...base,observations:[{id:'one',...row}]}),/CONTRADICTORY/);
});
test('mastery requires explicit status and real sample count',()=>{
  assert.throws(()=>normalize({...base,mastery:{status:'MASTERED',sampleSize:0}}));
  assert.throws(()=>normalize({...base,mastery:{status:'MASTERED',sampleSize:3,confidence:0}}));
  assert.throws(()=>normalize({...base,mastery:{status:'MASTERED',sampleSize:3,confidence:1.1}}));
  assert.equal(normalize({...base,mastery:{status:'MASTERED',sampleSize:3,confidence:0.8}}).mastery.confidence,0.8);
});
test('normalized state is detached/frozen and raw/cloned states cannot bypass normalization',()=>{
  const input={...base,observations:[{id:'one',misconceptionCodes:['gap']}]},s=normalize(input);
  input.observations[0].misconceptionCodes.push('other');assert.deepEqual(s.observations[0].misconceptionCodes,['gap']);
  assert.throws(()=>s.observations.push({}),TypeError);assert.throws(()=>requireLearnerState(input));assert.throws(()=>requireLearnerState(structuredClone(s)));requireLearnerState(s);
});

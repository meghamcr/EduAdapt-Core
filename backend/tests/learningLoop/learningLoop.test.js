'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const { fixture,candidate }=require('../gameGeneration/fixtures/gameFixture');
const { database }=require('../curriculumArtifacts/fixtures/serviceFixture');
const { createLearningLoop }=require('../../src/services/gameplay/learningLoop');
const { createGameplayService }=require('../../src/services/gameplay/gameplaySession');
const { RUNTIME_VERSION }=require('../../src/services/gameplay/runtimeProjection');
const authorizeExecution=async()=>({reference:'SYNTHETIC_ONLY'});
const savedFetch=global.fetch;
test.before(()=>{global.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};}); test.after(()=>{global.fetch=savedFetch;});
function twoChallenges(request) {
  const g=candidate(request), c=structuredClone(g.challenges[0]); c.id=c.telemetryKey='challenge2';
  c.prompt.start=request.academicGrounding.evidence[0].text.indexOf('four'); c.prompt.end=c.prompt.start+4;c.correctAnswer='four';
  g.challenges.push(c);g.completion.challengeIds.push(c.id);g.telemetry.challengeKeys.push(c.id);return g;
}
async function setup(options={}) {
  const f=await fixture({db:database({includeGameplay:true})}); let calls=0;
  const provider=options.provider||{generateStructuredGame(r){calls++;return twoChallenges(r.originalRequest||r);}};
  const loop=createLearningLoop(f.db,{provider,authorizeLearning:async()=>true,authorizeExecution,loadPrerequisites:async()=>[],...options});
  const input={learnerId:'synthetic-learner',curriculumArtifactVersionId:f.context.curriculum.artifactVersionId,curriculumNodeId:f.context.curriculum.mappedNodeId,creationKey:'launch1',runtimeVersion:RUNTIME_VERSION};
  let key=0;
  const send=(runtime,type,extra={})=>loop.submitEvent({learnerId:input.learnerId,sessionId:runtime.sessionId,runtimeVersion:runtime.runtimeVersion,event:{eventId:`e${++key}`,type,...extra}});
  async function play(runtime,{skip=false}={}) {
    assert.equal((await send(runtime,'GAME_STARTED')).ok,true);
    for(const phase of runtime.phases) {
      assert.equal((await send(runtime,phase.type==='REMEDIATION'?'REMEDIATION_STARTED':'PHASE_STARTED',{phaseId:phase.id})).ok,true);
      for(const challenge of runtime.challenges.filter(c=>c.phaseId===phase.id)) {
        assert.equal((await send(runtime,'CHALLENGE_PRESENTED',{challengeId:challenge.id})).ok,true);
        // Synthetic learner responses, NOT read from a persisted answer key.
        const response=challenge.choices.indexOf(challenge.id==='challenge1'?'eight':'four');
        const result=await send(runtime,skip?'CHALLENGE_SKIPPED':'ANSWER_SUBMITTED',{challengeId:challenge.id,...(skip?{}:{response})});
        assert.equal(result.ok,true);if(!skip)assert.equal(result.result.correctness,true);
      }
    }
    assert.equal((await send(runtime,'GAME_COMPLETED')).result.progress.status,'COMPLETED');
  }
  return {...f,loop,input,send,play,calls:()=>calls};
}
function safeFailure(result,stage) {assert.equal(result.ok,false);if(stage)assert.equal(result.error.stage,stage);assert.deepEqual(Object.keys(result.error).sort(),['code','stage']);assert.doesNotMatch(JSON.stringify(result),/SECRET|correctAnswer|postgres|stack|prompt/);}
test('full approved curriculum → generation → runtime → evidence → next adaptation, including safe reuse',async()=>{
  const f=await setup(), sourceBefore=structuredClone(f.db.state.curriculumNode);
  const first=await f.loop.start(f.input);assert.equal(first.ok,true);assert.equal(first.runtime.difficulty,'EASY');assert.equal(f.calls(),1);
  assert.deepEqual(await f.loop.start(f.input),first);assert.equal(f.calls(),1);
  await f.play(first.runtime);
  const second=await f.loop.start({...f.input,creationKey:'launch2'});assert.equal(second.ok,true);assert.equal(second.runtime.difficulty,'EASY');assert.equal(f.calls(),1);
  await f.play(second.runtime);
  const third=await f.loop.start({...f.input,creationKey:'launch3'});assert.equal(third.ok,true);assert.equal(third.runtime.difficulty,'MEDIUM');assert.equal(f.calls(),2);
  const state=await createGameplayService(f.db).loadLearnerState({learnerId:f.input.learnerId,artifactVersionId:f.input.curriculumArtifactVersionId,nodeId:f.input.curriculumNodeId});
  assert.equal(state.observations.length,4);assert.equal(state.mastery.status,'MASTERED');
  assert.equal(f.db.state.gameSpec.length,2);assert.deepEqual(f.db.state.curriculumNode,sourceBefore);
  assert.doesNotMatch(JSON.stringify(third),/correctAnswer|artifactVersionId|validationResults|mastery|sourceRegistry/);
});
test('bounded repair success feeds trusted persistence and runtime',async()=>{
  let calls=0;const f=await setup({provider:{generateStructuredGame(r){calls++;return calls===1?'malformed':twoChallenges(r.originalRequest);}}});
  assert.equal((await f.loop.start(f.input)).ok,true);assert.equal(calls,2);assert.equal(f.db.state.gameSpec.length,1);
});
for(const [name,provider,expected] of [
  ['provider failure',{generateStructuredGame(){throw Error('SECRET postgres://credentials raw prompt');}},'PROVIDER_FAILURE'],
  ['malformed exhausted',{generateStructuredGame(){return '{SECRET';}},'GENERATION_REJECTED'],
  ['invalid candidate',{generateStructuredGame(r){const g=twoChallenges(r.originalRequest||r);g.challenges[0].correctAnswer='SECRET';return g;}},'GENERATION_REJECTED'],
  ['repair provider failure',{generateStructuredGame(r){if(r.kind==='REPAIR')throw Error('SECRET');return '{}';}},'PROVIDER_FAILURE']
]) test(name,async()=>{
  const f=await setup({provider}), before=structuredClone(f.db.state);const result=await f.loop.start(f.input);safeFailure(result,'generation');assert.equal(result.error.code,expected);assert.deepEqual(f.db.state,before);
});
for(const [name,mutate] of [
  ['missing node',f=>f.input.curriculumNodeId='missing'],
  ['unapproved artifact',f=>f.db.state.curriculumArtifactVersion[0].reviewStatus='UNREVIEWED'],
  ['unmapped node',f=>{f.db.state.curriculumArtifactImport[0].nodeMapping={};}]
]) test(name,async()=>{
  const f=await setup();mutate(f);const before=structuredClone(f.db.state);safeFailure(await f.loop.start(f.input),'curriculum');assert.equal(f.calls(),0);assert.deepEqual(f.db.state,before);
});
test('unauthorized learning rejected before provider/database operations',async()=>{
  const f=await setup({authorizeLearning:async()=>false});f.db.trace=[];safeFailure(await f.loop.start(f.input),'authorization');assert.equal(f.calls(),0);assert.deepEqual(f.db.trace,[]);
});
test('missing trusted prerequisite policy fails closed',async()=>{
  const f=await setup({loadPrerequisites:undefined});safeFailure(await f.loop.start(f.input),'adaptive');assert.equal(f.calls(),0);
});
test('explicit unresolved prerequisite blocks dependent generation',async()=>{
  const f=await setup({loadPrerequisites:async()=>[{relationshipId:'approved-edge',approvedBy:'policy-owner',artifactVersionId:'other-artifact',nodeId:'other-node',masteryStatus:'UNKNOWN'}]});
  const result=await f.loop.start(f.input);safeFailure(result,'adaptive');assert.equal(result.error.code,'PREREQUISITE_TARGET_REQUIRED');assert.equal(f.calls(),0);
});
test('unauthorized runtime does not create session/mastery even after generation',async()=>{
  const f=await setup({authorizeExecution:async()=>null});safeFailure(await f.loop.start(f.input),'runtime');
  assert.equal(f.db.state.gameplayEvidenceSession.length,0);assert.equal(f.db.state.curriculumNodeMastery.length,0);
  assert.equal(f.db.state.gameSpec.length,1); // Validated pending game can be retained, never execution approval.
});
test('persistence conflicts are bounded and do not create learner evidence',async()=>{
  const f=await setup();let attempts=0;f.db.hook=async(name,op)=>{if(name==='gameSpec'&&op==='create'){attempts++;throw Object.assign(Error('SECRET'),{code:'P2034'});}};
  safeFailure(await f.loop.start(f.input),'persistence');assert.equal(attempts,3);assert.equal(f.db.state.gameSpec.length,0);assert.equal(f.db.state.gameplayEvidenceEvent.length,0);
});
test('authority invalidated during generation blocks persistence',async()=>{
  let f;f=await setup({provider:{generateStructuredGame(r){f.db.state.curriculumArtifactVersion[0].reviewStatus='SUPERSEDED';return twoChallenges(r);}}});
  safeFailure(await f.loop.start(f.input),'persistence');assert.equal(f.db.state.gameSpec.length,0);assert.equal(f.db.state.gameplayEvidenceSession.length,0);
});
test('reuse cannot bypass changed curriculum or corrupted game; invalid candidate never launches',async()=>{
  const f=await setup();assert.equal((await f.loop.start(f.input)).ok,true);f.db.state.gameSpec[0].spec.game.visuals.assets=['javascript:SECRET'];
  safeFailure(await f.loop.start({...f.input,creationKey:'different'}),'learner_state');assert.equal(f.db.state.gameplayEvidenceSession.length,1);
  f.db.state.curriculumArtifactVersion[0].reviewStatus='SUPERSEDED';safeFailure(await f.loop.start({...f.input,creationKey:'again'}),'curriculum');
});
test('version mismatch and client academic state never reach provider',async()=>{
  const f=await setup();for(const extra of [{runtimeVersion:'future'},{difficulty:'HARD'},{mastery:'MASTERED'},{correctness:true},{adaptiveMode:'PRIMARY'}])safeFailure(await f.loop.start({...f.input,...extra}),'input');assert.equal(f.calls(),0);
});
test('runtime error envelope never leaks policy/storage exception details',async()=>{
  let deny=false;const f=await setup({authorizeExecution:async()=>{if(deny)throw Error('SECRET postgres://key answer=8');return {reference:'TEST'};}});
  const r=await f.loop.start(f.input);deny=true;safeFailure(await f.send(r.runtime,'GAME_STARTED'),'runtime');
  safeFailure(await f.loop.restore({learnerId:f.input.learnerId,sessionId:r.runtime.sessionId,runtimeVersion:RUNTIME_VERSION}),'runtime');assert.equal(f.db.state.gameplayEvidenceEvent.length,0);
});
test('duplicates, incomplete completion and abandonment preserve conservative evidence',async()=>{
  const f=await setup(),{runtime}=await f.loop.start(f.input);
  const envelope={learnerId:f.input.learnerId,sessionId:runtime.sessionId,runtimeVersion:RUNTIME_VERSION,event:{eventId:'start',type:'GAME_STARTED'}};
  assert.deepEqual(await f.loop.submitEvent(envelope),await f.loop.submitEvent(envelope));safeFailure(await f.send(runtime,'GAME_COMPLETED'));
  for(const p of runtime.phases.slice(0,3))await f.send(runtime,'PHASE_STARTED',{phaseId:p.id});
  await f.send(runtime,'CHALLENGE_PRESENTED',{challengeId:runtime.challenges[0].id});
  assert.equal((await f.send(runtime,'GAME_ABANDONED')).result.progress.status,'ABANDONED');
  const next=await f.loop.start({...f.input,creationKey:'next'});assert.equal(next.ok,true);assert.equal(next.runtime.difficulty,'EASY');
  assert.equal(f.db.state.curriculumNodeMastery[0].status,'UNKNOWN');
});
test('completed skipped tasks are not converted to mastered evidence',async()=>{
  const f=await setup(),r=await f.loop.start(f.input);await f.play(r.runtime,{skip:true});assert.notEqual(f.db.state.curriculumNodeMastery[0].status,'MASTERED');
});
test('new evidence arriving after snapshot rejects stale launch atomically',async()=>{
  const f=await setup(), first=await f.loop.start(f.input);
  const loop=createLearningLoop(f.db,{provider:{generateStructuredGame:twoChallenges},authorizeLearning:async()=>true,
    loadPrerequisites:async()=>{assert.equal((await f.send(first.runtime,'GAME_STARTED')).ok,true);return [];},authorizeExecution});
  const before=f.db.state.gameplayEvidenceSession.length;
  safeFailure(await loop.start({...f.input,creationKey:'race'}),'runtime');
  assert.equal(f.db.state.gameplayEvidenceSession.length,before);
  assert.equal(f.db.state.gameplayEvidenceEvent.length,1);
});

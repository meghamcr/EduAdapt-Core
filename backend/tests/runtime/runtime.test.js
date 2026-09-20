'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { runtimeFixture, RUNTIME_VERSION } = require('./fixtures/runtimeFixture');
const { createGameplayService } = require('../../src/services/gameplay/gameplaySession');
const previousFetch = global.fetch;
test.before(() => { global.fetch = () => { throw Error('NETWORK_FORBIDDEN'); }; });
test.after(() => { global.fetch = previousFetch; });
const rejected = promise => assert.rejects(promise);
function noHidden(value) {
  const forbidden = ['correctAnswer','correctOption','correctIndex','grounding','claims','sourceRegistry','sourceRefs','artifactVersionId','nodeId','mappedNodeId','spec','storedPackage','evidenceId','start','end','validationResults','repairAttempts','specificationChecksum','runtimeAuthorizationReference','mastery','payload','lastTime','presentedAt'];
  if (value && typeof value === 'object') for (const [k,v] of Object.entries(value)) { assert.ok(!forbidden.includes(k), k); noHidden(v); }
}
test('deterministic versioned projection preserves phase/challenge order without hidden data', async () => {
  const f = await runtimeFixture();
  assert.equal(f.runtime.runtimeVersion, RUNTIME_VERSION);
  assert.deepEqual(await f.service.restoreRuntimeSession(f.identity), f.runtime);
  assert.deepEqual(await f.service.openRuntimeSession(f.openInput), f.runtime);
  assert.deepEqual(f.runtime.phases.map(p => p.id), ['intro','teach','practice','complete']);
  assert.deepEqual(f.runtime.challenges.map(c => c.id), ['challenge1']);
  assert.equal(f.runtime.challenges[0].prompt, 'A collection contains ____ tokens and four counters.');
  assert.equal(f.runtime.phases[1].teaching[0], 'A collection contains eight tokens and four counters.');
  noHidden(f.runtime);
  assert.deepEqual(Object.keys(f.runtime.challenges[0]).sort(), ['choices','hint','id','instruction','phaseId','prompt','telemetryKey','type']);
  assert.equal(f.runtime.gameId, `runtime_${f.db.state.gameSpec[0].spec.specificationFingerprint}`);
});
test('cloze projection has no options or answer mapping', async () => {
  const f = await runtimeFixture({ type:'CLOZE' }); assert.deepEqual(f.runtime.challenges[0].choices, []);
  assert.ok(!JSON.stringify(f.runtime.challenges[0]).includes('eight')); noHidden(f.runtime);
});
for (const type of ['MCQ_CLOZE','CLOZE']) test(`${type} answers scored only on server; restore is safe`, async () => {
  const f = await runtimeFixture({ type }); await f.present();
  const wrong = await f.send('ANSWER_SUBMITTED', { challengeId:'challenge1', response:type === 'CLOZE' ? 'wrong' : 1 });
  const right = await f.send('ANSWER_SUBMITTED', { challengeId:'challenge1', response:type === 'CLOZE' ? 'eight' : 0 });
  assert.equal(wrong.correctness, false); assert.equal(wrong.attempt,1); assert.equal(right.correctness,true); assert.equal(right.attempt,2);
  noHidden(wrong); noHidden(right); assert.ok(!JSON.stringify(right).includes('eight'));
  const restored = await f.service.restoreRuntimeSession(f.identity); noHidden(restored);
  assert.equal(restored.progress.activeChallengeId, null); assert.equal(restored.progress.resolved[0].completed,true);
});
for (const field of ['correctness','attempt','mastery','difficulty','adaptiveMode','completion','gameSpecId','url','assetPath','script']) test(`rejects client ${field}`, async () => {
  const f = await runtimeFixture(), before = structuredClone(f.db.state);
  await rejected(f.send('GAME_STARTED', { [field]:'injected' })); assert.deepEqual(f.db.state,before);
});
for (const version of ['source-game-v1','eduadapt-runtime-v2',null]) test(`rejects unsupported runtime ${version} before writes`, async () => {
  const f = await runtimeFixture(), before = structuredClone(f.db.state);
  await rejected(f.service.openRuntimeSession({ ...f.openInput, runtimeVersion:version }));
  await rejected(f.service.restoreRuntimeSession({ ...f.identity, runtimeVersion:version }));
  await rejected(f.service.ingestRuntimeEvent({ ...f.identity, runtimeVersion:version, event:{ eventId:'x',type:'GAME_STARTED' } }));
  assert.deepEqual(f.db.state,before);
});
test('duplicate event receipt is stable, conflicting reuse fails and current progress is retained', async () => {
  const f = await runtimeFixture(); const input = { ...f.identity, event:{eventId:'same',type:'GAME_STARTED'} };
  const a = await f.service.ingestRuntimeEvent(input), b = await f.service.ingestRuntimeEvent(input); assert.deepEqual(a,b);
  await rejected(f.service.ingestRuntimeEvent({ ...input, event:{eventId:'same',type:'GAME_ABANDONED'} }));
  assert.equal(f.db.state.gameplayEvidenceEvent.length,1);
});
test('session owner isolation on restore and events', async () => {
  const f = await runtimeFixture();
  await rejected(f.service.restoreRuntimeSession({ ...f.identity, learnerId:'different-learner' }));
  await rejected(f.service.ingestRuntimeEvent({ ...f.identity, learnerId:'different-learner', event:{eventId:'x',type:'GAME_STARTED'} }));
  assert.equal(f.db.state.gameplayEvidenceEvent.length,0);
});
test('execution policy can revoke existing sessions including legacy event API', async () => {
  let allowed = true; const f = await runtimeFixture({ authorize: async () => allowed ? {reference:'TEST'} : null }); allowed = false;
  await rejected(f.send('GAME_STARTED')); await rejected(f.service.restoreRuntimeSession(f.identity));
  const { runtimeVersion, ...identity } = f.identity;
  await rejected(f.service.ingestEvent({ ...identity,event:{eventId:'x',type:'GAME_STARTED'} }));
  assert.equal(f.db.state.gameplayEvidenceEvent.length,0);
});
test('missing execution policy fails closed for existing session too', async () => {
  const f = await runtimeFixture(), service = createGameplayService(f.db);
  await rejected(service.restoreRuntimeSession(f.identity));
  await rejected(service.ingestRuntimeEvent({ ...f.identity,event:{eventId:'x',type:'GAME_STARTED'} }));
});
for (const [name,mutate] of [
  ['stale authority',f => f.db.state.curriculumArtifactVersion[0].reviewStatus='SUPERSEDED'],
  ['untrusted stored game',f => f.db.state.gameSpec[0].spec.storageVersion='legacy'],
  ['changed key',f => f.db.state.gameSpec[0].spec.game.challenges[0].correctAnswer='secret'],
  ['arbitrary asset',f => f.db.state.gameSpec[0].spec.game.visuals.assets=['https://invalid.test/script']],
  ['arbitrary field',f => f.db.state.gameSpec[0].spec.game.script='evil'],
  ['future source version',f => f.db.state.gameSpec[0].spec.game.contractVersion='source-game-v2'],
  ['state tampering',f => f.db.state.gameplayEvidenceSession[0].state.status='COMPLETED']
]) test(`${name} denies runtime open, restore and event`,async () => {
  const f = await runtimeFixture(); mutate(f); const before=structuredClone(f.db.state);
  await rejected(f.service.openRuntimeSession(f.openInput)); await rejected(f.service.restoreRuntimeSession(f.identity)); await rejected(f.send('GAME_STARTED'));
  assert.deepEqual(f.db.state,before);
});
for (const [type,extra] of [['PHASE_STARTED',{phaseId:'practice'}],['PHASE_STARTED',{phaseId:'other'}],['CHALLENGE_PRESENTED',{challengeId:'other'}],['GAME_COMPLETED',{}]]) test(`rejects invalid sequence ${type} ${JSON.stringify(extra)}`,async () => {
  const f=await runtimeFixture(); await f.send('GAME_STARTED'); const before=structuredClone(f.db.state);
  await rejected(f.send(type,extra)); assert.deepEqual(f.db.state,before);
});
test('complete and abandon are server-validated terminal transitions',async () => {
  const f=await runtimeFixture(); await f.present(); await rejected(f.send('GAME_COMPLETED'));
  await f.send('ANSWER_SUBMITTED',{challengeId:'challenge1',response:0}); await f.send('PHASE_STARTED',{phaseId:'complete'});
  assert.equal((await f.send('GAME_COMPLETED')).progress.status,'COMPLETED'); await rejected(f.send('GAME_STARTED'));
  const g=await runtimeFixture(); await g.present(); assert.equal((await g.send('GAME_ABANDONED')).progress.status,'ABANDONED');
  const state=await g.service.loadLearnerState({learnerId:g.identity.learnerId,artifactVersionId:g.context.curriculum.artifactVersionId,nodeId:g.context.curriculum.mappedNodeId});
  assert.equal(state.observations[0].abandoned,true); assert.equal(state.mastery.status,'UNKNOWN');
});
test('accessors and symbol inputs rejected without invoking getters',async () => {
  const f=await runtimeFixture(); let reads=0; const input={...f.openInput};
  Object.defineProperty(input,'learnerId',{enumerable:true,get(){reads++;throw Error('SECRET');}});
  await rejected(f.service.openRuntimeSession(input)); assert.equal(reads,0);
  await rejected(f.service.restoreRuntimeSession({...f.identity,[Symbol('x')]:1}));
});
test('partial state restored with server attempts/hints; no submitted response',async () => {
  const f=await runtimeFixture(); await f.present(); await f.send('HINT_REQUESTED',{challengeId:'challenge1'});
  await f.send('ANSWER_SUBMITTED',{challengeId:'challenge1',response:1}); const r=await f.service.restoreRuntimeSession(f.identity);
  assert.equal(r.progress.attempts,1); assert.equal(r.progress.hintsUsed,1); assert.equal(r.progress.activeChallengeId,'challenge1'); noHidden(r);
});
test('documented example matches the real synthetic runtime projection',async () => {
  const f=await runtimeFixture();const actual=structuredClone(f.runtime);actual.sessionId='example-session';actual.gameId='runtime_example';
  assert.deepEqual(require('../../docs/runtime-example.json'),actual);noHidden(actual);
});

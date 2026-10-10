'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, planCandidate, twoChallenges } = require('../gamePlanning/fixtures/plannerFixture');
const { createLevelLearningLoop } = require('../../src/services/gameplay/levelLearningLoop');
const { createGameplayService } = require('../../src/services/gameplay/gameplaySession');
const { RUNTIME_VERSION } = require('../../src/services/gameplay/runtimeProjection');
async function setup(story = false, overrides = {}) {
  const f = await fixture({ story }); let planCalls = 0, gameCalls = 0;
  const options = { plannerProvider: { planStructuredGame(r) { planCalls++; return planCandidate(r); } },
    provider: { generateStructuredGame(r) { gameCalls++; return twoChallenges(r.originalRequest || r); } },
    authorizeLevel: async () => ({ reference: 'SYNTHETIC_LEVEL_POLICY' }), authorizeLearning: async () => true,
    authorizeExecution: async () => ({ reference: 'SYNTHETIC_EXECUTION_POLICY' }), loadPrerequisites: async () => [], ...overrides };
  const loop = createLevelLearningLoop(f.db, options), gameplay = createGameplayService(f.db, options);
  const prepare = { learnerId: 'synthetic-learner', curriculumArtifactVersionId: f.versionId, levelId: f.levelId, language: 'en' };
  const launch = plan => ({ learnerId: prepare.learnerId, planId: plan.planId, gameId: plan.games[0].id, creationKey: 'first', runtimeVersion: RUNTIME_VERSION });
  let key = 0;
  const event = (runtime, type, extra = {}) => gameplay.ingestRuntimeEvent({ learnerId: prepare.learnerId,
    sessionId: runtime.sessionId, runtimeVersion: RUNTIME_VERSION, event: { eventId: `event-${++key}`, type, ...extra } });
  async function play(runtime, skip = false) {
    await event(runtime, 'GAME_STARTED');
    for (const phase of runtime.phases) {
      await event(runtime, phase.type === 'REMEDIATION' ? 'REMEDIATION_STARTED' : 'PHASE_STARTED', { phaseId: phase.id });
      for (const c of runtime.challenges.filter(c => c.phaseId === phase.id)) {
        await event(runtime, 'CHALLENGE_PRESENTED', { challengeId: c.id });
        const receipt = await event(runtime, skip ? 'CHALLENGE_SKIPPED' : 'ANSWER_SUBMITTED', { challengeId: c.id,
          ...(skip ? {} : { response: c.choices.indexOf(c.id === 'challenge1' ? 'eight' : 'four') }) });
        if (!skip) assert.equal(receipt.correctness, true);
      }
    }
    return event(runtime, 'GAME_COMPLETED');
  }
  return { ...f, loop, gameplay, prepare, launch, play, options, calls: () => ({ plan: planCalls, game: gameCalls }) };
}
for (const story of [false, true]) test(`${story ? 'passage/context' : 'math/visual-defer'} synthetic flow: notes → adaptive → plan → validated game → reuse → runtime → evidence → next decision`, async () => {
  const f = await setup(story), originalSource = structuredClone(f.db.state.curriculumNode);
  const p = await f.loop.prepare(f.prepare); assert.equal(p.ok, true); assert.equal(p.status, 'READY');
  assert(p.notes.flatMap(s => s.materials).some(m => m.text === f.source.nodes[1].materials[0].text));
  assert(p.deferred.some(d => d.reason === 'VISUAL_DEPENDENCY')); assert.equal(p.games.length, 1);
  assert.deepEqual(await f.loop.prepare(f.prepare), p); assert.deepEqual(f.calls(), { plan: 1, game: 0 });
  const r = await f.loop.launch(f.launch(p)); assert.equal(r.ok, true); assert.equal(r.runtime.difficulty, 'EASY');
  assert.deepEqual(await f.loop.launch(f.launch(p)), r); assert.deepEqual(f.calls(), { plan: 1, game: 1 });
  assert.doesNotMatch(JSON.stringify(r), /correctAnswer|storedPackage|materialIndexes|sourceRegistry|specificationFingerprint/);
  await f.play(r.runtime);
  assert.equal(f.db.state.curriculumNodeMastery[0].status, 'UNKNOWN'); // One completion is insufficient.
  const secondPlan = await f.loop.prepare(f.prepare), second = await f.loop.launch({ ...f.launch(secondPlan), creationKey: 'second' });
  assert.equal(second.ok, true); assert.deepEqual(f.calls(), { plan: 1, game: 1 });
  await f.play(second.runtime);
  assert.equal(f.db.state.curriculumNodeMastery[0].status, 'MASTERED'); // Source-recall policy only.
  assert.equal((await f.loop.launch({ ...f.launch(p), creationKey: 'stale' })).ok, false);
  const thirdPlan = await f.loop.prepare(f.prepare), third = await f.loop.launch({ ...f.launch(thirdPlan), creationKey: 'third' });
  assert.equal(third.ok, true); assert.equal(third.runtime.difficulty, 'MEDIUM'); assert.deepEqual(f.calls(), { plan: 2, game: 2 });
  assert(thirdPlan.limitations.includes('NO_AUTOMATIC_LEVEL_ADVANCEMENT')); assert.deepEqual(f.db.state.curriculumNode, originalSource);
});
test('skipped games complete presentation without asserting mastery or advancing level', async () => {
  const f = await setup(), p = await f.loop.prepare(f.prepare), r = await f.loop.launch(f.launch(p));
  assert.equal((await f.play(r.runtime, true)).progress.status, 'COMPLETED');
  assert.notEqual(f.db.state.curriculumNodeMastery[0].status, 'MASTERED');
  const next = await f.loop.prepare(f.prepare), launch = await f.loop.launch({ ...f.launch(next), creationKey: 'retry' });
  assert.equal(launch.runtime.adaptiveMode, 'REMEDIATION');
});
for (const [name, overrides] of [
  ['missing reviewed-level policy', { authorizeLevel: undefined }], ['denied level', { authorizeLevel: async () => null }],
  ['denied academic scope', { authorizeLearning: async () => false }], ['missing prerequisites policy', { loadPrerequisites: undefined }]
]) test(`${name} cannot trigger semantic generation`, async () => {
  const f = await setup(false, overrides), before = structuredClone(f.db.state);
  assert.equal((await f.loop.prepare(f.prepare)).ok, false); assert.deepEqual(f.calls(), { plan: 0, game: 0 }); assert.deepEqual(f.db.state, before);
});
test('cross learner tickets and arbitrary academic state are rejected before generation', async () => {
  const f = await setup(), p = await f.loop.prepare(f.prepare), before = structuredClone(f.db.state);
  assert.equal((await f.loop.launch({ ...f.launch(p), learnerId: 'other' })).ok, false);
  for (const extra of [{ difficulty: 'HARD' }, { mastery: 'MASTERED' }, { materials: [] }]) assert.equal((await f.loop.prepare({ ...f.prepare, ...extra })).ok, false);
  assert.deepEqual(f.db.state, before); assert.equal(f.calls().game, 0);
});
test('superseded source or changed import cannot launch an old plan', async () => {
  const f = await setup(), p = await f.loop.prepare(f.prepare);
  f.db.state.curriculumArtifactVersion[0].reviewStatus = 'SUPERSEDED'; const before = structuredClone(f.db.state);
  assert.equal((await f.loop.launch(f.launch(p))).ok, false); assert.equal(f.calls().game, 0); assert.deepEqual(f.db.state, before);
});
test('provider and validator failures leave no game or evidence; public failures contain no provider details', async () => {
  const f = await setup(false, { plannerProvider: { planStructuredGame() { throw Error('SECRET postgres://credentials'); } } });
  const result = await f.loop.prepare(f.prepare); assert.equal(result.ok, false); assert.doesNotMatch(JSON.stringify(result), /SECRET|postgres|credentials|stack/);
  assert.equal(f.db.state.gameSpec.length, 0); assert.equal(f.db.state.gameplayEvidenceEvent.length, 0);
});

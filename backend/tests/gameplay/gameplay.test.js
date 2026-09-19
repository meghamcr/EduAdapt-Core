'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, candidate } = require('../gameGeneration/fixtures/gameFixture');
const { database } = require('../curriculumArtifacts/fixtures/serviceFixture');
const { createGameGenerator } = require('../../src/services/gameGeneration/gameGenerator');
const { createGamePersistenceService } = require('../../src/services/gameGeneration/gamePersistence');
const { createGameplayService } = require('../../src/services/gameplay/gameplaySession');
const { deriveMastery } = require('../../src/services/gameplay/learningEvidence');
const { scoreChallenge } = require('../../src/services/gameplay/gameplayScoring');
const { applyEvent, initialState } = require('../../src/services/gameplay/gameplayState');
const { normalizePrerequisites } = require('../../src/services/adaptiveLearning/prerequisitePolicy');
const { decideAdaptiveLearning } = require('../../src/services/adaptiveLearning/adaptiveDecision');
const oldFetch = globalThis.fetch;
test.before(() => { globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); }; });
test.after(() => { globalThis.fetch = oldFetch; });
async function setup({ type = 'MCQ_CLOZE', two = false, state: learnerEvidence = {} } = {}) {
  const db = database({ includeGameplay: true }), f = await fixture({ db, state: learnerEvidence });
  const input = { context: f.context, decision: f.decision };
  const result = await createGameGenerator({ generateStructuredGame(r) {
    const g = candidate(r); g.challenges[0].type = type; if (type === 'CLOZE') g.challenges[0].options = [];
    if (two) {
      const c = structuredClone(g.challenges[0]); c.id = c.telemetryKey = 'challenge2'; g.challenges.push(c);
      c.prompt.start = r.academicGrounding.evidence[0].text.indexOf('four'); c.prompt.end = c.prompt.start + 4; c.correctAnswer = 'four';
      g.completion.challengeIds.push(c.id); g.telemetry.challengeKeys.push(c.id);
    }
    return g;
  } }).generate(input);
  const stored = await createGamePersistenceService(db).persistValidatedGame({ ...input, result });
  let clock = Date.UTC(2026, 0, 1), token = 0;
  const service = createGameplayService(db, { now: () => new Date(clock += 1000), authorizeExecution: async () => ({ reference: 'TEST_ONLY_CERTIFICATION' }) });
  const learnerId = 'synthetic-learner', gameSpecId = stored.gameSpecId;
  const open = key => service.openSession({ learnerId, gameSpecId, creationKey: key || `open${++token}` });
  const { sessionId } = await open();
  const send = (type, details = {}, sid = sessionId) => service.ingestEvent({ learnerId, sessionId: sid, event: { eventId: `event${++token}`, type, ...details } });
  async function present(sid = sessionId) {
    await send('GAME_STARTED', {}, sid);
    for (const phaseId of ['intro', 'teach', 'practice']) await send(phaseId === 'practice' && f.decision.academicDecision.mode === 'REMEDIATION' ? 'REMEDIATION_STARTED' : 'PHASE_STARTED', { phaseId }, sid);
    await send('CHALLENGE_PRESENTED', { challengeId: 'challenge1' }, sid);
  }
  const state = () => service.loadLearnerState({ learnerId, artifactVersionId: f.context.curriculum.artifactVersionId, nodeId: f.context.curriculum.mappedNodeId });
  db.trace = [];
  return { ...f, db, service, learnerId, gameSpecId, sessionId, send, present, open, state };
}
const rejects = (promise, code) => assert.rejects(promise, e => e.code === code);
test('trusted persisted game session exposes no scoring representation', async () => {
  const f = await setup(), s = await f.open(); assert.deepEqual(Object.keys(s).sort(), ['sessionId', 'status']);
  assert.equal(f.db.state.gameplayEvidenceSession[0].difficulty, 'EASY'); assert.equal(f.db.state.gameplayEvidenceSession[0].runtimeAuthorizationReference, 'TEST_ONLY_CERTIFICATION');
});
test('pending runtime game alone cannot authorize execution', async () => {
  const f = await setup(); await rejects(createGameplayService(f.db).openSession({ learnerId: f.learnerId, gameSpecId: f.gameSpecId, creationKey: 'x' }), 'RUNTIME_AUTHORIZATION_REQUIRED');
});
for (const [name, mutate] of [
  ['historical null grounding', r => { r.curriculumArtifactVersionId = null; }],
  ['checksum mismatch', r => { r.spec.specificationFingerprint = 'bad'; }],
  ['missing provenance', r => { r.spec = {}; }]
]) test(`${name} rejects session creation`, async () => { const f = await setup(); mutate(f.db.state.gameSpec[0]); await rejects(f.open(), 'GAMEPLAY_STORAGE_OR_AUTHORITY_FAILURE'); });
test('stale approval rejects new sessions and events', async () => {
  const f = await setup(); f.db.state.curriculumArtifactVersion[0].reviewStatus = 'SUPERSEDED';
  await rejects(f.open(), 'GAMEPLAY_STORAGE_OR_AUTHORITY_FAILURE'); await rejects(f.send('GAME_STARTED'), 'GAMEPLAY_STORAGE_OR_AUTHORITY_FAILURE');
});
for (const field of ['difficulty', 'curriculumNodeId', 'correct', 'score', 'expectedAnswer', 'attempt', 'responseTimeSec', 'mastery', 'xp']) test(`client ${field} rejected`, async () => {
  const f = await setup(); await rejects(f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0, [field]: 1 }), 'INVALID_FIELDS');
});
for (const type of ['ANSWER_CORRECT', 'ANSWER_INCORRECT', 'CHALLENGE_COMPLETED', 'UNKNOWN']) test(`${type} cannot be asserted by client`, async () => {
  const f = await setup(); await rejects(f.send(type), 'CLIENT_EVENT_NOT_ALLOWED');
});
test('open rejects client-selected difficulty/curriculum', async () => {
  const f = await setup(); for (const extra of ['difficulty', 'artifactVersionId']) await rejects(f.service.openSession({ learnerId: f.learnerId, gameSpecId: f.gameSpecId, creationKey: 'x', [extra]: 'x' }), 'INVALID_FIELDS');
});
test('session key retry idempotent', async () => { const f = await setup(); assert.deepEqual(await f.open('repeat'), await f.open('repeat')); });
test('answer before presentation fails', async () => { const f = await setup(); await f.send('GAME_STARTED'); await rejects(f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }), 'CHALLENGE_NOT_ACTIVE'); });
test('phase and challenge sequence cannot be skipped', async () => {
  const f = await setup({ two: true }); await f.send('GAME_STARTED'); await rejects(f.send('PHASE_STARTED', { phaseId: 'practice' }), 'PHASE_ORDER');
  await rejects(f.send('CHALLENGE_PRESENTED', { challengeId: 'challenge2' }), 'CHALLENGE_ORDER');
});
test('unknown challenge rejected', async () => { const f = await setup(); await f.present(); await rejects(f.send('ANSWER_SUBMITTED', { challengeId: 'unknown', response: 0 }), 'UNKNOWN_CHALLENGE'); });
test('MCQ deterministic scoring, derived outcomes and attempts', async () => {
  const f = await setup(); await f.present();
  const wrong = await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 1 });
  const right = await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 });
  assert.equal(wrong.correctness, false); assert.equal(wrong.attempt, 1); assert.equal(right.correctness, true); assert.equal(right.attempt, 2);
  assert.deepEqual(right.derivedTypes, ['ANSWER_CORRECT', 'CHALLENGE_COMPLETED']);
  assert.equal(JSON.stringify(right).includes('eight'), false);
  const state = await f.state(); assert.equal(state.observations[0].mistakes, 1); assert.equal(state.observations[0].attempts, 2);
});
test('MCQ malformed and out of range selections rejected', async () => {
  const f = await setup(); await f.present(); for (const response of ['eight', 3]) await rejects(f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response }), 'INVALID_OPTION');
});
test('CLOZE has explicit identity normalization, case/space significant', async () => {
  const f = await setup({ type: 'CLOZE' }); await f.present();
  for (const response of ['Eight', ' eight ', 'eight']) { const r = await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response }); assert.equal(r.correctness, response === 'eight'); }
});
test('unsupported challenge scoring fails closed', () => { assert.throws(() => scoreChallenge({ type: 'ESSAY' }, 'x'), /UNSUPPORTED_CHALLENGE/); });
test('duplicate correct submission returns same receipt without double evidence', async () => {
  const f = await setup(); await f.present(); const event = { eventId: 'once', type: 'ANSWER_SUBMITTED', challengeId: 'challenge1', response: 0 };
  const input = { learnerId: f.learnerId, sessionId: f.sessionId, event };
  const a = await f.service.ingestEvent(input), before = structuredClone(f.db.state);
  assert.deepEqual(await f.service.ingestEvent(input), a); assert.deepEqual(f.db.state, before);
  await rejects(f.service.ingestEvent({ ...input, event: { ...event, response: 1 } }), 'EVENT_KEY_CONFLICT');
});
test('wrong attempts increment but duplicate delivery does not', async () => {
  const f = await setup(); await f.present(); const event = { eventId: 'wrong', type: 'ANSWER_SUBMITTED', challengeId: 'challenge1', response: 1 };
  const input = { learnerId: f.learnerId, sessionId: f.sessionId, event };
  assert.equal((await f.service.ingestEvent(input)).attempt, 1); assert.equal((await f.service.ingestEvent(input)).attempt, 1);
  assert.equal((await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 1 })).attempt, 2);
});
test('completed challenge cannot restart', async () => {
  const f = await setup(); await f.present(); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 });
  await rejects(f.send('CHALLENGE_PRESENTED', { challengeId: 'challenge1' }), 'CHALLENGE_ORDER');
});
test('hint requests preserved and do not mean incorrect', async () => {
  const f = await setup(); await f.present(); await f.send('HINT_REQUESTED', { challengeId: 'challenge1' }); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 });
  const s = await f.state(); assert.equal(s.observations[0].hintsUsed, 1); assert.equal(s.observations[0].correctness, true); assert.equal(s.mastery.status, 'UNKNOWN');
});
test('skip retains unknown correctness and no invented attempts', async () => {
  const f = await setup(); await f.present(); await f.send('CHALLENGE_SKIPPED', { challengeId: 'challenge1' }); const s = await f.state();
  assert.equal(s.observations[0].correctness, null); assert.equal(s.observations[0].attempts, null); assert.equal(s.observations[0].skipped, true); assert.equal(s.mastery.status, 'UNKNOWN');
});
test('completion only after complete phase, terminal events rejected', async () => {
  const f = await setup(); await f.present(); await rejects(f.send('GAME_COMPLETED'), 'GAME_INCOMPLETE');
  await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }); await f.send('PHASE_STARTED', { phaseId: 'complete' }); await f.send('GAME_COMPLETED');
  await rejects(f.send('GAME_ABANDONED'), 'SESSION_TERMINAL');
});
test('abandonment preserves partial attempts, then rejects normal events', async () => {
  const f = await setup(); await f.present(); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 1 }); await f.send('GAME_ABANDONED');
  const s = await f.state(); assert.equal(s.observations[0].abandoned, true); assert.equal(s.observations[0].completion, false);
  await rejects(f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }), 'SESSION_TERMINAL');
});
test('another learner cannot submit a session interaction', async () => {
  const f = await setup(); await rejects(f.service.ingestEvent({ learnerId: 'other', sessionId: f.sessionId, event: { eventId: 'x', type: 'GAME_STARTED' } }), 'SESSION_NOT_FOUND');
});
test('one correct response and fast timing do not establish mastery', async () => {
  const f = await setup(); await f.present(); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 });
  const s = await f.state(); assert.equal(s.mastery.status, 'UNKNOWN'); assert.equal(s.observations[0].responseTimeSec, 1);
});
test('multiple sessions and challenges establish conservative recall mastery', async () => {
  const f = await setup({ two: true });
  for (const sid of [f.sessionId, (await f.open()).sessionId]) {
    await f.present(sid); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }, sid);
    await f.send('CHALLENGE_PRESENTED', { challengeId: 'challenge2' }, sid); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge2', response: 1 }, sid);
  }
  const s = await f.state(); assert.equal(s.mastery.status, 'MASTERED'); assert.equal(s.observations.length, 4);
  const scope = { learnerId: f.learnerId, artifactVersionId: f.context.curriculum.artifactVersionId, nodeId: f.context.curriculum.nodeId };
  const d = decideAdaptiveLearning({ context: f.context, learnerState: s, prerequisites: normalizePrerequisites({ ...scope, requirements: [] }) });
  assert.equal(d.instructionalDecision.difficulty, 'MEDIUM');
});
test('repeated struggle flags node mastery gap', async () => {
  const f = await setup(); for (const sid of [f.sessionId, (await f.open()).sessionId]) {
    await f.present(sid); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 1 }, sid); await f.send('GAME_ABANDONED', {}, sid);
  }
  assert.equal((await f.state()).mastery.status, 'NOT_MASTERED');
});
test('completion, speed and XP alone cannot establish mastery', () => {
  const observations = Array.from({ length: 5 }, (_, i) => ({ completion: true, responseTimeSec: 0, xp: 999, provenance: { sessionId: String(i), challengeId: String(i) } }));
  assert.equal(deriveMastery(observations).status, 'UNKNOWN');
});
for (const [name, mutate] of [
  ['event correctness', f => { f.db.state.gameplayEvidenceEvent.at(-1).correctness = false; }],
  ['event order', f => { f.db.state.gameplayEvidenceEvent.at(-1).scopeSequence = 999; }],
  ['event payload', f => { f.db.state.gameplayEvidenceEvent.at(-1).payload.response = 1; }],
  ['session checksum', f => { f.db.state.gameplayEvidenceSession[0].specificationChecksum = 'bad'; }],
  ['mastery projection', f => { f.db.state.curriculumNodeMastery[0].status = 'MASTERED'; }]
]) test(`tampered ${name} rejected by learner adapter`, async () => {
  const f = await setup(); await f.present(); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }); mutate(f); await assert.rejects(f.state());
});
test('transaction failure rolls back event, session and mastery; retry safe', async () => {
  const f = await setup(); await f.present(); const before = structuredClone(f.db.state);
  f.db.hook = async (name, op) => { if (name === 'curriculumNodeMastery' && op === 'update') throw new Error('private'); };
  await rejects(f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }), 'GAMEPLAY_STORAGE_OR_AUTHORITY_FAILURE'); assert.deepEqual(f.db.state, before);
  f.db.hook = null; assert.equal((await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 })).attempt, 1);
});
test('concurrent duplicate deliveries produce one event/evidence update', async () => {
  const f = await setup(); await f.present(); const input = { learnerId: f.learnerId, sessionId: f.sessionId, event: { eventId: 'concurrent', type: 'ANSWER_SUBMITTED', challengeId: 'challenge1', response: 0 } };
  const results = await Promise.all(Array.from({ length: 4 }, () => f.service.ingestEvent(input)));
  assert.ok(results.every(r => r.attempt === 1)); assert.equal(f.db.state.gameplayEvidenceEvent.filter(e => e.eventKey === 'concurrent').length, 1);
});
test('no curriculum, legacy mastery, gamification or network writes', async () => {
  const f = await setup(), before = structuredClone(f.db.state); await f.present(); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 });
  for (const name of Object.keys(before).filter(n => !['gameplayEvidenceSession', 'gameplayEvidenceEvent', 'curriculumNodeMastery'].includes(n))) assert.deepEqual(f.db.state[name], before[name]);
  const writes = f.db.trace.filter(e => ['create','update','updateMany'].includes(e.operation)); assert.ok(writes.every(e => ['gameplayEvidenceSession','gameplayEvidenceEvent','curriculumNodeMastery'].includes(e.name)));
});
test('remediation event is meaningful and retained without fabricated misconceptions', async () => {
  const f = await setup({ state: { mastery: { status: 'NOT_MASTERED', sampleSize: 3 } } }); await f.present();
  await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 });
  assert.ok(f.db.state.gameplayEvidenceEvent.some(e => e.type === 'REMEDIATION_STARTED' && e.derivedTypes.includes('PHASE_STARTED')));
  const s = await f.state(); assert.equal(s.observations[0].misconceptionCodes, null); assert.equal(s.mastery.status, 'UNKNOWN');
});
test('repeated identical task across sessions cannot alone claim mastery', async () => {
  const f = await setup(); for (const sid of [f.sessionId, (await f.open()).sessionId, (await f.open()).sessionId]) {
    await f.present(sid); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }, sid);
  }
  assert.equal((await f.state()).mastery.status, 'UNKNOWN');
});
test('ordered durable recent window feeds Phase 3C and retains raw provenance', async () => {
  const f = await setup({ two: true });
  for (const sid of [f.sessionId, (await f.open()).sessionId, (await f.open()).sessionId]) {
    await f.present(sid); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }, sid);
    await f.send('CHALLENGE_PRESENTED', { challengeId: 'challenge2' }, sid); await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge2', response: 1 }, sid);
  }
  const s = await f.state(); assert.equal(s.observations.length, 5);
  const events = f.db.state.gameplayEvidenceEvent.filter(e => e.correctness === true); assert.equal(events.length, 6);
  assert.ok(s.observations[0].id.endsWith('challenge2'));
  assert.equal(f.db.state.gameplayEvidenceSession[0].specificationChecksum, f.db.state.gameSpec[0].spec.specificationFingerprint);
  assert.deepEqual(f.db.state.gameSpec[0].spec.game.learningObjectiveRefs, []);
});
test('serialization retry replays whole transaction without duplicate observations', async () => {
  const f = await setup(); await f.present(); let first = true;
  f.db.hook = async (name, op) => { if (name === 'curriculumNodeMastery' && op === 'update' && first) { first = false; throw Object.assign(new Error('retry'), { code: 'P2034' }); } };
  await f.send('ANSWER_SUBMITTED', { challengeId: 'challenge1', response: 0 }); assert.equal((await f.state()).observations.length, 1);
});
test('bounded conflict retries stop safely', async () => {
  const f = await setup(); f.db.hook = async (name, op) => { if (name === 'gameplayEvidenceEvent' && op === 'create') throw Object.assign(new Error('retry'), { code: 'P2034' }); };
  await rejects(f.send('GAME_STARTED'), 'GAMEPLAY_CONFLICT'); assert.equal(f.db.state.gameplayEvidenceEvent.length, 0);
});
test('empty evidence returns normalized conservative cold start', async () => {
  const f = await setup(); const s = await f.state(); assert.deepEqual(s.observations, []); assert.equal(s.previousDifficulty, null); assert.equal(s.mastery.status, 'UNKNOWN');
});
test('cold start still requires a real approved mapped curriculum scope', async () => {
  const f = await setup(); await rejects(f.service.loadLearnerState({ learnerId: f.learnerId, artifactVersionId: 'unknown', nodeId: 'unknown' }), 'GAMEPLAY_STORAGE_OR_AUTHORITY_FAILURE');
});
test('clock reversal rejected, not converted to zero-duration evidence', () => {
  const game = { phases: [], challenges: [] };
  const state = applyEvent(game, initialState(), { type: 'GAME_STARTED' }, 1000).state;
  assert.throws(() => applyEvent(game, state, { type: 'GAME_ABANDONED' }, 999), /CLOCK_NOT_MONOTONIC/);
});
test('mastery projection corruption is not silently repaired on event ingestion', async () => {
  const f = await setup(); f.db.state.curriculumNodeMastery[0].status = 'MASTERED';
  await rejects(f.send('GAME_STARTED'), 'MASTERY_PROJECTION_DRIFT'); assert.equal(f.db.state.gameplayEvidenceEvent.length, 0);
});
test('pure timing changes cannot change mastery interpretation', () => {
  const base = Array.from({ length: 4 }, (_, i) => ({ correctness: true, completion: true, skipped: false, abandoned: false, attempts: 1, hintsUsed: 0, mistakes: 0,
    provenance: { taskFingerprint: String(i % 2), sessionId: String(i), remediation: false } }));
  assert.deepEqual(deriveMastery(base.map(o => ({ ...o, responseTimeSec: 0 }))), deriveMastery(base.map(o => ({ ...o, responseTimeSec: 86400 }))));
});

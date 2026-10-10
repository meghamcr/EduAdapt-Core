'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http');
const { fixture, planCandidate, twoChallenges } = require('../gamePlanning/fixtures/plannerFixture');
const { createRuntimeHttpServer } = require('../../src/http/runtimeApi');
const { RUNTIME_VERSION } = require('../../src/services/gameplay/runtimeProjection');
async function setup(t, { story = false, overrides = {} } = {}) {
  const f = await fixture({ story }); let plans = 0, games = 0;
  const server = createRuntimeHttpServer({ db: f.db,
    resolveActor: async ({ bearerToken }) => bearerToken === 'synthetic-token' ? { learnerId: 'synthetic-learner', role: 'STUDENT' } : bearerToken === 'other-token' ? { learnerId: 'other', role: 'STUDENT' } : null,
    authorizeExecution: async () => ({ reference: 'SYNTHETIC_EXECUTION_ONLY' }),
    learning: { plannerProvider: { planStructuredGame(r) { plans++; return planCandidate(r); } },
      provider: { generateStructuredGame(r) { games++; return twoChallenges(r.originalRequest || r); } },
      authorizeLevel: async ({ learnerId, actor }) => learnerId === actor.learnerId ? { reference: 'SYNTHETIC_LEVEL_POLICY' } : null,
      authorizeLearning: async ({ learnerId, actor }) => learnerId === actor.learnerId,
      loadPrerequisites: async () => [] }, ...overrides });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  function request(path, body, token = 'synthetic-token') {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method: 'POST', agent: false,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks)) }));
      });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(Error('LOCAL_TEST_TIMEOUT'))); req.end(JSON.stringify(body));
    });
  }
  const prepare = { curriculumArtifactVersionId: f.versionId, levelId: f.levelId, language: 'en' };
  return { ...f, request, prepare, calls: () => ({ plans, games }) };
}
for (const story of [false, true]) test(`${story ? 'contextual passage' : 'mathematical source'} authenticated HTTP level → notes → plan → launch → event → restore`, async t => {
  const f = await setup(t, { story });
  const catalogue = await f.request('/api/learning/levels', { curriculumArtifactVersionId: f.versionId });
  assert.equal(catalogue.status, 200); assert.equal(catalogue.data.levels[0].levelId, f.levelId);
  const p = await f.request('/api/learning/plans', f.prepare); assert.equal(p.status, 200); assert.equal(p.data.status, 'READY'); assert(p.data.notes.length);
  assert.deepEqual((await f.request('/api/learning/plans', f.prepare)).data, p.data);
  const launch = { planId: p.data.planId, gameId: p.data.games[0].id, creationKey: 'http-launch', runtimeVersion: RUNTIME_VERSION };
  const r = await f.request('/api/learning/launch', launch); assert.equal(r.status, 200); assert.equal(r.data.runtimeVersion, RUNTIME_VERSION);
  assert.deepEqual((await f.request('/api/learning/launch', launch)).data, r.data); assert.deepEqual(f.calls(), { plans: 1, games: 1 });
  assert.doesNotMatch(JSON.stringify(r.data), /correctAnswer|materialIndexes|storedPackage|sourceRegistry|specificationFingerprint/);
  const url = `/api/runtime/sessions/${r.data.sessionId}`; let count = 0;
  const event = async (type, extra = {}) => {
    const result = await f.request(`${url}/events`, { runtimeVersion: RUNTIME_VERSION, event: { eventId: `http-${++count}`, type, ...extra } });
    assert.equal(result.status, 200); return result.data;
  };
  await event('GAME_STARTED');
  for (const phase of r.data.phases) {
    await event('PHASE_STARTED', { phaseId: phase.id });
    for (const challenge of r.data.challenges.filter(c => c.phaseId === phase.id)) {
      await event('CHALLENGE_PRESENTED', { challengeId: challenge.id });
      const receipt = await event('ANSWER_SUBMITTED', { challengeId: challenge.id, response: challenge.choices.indexOf(challenge.id === 'challenge1' ? 'eight' : 'four') });
      assert.equal(receipt.correctness, true);
    }
  }
  assert.equal((await event('GAME_COMPLETED')).progress.status, 'COMPLETED');
  assert.equal((await f.request(`${url}/restore`, { runtimeVersion: RUNTIME_VERSION })).data.progress.status, 'COMPLETED');
  assert.equal(f.db.state.curriculumNodeMastery[0].status, 'UNKNOWN');
});
test('HTTP rejects identity spoofing, foreign tickets and disabled learning composition', async t => {
  const f = await setup(t); const before = structuredClone(f.db.state);
  assert.equal((await f.request('/api/learning/plans', { ...f.prepare, learnerId: 'other' })).status, 400);
  assert.equal((await f.request('/api/learning/plans', f.prepare, 'invalid')).status, 401);
  assert.deepEqual(f.db.state, before); assert.deepEqual(f.calls(), { plans: 0, games: 0 });
  const p = await f.request('/api/learning/plans', f.prepare);
  const bad = await f.request('/api/learning/launch', { planId: p.data.planId, gameId: p.data.games[0].id, creationKey: 'x', runtimeVersion: RUNTIME_VERSION }, 'other-token');
  assert.equal(bad.status, 409); assert.equal(f.calls().games, 0);
  const disabled = await setup(t, { overrides: { learning: undefined } });
  assert.equal((await disabled.request('/api/learning/levels', { curriculumArtifactVersionId: disabled.versionId })).status, 503);
});
test('HTTP rechecks authority and does not expose planner validation or exception text', async t => {
  const f = await setup(t); f.db.state.curriculumArtifactVersion[0].reviewStatus = 'UNREVIEWED';
  const result = await f.request('/api/learning/plans', f.prepare);
  assert.equal(result.status, 409); assert.deepEqual(result.data, { error: { code: 'LEARNING_REQUEST_REJECTED' } });
  assert.deepEqual(f.calls(), { plans: 0, games: 0 });
});

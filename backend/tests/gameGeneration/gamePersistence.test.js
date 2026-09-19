'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, candidate, strong, buildGenerationRequest } = require('./fixtures/gameFixture');
const { database } = require('../curriculumArtifacts/fixtures/serviceFixture');
const { createGameGenerator } = require('../../src/services/gameGeneration/gameGenerator');
const { createGamePersistenceService, STATUS } = require('../../src/services/gameGeneration/gamePersistence');
const { createGenerationContextService } = require('../../src/services/gameGeneration/generationContext');
const { normalizeLearnerState } = require('../../src/services/adaptiveLearning/learnerStateProvider');
const { normalizePrerequisites } = require('../../src/services/adaptiveLearning/prerequisitePolicy');
const { decideAdaptiveLearning } = require('../../src/services/adaptiveLearning/adaptiveDecision');

const oldFetch = globalThis.fetch;
test.before(() => { globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); }; });
test.after(() => { globalThis.fetch = oldFetch; });
function decisionFor(context, state = {}, requirements = []) {
  const scope = { learnerId: state.learnerId || 'synthetic-learner', artifactVersionId: context.curriculum.artifactVersionId, nodeId: context.curriculum.nodeId };
  return decideAdaptiveLearning({ context, learnerState: normalizeLearnerState({ ...scope, ...state }), prerequisites: normalizePrerequisites({ ...scope, requirements }) });
}
async function setup(options = {}) {
  const db = database({ includeGameSpec: true }), f = await fixture({ ...options, db });
  const input = { context: f.context, decision: f.decision };
  const result = await createGameGenerator({ generateStructuredGame: candidate }).generate(input);
  assert.equal(result.ok, true);
  return { db, input, result, service: createGamePersistenceService(db) };
}
const persist = f => f.service.persistValidatedGame({ ...f.input, result: f.result });
const reject = (promise, code) => assert.rejects(promise, e => e.code === code);

test('valid issued package persists exactly its validated spec with provenance', async () => {
  const f = await setup(), out = await persist(f), row = f.db.state.gameSpec[0];
  assert.equal(out.reused, false); assert.equal(row.status, STATUS); assert.equal(row.renderingMode, 'ENGINE_NEUTRAL');
  assert.deepEqual(row.spec.game, f.result.package.game); assert.equal(row.curriculumArtifactVersionId, f.input.context.curriculum.artifactVersionId);
  assert.equal(row.curriculumNodeId, f.input.context.curriculum.mappedNodeId); assert.equal(row.spec.specificationFingerprint, f.result.package.specificationFingerprint);
  assert.equal(row.spec.requestFingerprint, f.result.package.requestFingerprint);
  assert.throws(() => { out.storedPackage.game.metadata.title = 'changed'; }, TypeError);
});
test('exact retry idempotent with immutable original row', async () => {
  const f = await setup(), first = await persist(f), snapshot = structuredClone(f.db.state.gameSpec);
  const second = await persist(f); assert.equal(second.reused, true); assert.equal(first.gameSpecId, second.gameSpecId);
  assert.deepEqual(f.db.state.gameSpec, snapshot);
});
for (const [name, change] of [
  ['raw candidate', (f, i) => { i.result = f.result.package.game; }],
  ['invalid candidate', (f, i) => { i.result = { ok: true, package: { game: {} } }; }],
  ['caller-declared validation', (f, i) => { i.result = { validated: true, ...structuredClone(f.result) }; }],
  ['JSON-cloned result', (f, i) => { i.result = structuredClone(f.result); }],
  ['checksum mismatch', (f, i) => { i.result = structuredClone(f.result); i.result.package.specificationFingerprint = 'bad'; }],
  ['replaced spec', (f, i) => { i.result = structuredClone(f.result); i.result.package.game.claims[0].text = 'Invented'; }],
  ['missing artifact identity', (f, i) => { i.context = structuredClone(i.context); delete i.context.curriculum.artifactVersionId; Object.freeze(i.context); }],
  ['missing node identity', (f, i) => { i.context = structuredClone(i.context); delete i.context.curriculum.mappedNodeId; Object.freeze(i.context); }],
  ['forged decision', (f, i) => { i.decision = Object.freeze(structuredClone(i.decision)); }],
  ['forged context', (f, i) => { i.context = Object.freeze(structuredClone(i.context)); }]
]) test(`${name} rejected before transaction`, async () => {
  const f = await setup(), input = { ...f.input, result: f.result }; change(f, input); f.db.trace = [];
  await reject(f.service.persistValidatedGame(input), 'TRUSTED_GENERATION_INPUT_REQUIRED'); assert.deepEqual(f.db.trace, []);
});
test('swapped genuine adaptive decision rejected even if HOW happens to match', async () => {
  const f = await setup(), decision = decisionFor(f.input.context, { learnerId: 'another' });
  await reject(f.service.persistValidatedGame({ ...f.input, decision, result: f.result }), 'GENERATION_INPUT_BINDING_MISMATCH');
});
test('swapped genuine context rejected', async () => {
  const f = await setup(), other = await setup({ nodeId: 'another' });
  await reject(f.service.persistValidatedGame({ ...other.input, result: f.result }), 'GENERATION_INPUT_BINDING_MISMATCH');
});
test('arbitrary caller fields and learner records are not accepted', async () => {
  const f = await setup();
  for (const field of ['teacherId', 'authorized', 'learnerRecords', 'difficulty', 'academicText']) {
    await reject(f.service.persistValidatedGame({ ...f.input, result: f.result, [field]: true }), 'PERSISTENCE_INPUT_INVALID');
  }
});
for (const status of ['UNREVIEWED', 'IN_REVIEW', 'REJECTED', 'SUPERSEDED']) test(`${status} at write time fails closed`, async () => {
  const f = await setup(); f.db.state.curriculumArtifactVersion[0].reviewStatus = status;
  await reject(persist(f), 'CURRICULUM_AUTHORITY_RECHECK_FAILED'); assert.equal(f.db.state.gameSpec.length, 0);
});
for (const [name, mutate] of [
  ['missing artifact', db => { db.state.curriculumArtifactVersion = []; }],
  ['missing successful import', db => { db.state.curriculumArtifactImport = []; }],
  ['missing mapping', db => { delete db.state.curriculumArtifactImport[0].nodeMapping.worked; }],
  ['mapped node mismatch', db => { db.state.curriculumArtifactImport[0].nodeMapping.worked = 'other'; }],
  ['missing materialized node', db => { db.state.curriculumNode = db.state.curriculumNode.filter(n => n.id !== 'worked'); }],
  ['book scope drift', db => { db.state.curriculumBook[0].edition = 'different'; }],
  ['chapter drift', db => { db.state.curriculumChapter[0].title = 'different'; }],
  ['node content drift', db => { db.state.curriculumNode[0].content = 'different'; }],
  ['artifact checksum drift', db => { db.state.curriculumArtifactVersion[0].artifactChecksum = 'bad'; }],
  ['content fingerprint drift', db => { db.state.curriculumArtifactVersion[0].contentFingerprint = 'bad'; }],
  ['source fingerprint drift', db => { db.state.curriculumArtifactVersion[0].sourceFingerprint = 'bad'; }],
  ['snapshot drift', db => { db.state.curriculumArtifactVersion[0].snapshot.nodes[0].title = 'bad'; }]
]) test(`${name} blocks persistence`, async () => {
  const f = await setup(); mutate(f.db);
  await reject(persist(f), 'CURRICULUM_AUTHORITY_RECHECK_FAILED'); assert.equal(f.db.state.gameSpec.length, 0);
});
test('exact compatible game reusable after fresh authority check', async () => {
  const f = await setup(), first = await persist(f); f.db.trace = [];
  const found = await f.service.findReusableGame(f.input); assert.equal(found.gameSpecId, first.gameSpecId);
  assert.ok(f.db.trace.some(e => e.operation === 'lock'));
  assert.equal(f.db.trace.some(e => ['create', 'update', 'updateMany'].includes(e.operation)), false);
});
test('reuse does not include learner identity', async () => {
  const f = await setup(); await persist(f);
  const decision = decisionFor(f.input.context, { learnerId: 'another-learner' });
  assert.ok(await f.service.findReusableGame({ ...f.input, decision }));
  assert.equal(JSON.stringify(f.db.state.gameSpec).includes('synthetic-learner'), false);
});
test('different artifact is not reusable even with same titles', async () => {
  const a = await setup(), b = await setup({ nodeId: 'different' }); await persist(a);
  b.db.state.gameSpec = structuredClone(a.db.state.gameSpec);
  assert.equal(await b.service.findReusableGame(b.input), null);
});
test('same artifact different node cannot reuse selected-node game', async () => {
  const f = await setup(); await persist(f);
  const rootId = f.input.context.curriculum.hierarchyPath[0].nodeId;
  const context = await createGenerationContextService(f.db).build({ curriculumArtifactVersionId: f.input.context.curriculum.artifactVersionId, curriculumNodeId: rootId });
  assert.equal(await f.service.findReusableGame({ context, decision: decisionFor(context) }), null);
});
for (const [name, state] of [
  ['different difficulty', { previousDifficulty: 'MEDIUM', observations: strong }],
  ['different adaptive mode', { mastery: { status: 'NOT_MASTERED', sampleSize: 3 } }],
  ['different scaffolding', { previousDifficulty: 'HARD', observations: strong }]
]) test(`${name} not reusable`, async () => {
  const f = await setup(); await persist(f);
  assert.equal(await f.service.findReusableGame({ ...f.input, decision: decisionFor(f.input.context, state) }), null);
});
for (const [name, mutate] of [
  ['storage contract mismatch', r => { r.spec.storageVersion = 'future'; }],
  ['generation contract mismatch', r => { r.spec.generationContractVersion = 'future'; }],
  ['adaptive contract mismatch', r => { r.spec.adaptivePolicyVersion = 'future'; }],
  ['checksum invalid', r => { r.spec.specificationFingerprint = 'bad'; }],
  ['request checksum invalid', r => { r.spec.requestFingerprint = 'bad'; }],
  ['source provenance invalid', r => { r.spec.academicGrounding.contentFingerprint = 'bad'; }],
  ['invalid stored answer', r => { r.spec.game.challenges[0].correctAnswer = 'ten'; }],
  ['row version mismatch', r => { r.version = 2; }],
  ['row subject mismatch', r => { r.subject = 'other'; }],
  ['runtime status not certified here', r => { r.status = 'READY'; }],
  ['malformed stored JSON', r => { r.spec = 'not-json'; }]
]) test(`${name} prevents reuse without repair`, async () => {
  const f = await setup(); await persist(f); mutate(f.db.state.gameSpec[0]); const before = structuredClone(f.db.state.gameSpec);
  assert.equal(await f.service.findReusableGame(f.input), null); assert.deepEqual(f.db.state.gameSpec, before);
});
test('stale approval blocks reuse, including an otherwise valid stored spec', async () => {
  const f = await setup(); await persist(f); f.db.state.curriculumArtifactVersion[0].reviewStatus = 'SUPERSEDED';
  await reject(f.service.findReusableGame(f.input), 'CURRICULUM_AUTHORITY_RECHECK_FAILED');
});
test('historical null-grounding rows preserved and never reused', async () => {
  const f = await setup(); const legacy = { id: 'old', slug: 'old', title: 'Source Quest', curriculumArtifactVersionId: null, curriculumNodeId: null, status: 'READY', spec: { question: 'old' } };
  f.db.state.gameSpec.push(legacy); assert.equal(await f.service.findReusableGame(f.input), null);
  await persist(f); assert.deepEqual(f.db.state.gameSpec[0], legacy);
});
test('new variants create separate rows without overwriting old specifications', async () => {
  const f = await setup(), first = await persist(f), before = structuredClone(f.db.state.gameSpec[0]);
  const result = await createGameGenerator({ generateStructuredGame(r) { const g = candidate(r); g.metadata.title = 'Discovery Trail'; return g; } }).generate(f.input);
  const second = await f.service.persistValidatedGame({ ...f.input, result }); assert.notEqual(first.slug, second.slug);
  assert.equal(f.db.state.gameSpec.length, 2); assert.deepEqual(f.db.state.gameSpec[0], before);
  assert.equal((await f.service.findReusableGame(f.input)).slug, [first.slug, second.slug].sort()[0]);
});
test('corrupt existing deterministic slug is never overwritten', async () => {
  const f = await setup(); await persist(f); f.db.state.gameSpec[0].spec.specificationFingerprint = 'bad';
  await reject(persist(f), 'IMMUTABLE_GAME_CONFLICT'); assert.equal(f.db.state.gameSpec[0].spec.specificationFingerprint, 'bad');
});
test('concurrent exact requests converge on one unique slug in transactional fake', async () => {
  const f = await setup(), results = await Promise.all(Array.from({ length: 8 }, () => persist(f)));
  assert.equal(f.db.state.gameSpec.length, 1); assert.equal(new Set(results.map(r => r.gameSpecId)).size, 1);
  assert.equal(results.filter(r => !r.reused).length, 1);
});
for (const code of ['P2034', 'P2002']) test(`${code} causes full bounded transaction retry`, async () => {
  const f = await setup(); let injected = false;
  f.db.hook = async (name, op) => { if (name === 'gameSpec' && op === 'create' && !injected) { injected = true; throw Object.assign(new Error('private'), { code }); } };
  await persist(f); assert.equal(f.db.state.gameSpec.length, 1);
  assert.equal(f.db.trace.filter(e => e.operation === 'transaction').length, 2);
  assert.equal(f.db.trace.filter(e => e.operation === 'lock').length, 2);
});
test('persistent serialization conflict stops after three transaction attempts', async () => {
  const f = await setup(); f.db.hook = async (name, op) => { if (name === 'gameSpec' && op === 'create') throw Object.assign(new Error('private'), { code: 'P2034' }); };
  await reject(persist(f), 'PERSISTENCE_CONFLICT_RETRY_EXHAUSTED');
  assert.equal(f.db.trace.filter(e => e.operation === 'transaction').length, 3); assert.equal(f.db.state.gameSpec.length, 0);
});
test('failed create rolls back, safe error does not leak DB details', async () => {
  const f = await setup(), before = structuredClone(f.db.state);
  f.db.hook = async (name, op) => { if (name === 'gameSpec' && op === 'create') throw new Error('synthetic-secret-canary'); };
  await reject(persist(f), 'PERSISTENCE_DATABASE_FAILURE'); assert.deepEqual(f.db.state, before);
});
test('approval changed before transaction executes is caught', async () => {
  const f = await setup(), tx = f.db.$transaction;
  f.db.$transaction = async (...args) => { f.db.state.curriculumArtifactVersion[0].reviewStatus = 'REJECTED'; return tx(...args); };
  await reject(persist(f), 'CURRICULUM_AUTHORITY_RECHECK_FAILED'); assert.equal(f.db.state.gameSpec.length, 0);
});
test('only GameSpec create occurs; no curriculum, learner, XP or telemetry writes', async () => {
  const f = await setup(), before = structuredClone(f.db.state); await persist(f);
  const mutations = f.db.trace.filter(e => ['create', 'update', 'updateMany', 'upsert', 'deleteMany'].includes(e.operation));
  assert.deepEqual(mutations.map(e => [e.name, e.operation]), [['gameSpec', 'create']]);
  for (const name of Object.keys(before).filter(n => n !== 'gameSpec')) assert.deepEqual(f.db.state[name], before[name]);
  assert.ok(f.db.trace.filter(e => e.operation === 'transaction').every(e => e.options.isolationLevel === 'Serializable'));
});
test('result marked failed is never a persistence input', async () => {
  const f = await setup(); const result = await createGameGenerator({ generateStructuredGame() { return {}; } }, { maxRepairs: 0 }).generate(f.input);
  await reject(f.service.persistValidatedGame({ ...f.input, result }), 'TRUSTED_GENERATION_INPUT_REQUIRED');
});

test('separately grounded prerequisite persists against prerequisite node and rechecks both contexts', async () => {
  const f = await setup(), context = f.input.context;
  const root = await createGenerationContextService(f.db).build({ curriculumArtifactVersionId: context.curriculum.artifactVersionId, curriculumNodeId: context.curriculum.hierarchyPath[0].nodeId });
  const decision = decisionFor(context, {}, [{ relationshipId: 'reviewed-edge', approvedBy: 'reviewer', artifactVersionId: root.curriculum.artifactVersionId, nodeId: root.curriculum.nodeId, masteryStatus: 'UNKNOWN' }]);
  const input = { context, decision, prerequisite: { context: root, decision: decisionFor(root) } };
  const result = await createGameGenerator({ generateStructuredGame(r) {
    const g = candidate(r), c = g.challenges[0], text = r.academicGrounding.evidence[0].text;
    c.type = 'CLOZE'; c.options = []; c.prompt.start = 0; c.prompt.end = text.indexOf(' '); c.correctAnswer = text.slice(0, c.prompt.end); return g;
  } }).generate(input);
  assert.equal(result.ok, true); f.db.trace = [];
  const out = await f.service.persistValidatedGame({ ...input, result });
  assert.equal(f.db.state.gameSpec[0].curriculumNodeId, root.curriculum.mappedNodeId);
  assert.equal(out.storedPackage.game.academicMode, 'PREREQUISITE');
  assert.equal(out.storedPackage.academicGrounding.prerequisiteFor.nodeId, context.curriculum.nodeId);
  assert.equal(f.db.trace.filter(e => e.operation === 'lock').length, 2);
  assert.ok(await f.service.findReusableGame(input));
});
test('unique slug conflict from another committed writer converges on that row', async () => {
  const f = await setup(); let collision = true;
  f.db.hook = async (name, op, args) => {
    if (name === 'gameSpec' && op === 'create' && collision) {
      collision = false;
      // Simulates a competing transaction that committed after our snapshot.
      f.db.state.gameSpec.push({ id: 'competing-writer', ...structuredClone(args.data) });
      throw Object.assign(new Error('synthetic slug conflict'), { code: 'P2002' });
    }
  };
  const out = await persist(f); assert.equal(out.gameSpecId, 'competing-writer'); assert.equal(out.reused, true); assert.equal(f.db.state.gameSpec.length, 1);
});
test('authority is rechecked after serialization retry', async () => {
  const f = await setup(); let conflict = true;
  f.db.hook = async (name, op) => {
    if (name === 'gameSpec' && op === 'create' && conflict) {
      conflict = false; f.db.state.curriculumArtifactVersion[0].reviewStatus = 'SUPERSEDED';
      throw Object.assign(new Error('conflict'), { code: 'P2034' });
    }
  };
  await reject(persist(f), 'CURRICULUM_AUTHORITY_RECHECK_FAILED'); assert.equal(f.db.state.gameSpec.length, 0);
});
test('database return corruption fails post-create verification and rolls back', async () => {
  const f = await setup(), original = f.db.$transaction;
  f.db.$transaction = (callback, options) => original(async tx => {
    const create = tx.gameSpec.create;
    tx.gameSpec.create = async args => { const row = await create(args); row.spec.game.claims[0].text = 'corrupt'; return row; };
    return callback(tx);
  }, options);
  await reject(persist(f), 'GAME_WRITE_VERIFICATION_FAILED'); assert.equal(f.db.state.gameSpec.length, 0);
});
test('swapping a result from another successfully validated variant is detectable', async () => {
  const f = await setup(), other = await setup({ state: { previousDifficulty: 'MEDIUM', observations: strong } });
  await reject(f.service.persistValidatedGame({ ...f.input, result: other.result }), 'GENERATION_INPUT_BINDING_MISMATCH');
});
test('same difficulty with changed instructional support cannot reuse', async () => {
  const f = await setup({ state: { previousDifficulty: 'HARD', observations: strong } }); await persist(f);
  const decision = decisionFor(f.input.context, { previousDifficulty: 'HARD', observations: [] });
  assert.equal(decision.instructionalDecision.difficulty, 'HARD'); assert.equal(decision.instructionalDecision.scaffoldingLevel, 'HIGH');
  assert.equal(await f.service.findReusableGame({ ...f.input, decision }), null);
});

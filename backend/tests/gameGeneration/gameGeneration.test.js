'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, candidate, changed, strong, buildGenerationRequest: build } = require('./fixtures/gameFixture');
const { validateGame: validate } = require('../../src/services/gameGeneration/gameValidation');
const { createGameGenerator } = require('../../src/services/gameGeneration/gameGenerator');
const { LIMITS } = require('../../src/services/gameGeneration/gameContract');
const { fingerprint } = require('../../src/services/curriculumIngestion/curriculumIdentity');

// These tests never instantiate a Prisma client or a real provider. Fixture DB is
// an in-memory fake; all generation dependencies are explicit injected functions.
const fetchBefore = globalThis.fetch;
test.before(() => { globalThis.fetch = () => { throw new Error('NETWORK_FORBIDDEN'); }; });
test.after(() => { globalThis.fetch = fetchBefore; });

test('valid approved grounded candidate passes', async () => { const r = build(await fixture()); assert.deepEqual(validate(candidate(r), r), { valid: true, errors: [] }); });
const mutations = [
  ['malformed root', () => null],
  ['wrong artifact', g => { g.grounding.artifactVersionId = 'other'; }],
  ['wrong source node', g => { g.grounding.nodeId = 'other'; }],
  ['wrong mapped node', g => { g.grounding.mappedNodeId = 'other'; }],
  ['unknown evidence', g => { g.claims[0].evidenceId = 'other'; }],
  ['unsupported objective', g => { g.learningObjectiveRefs = ['chapter_objective_0']; }],
  ['challenge objective', g => { g.challenges[0].learningObjectiveRefs = ['chapter_objective_0']; }],
  ['difficulty mismatch', g => { g.challenges[0].difficulty = 'HARD'; }],
  ['scope expansion with genuine citation', g => { g.claims[0].text = 'Calculus is required for this activity.'; }],
  ['missing scaffolding', g => { g.phases[1].teachingRefs = []; }],
  ['guidance mismatch', g => { g.instructionalPolicy.guidanceLevel = 'ON_DEMAND'; }],
  ['hints required', g => { g.challenges[0].hint = null; }],
  ['MCQ answer absent from options', g => { g.challenges[0].options = ['four', 'tokens']; }],
  ['duplicate challenge', g => { g.challenges.push(structuredClone(g.challenges[0])); }],
  ['missing answer', g => { delete g.challenges[0].correctAnswer; }],
  ['unsupported phase', g => { g.phases[2].type = 'INVENTED'; }],
  ['invalid telemetry event', g => { g.telemetry.events[0] = 'WRITE_MASTERY'; }],
  ['claims require evidence', g => { delete g.claims[0].evidenceId; }],
  ['hidden academic narrative', g => { g.metadata.fiction.narrative = 'The sun orbits Earth.'; }],
  ['extra hidden academic field', g => { g.metadata.explanation = 'Invented fact'; }],
  ['visual academic assertion', g => { g.visuals.description = 'A cube has seven faces.'; }],
  ['wrong game identity', g => { g.gameId = 'other'; }],
  ['wrong academic mode', g => { g.academicMode = 'PREREQUISITE'; }],
  ['incorrect source answer', g => { g.challenges[0].correctAnswer = 'ten'; g.challenges[0].options.push('ten'); }],
  ['invented distractor', g => { g.challenges[0].options.push('algebra'); }],
  ['duplicate options', g => { g.challenges[0].options.push('eight'); }],
  ['invalid source span', g => { g.challenges[0].prompt.end = 12000; }],
  ['missing challenge evidence', g => { g.challenges[0].groundingRefs = []; }],
  ['incorrect feedback source', g => { g.challenges[0].feedback.evidenceId = 'other'; }],
  ['incorrect hint source', g => { g.challenges[0].hint.evidenceId = 'other'; }],
  ['missing referenced phase', g => { g.challenges[0].phaseId = 'missing'; }],
  ['challenge in intro', g => { g.challenges[0].phaseId = 'intro'; }],
  ['duplicate phase id', g => { g.phases[1].id = 'intro'; }],
  ['missing completion target', g => { g.completion.challengeIds = ['missing']; }],
  ['wrong telemetry target', g => { g.telemetry.binding.nodeId = 'other'; }],
  ['wrong telemetry key', g => { g.challenges[0].telemetryKey = 'other'; }],
  ['unsupported instruction', g => { g.phases[2].instruction = 'READ_SOURCE'; }],
  ['missing intro', g => { g.phases.shift(); }],
  ['size bound', g => { g.claims[0].text = 'x'.repeat(100001); }],
  ['asset URL forbidden', g => { g.visuals.assets = ['https://example.invalid/asset']; }]
];
for (const [name, mutate] of mutations) test(`${name} fails closed`, async () => {
  const r = build(await fixture()), g = candidate(r), replacement = mutate(g);
  assert.equal(validate(replacement === undefined ? g : replacement, r).valid, false);
});

test('hierarchy is not prerequisite authority and never appears in bounded prompt', async () => {
  const f = await fixture(), r = build(f);
  const context = changed(f.context, c => { c.curriculum.hierarchyPath.push({ nodeId: 'fake-prerequisite', title: 'Advanced algebra' }); });
  assert.deepEqual(build({ ...f, context }), r); assert.equal(JSON.stringify(r).includes('synthetic-learner'), false);
});
test('chapter objectives are not silently declared applicable', async () => {
  const f = await fixture(); assert.ok(f.context.curriculum.learningObjectives.length);
  assert.deepEqual(build(f).academicGrounding.learningObjectives, []);
});
test('blocked dependent activity never reaches provider', async () => {
  const f = await fixture({ requirements: [{ relationshipId: 'edge', approvedBy: 'reviewer', artifactVersionId: 'other', nodeId: 'prerequisite', masteryStatus: 'UNKNOWN' }] });
  let calls = 0; const out = await createGameGenerator({ generateStructuredGame() { calls++; } }).generate(f);
  assert.equal(calls, 0); assert.equal(out.failure.stage, 'request'); assert.throws(() => build(f), /PREREQUISITE_CONTEXT_REQUIRED/);
});
test('explicit separately grounded prerequisite accepted without dependent content', async () => {
  const prerequisite = await fixture({ nodeId: 'prerequisite' });
  const f = await fixture({ requirements: [{ relationshipId: 'edge', approvedBy: 'reviewer', artifactVersionId: prerequisite.context.curriculum.artifactVersionId, nodeId: 'prerequisite', masteryStatus: 'UNKNOWN' }] });
  const r = build({ ...f, prerequisite }); assert.equal(r.academicGrounding.target.nodeId, 'prerequisite'); assert.equal(r.academicGrounding.mode, 'PREREQUISITE');
  assert.equal(validate(candidate(r), r).valid, true);
  assert.throws(() => build({ ...f, prerequisite: { ...prerequisite, context: f.context } }), /SCOPE_MISMATCH/);
});
test('HARD retains scope; claims cannot invent higher-grade knowledge', async () => {
  const r = build(await fixture({ state: { previousDifficulty: 'MEDIUM', observations: strong } })), g = candidate(r);
  assert.equal(r.instructionalPolicy.difficulty, 'HARD'); assert.equal(validate(g, r).valid, true);
  g.claims[0].text += ' Apply logarithms.'; assert.equal(validate(g, r).valid, false);
});
test('EASY actually requires prior teaching and guided instructions', async () => {
  const r = build(await fixture()), g = candidate(r); assert.equal(r.instructionalPolicy.scaffoldingLevel, 'HIGH');
  g.phases[2].type = 'CORE_GAMEPLAY'; assert.equal(validate(g, r).valid, false);
});
test('hint prohibition consumes policy without inventing an override', async () => {
  const f = await fixture(), decision = changed(f.decision, d => { d.instructionalDecision.hintsAllowed = false; });
  const r = build({ ...f, decision }), g = candidate(r); assert.equal(validate(g, r).valid, true);
  g.challenges[0].hint = { template: 'REREAD_SOURCE', evidenceId: r.academicGrounding.evidence[0].id }; assert.equal(validate(g, r).valid, false);
});
for (const authority of ['MODEL_INFERENCE', 'MODEL_VISUAL_INTERPRETATION', 'SOURCE_GROUNDED_SYNTHESIS']) test(`${authority} is not academic authority`, async () => {
  const f = await fixture(); const context = changed(f.context, c => { c.curriculum.materials[0].authority = authority; });
  assert.throws(() => build({ ...f, context }), /NON_AUTHORITATIVE_EVIDENCE/);
});
for (const field of ['studentCompletion', 'visualDependency']) test(`${field} cannot supply automatic answers`, async () => {
  const f = await fixture(), context = changed(f.context, c => { c.curriculum.materials[0][field] = field === 'studentCompletion' ? true : 'VISUAL_UNRESOLVED'; });
  assert.throws(() => build({ ...f, context }), /NO_SUPPORTED_SOURCE_MATERIAL/);
});
test('fictional characters/settings and valid narrative are allowed', async () => {
  const r = build(await fixture()), g = candidate(r); g.metadata.fiction.setting = 'STAR_LIBRARY'; g.metadata.fiction.character = 'MIRA'; g.metadata.fiction.narrative = 'RESTORE_STORYBOOK';
  assert.equal(validate(g, r).valid, true);
});
test('first invalid candidate repaired using errors, original scope and full candidate', async () => {
  const f = await fixture(); let calls = 0, first;
  const out = await createGameGenerator({ generateStructuredGame(r) {
    calls++; if (calls === 1) { first = r; const g = candidate(r); g.grounding.nodeId = 'wrong'; return g; }
    assert.equal(r.kind, 'REPAIR'); assert.equal(r.originalRequest, first); assert.equal(r.academicGrounding, first.academicGrounding);
    assert.ok(r.validationErrors.some(e => e.code === 'ACADEMIC_SCOPE_MISMATCH')); assert.equal(r.candidate.grounding.nodeId, 'wrong'); return candidate(r.originalRequest);
  } }).generate(f);
  assert.equal(out.ok, true); assert.equal(out.generationAttempts, 1); assert.equal(out.repairAttempts, 1); assert.deepEqual(out.validationResults.map(v => v.valid), [false, true]);
});
test('repair is fully revalidated and new violations fail closed', async () => {
  let calls = 0; const out = await createGameGenerator({ generateStructuredGame(r) {
    const g = candidate(r.originalRequest || r); if (++calls === 1) g.gameId = 'bad'; else g.claims[0].text = 'New unsupported claim'; return g;
  } }).generate(await fixture());
  assert.equal(out.ok, false); assert.equal(out.failure.code, 'REPAIR_LIMIT_EXHAUSTED'); assert.equal('package' in out, false);
  assert.ok(out.validationResults[1].errors.some(e => e.code === 'UNSUPPORTED_ACADEMIC_CLAIM'));
});
for (const maxRepairs of [0, 1, 2]) test(`repair limit ${maxRepairs} strictly bounds calls; no infinite retries`, async () => {
  let calls = 0; const out = await createGameGenerator({ generateStructuredGame() { calls++; return {}; } }, { maxRepairs }).generate(await fixture());
  assert.equal(calls, 1 + maxRepairs); assert.equal(out.repairAttempts, maxRepairs); assert.equal(out.validationResults.length, calls); assert.equal(out.ok, false);
});
test('invalid repair configuration rejected before any execution', () => {
  for (const maxRepairs of [-1, 3, Infinity, NaN, '2']) assert.throws(() => createGameGenerator({ generateStructuredGame() {} }, { maxRepairs }), /CONFIG/);
});
test('provider exception controlled, never echoed or retried', async () => {
  let calls = 0; const out = await createGameGenerator({ generateStructuredGame() { calls++; throw new Error('synthetic-secret-canary'); } }, { maxRepairs: 2 }).generate(await fixture());
  assert.equal(calls, 1); assert.equal(out.failure.code, 'PROVIDER_FAILURE'); assert.equal(JSON.stringify(out).includes('synthetic-secret-canary'), false);
});
test('repair provider exception stops without fallback', async () => {
  let calls = 0; const out = await createGameGenerator({ generateStructuredGame() { if (++calls === 1) return {}; throw new Error('private'); } }, { maxRepairs: 2 }).generate(await fixture());
  assert.equal(calls, 2); assert.equal(out.failure.stage, 'repair_provider');
});
test('malformed JSON safely repaired', async () => {
  const out = await createGameGenerator({ generateStructuredGame(r) { return r.kind === 'REPAIR' ? JSON.stringify(candidate(r.originalRequest)) : '{broken'; } }).generate(await fixture());
  assert.equal(out.ok, true); assert.equal(out.repairAttempts, 1);
});
test('malformed JSON after repair fails safely', async () => {
  const out = await createGameGenerator({ generateStructuredGame() { return '{private-secret'; } }).generate(await fixture());
  assert.equal(out.ok, false); assert.equal(JSON.stringify(out).includes('private-secret'), false);
});
test('oversize response is never forwarded for repair', async () => {
  let calls = 0; const out = await createGameGenerator({ generateStructuredGame() { calls++; return 'x'.repeat(LIMITS.candidateBytes + 1); } }).generate(await fixture());
  assert.equal(calls, 1); assert.equal(out.failure.code, 'CANDIDATE_UNREPAIRABLE');
});
test('non-JSON cyclic/accessor candidates fail without executing getters', async () => {
  const r = build(await fixture()), cyclic = {}; cyclic.self = cyclic;
  assert.equal(validate(cyclic, r).valid, false);
  const getter = { get academicClaim() { throw new Error('must not run'); } }; assert.equal(validate(getter, r).valid, false);
});
test('requests and validation results are deterministic', async () => {
  const f = await fixture(), r = build(f), g = candidate(r); assert.deepEqual(build(f), r); assert.deepEqual(validate(g, r), validate(structuredClone(g), r));
});
test('forged bounded request is rejected', async () => { const r = build(await fixture()); assert.throws(() => validate(candidate(r), structuredClone(r)), /BOUNDED_REQUEST_REQUIRED/); });
test('validated package is detached, recursively frozen, and leaves context intact', async () => {
  const f = await fixture(), before = JSON.stringify(f.context); let returned;
  const out = await createGameGenerator({ generateStructuredGame(r) { returned = candidate(r); return returned; } }).generate(f);
  assert.equal(out.ok, true); returned.claims[0].text = 'mutated'; assert.notEqual(out.package.game.claims[0].text, 'mutated');
  assert.throws(() => { out.package.game.claims[0].text = 'mutated'; }, TypeError);
  assert.throws(() => { out.package.academicGrounding.evidence[0].text = 'mutated'; }, TypeError);
  assert.equal(out.package.specificationFingerprint, fingerprint(out.package.game)); assert.equal(JSON.stringify(f.context), before);
});
test('input changes while provider pending cannot change request or package', async () => {
  const f = await fixture(), shallow = Object.freeze({ ...f.context, curriculum: structuredClone(f.context.curriculum) });
  let release; const pending = new Promise(resolve => { release = resolve; }); let received;
  const run = createGameGenerator({ async generateStructuredGame(r) { received = r; await pending; return candidate(r); } }).generate({ ...f, context: shallow });
  shallow.curriculum.materials[0].text = 'mutated'; release(); const out = await run;
  assert.equal(out.ok, true); assert.notEqual(received.academicGrounding.evidence[0].text, 'mutated');
});
test('generation performs no DB operations or network calls', async () => {
  const f = await fixture(), before = structuredClone(f.db.state);
  const out = await createGameGenerator({ generateStructuredGame: candidate }).generate(f);
  assert.equal(out.ok, true); assert.deepEqual(f.db.trace, []); assert.deepEqual(f.db.state, before);
});
test('Gemini adapter import is inert', () => {
  const { createGeminiGameProvider } = require('../../src/services/gameGeneration/geminiGameProvider');
  assert.equal(typeof createGeminiGameProvider().generateStructuredGame, 'function');
});

test('source page must exist in the approved registry', async () => {
  const f = await fixture(), context = changed(f.context, c => { c.curriculum.materials[0].sourceRefs[0].page = 999; });
  assert.throws(() => build({ ...f, context }), /SOURCE_EVIDENCE_INVALID/);
});
test('unapproved or unimported context fails before provider use', async () => {
  const f = await fixture();
  for (const change of [c => { c.grounding.reviewStatus = 'UNREVIEWED'; }, c => { c.grounding.imported = false; }]) {
    assert.throws(() => build({ ...f, context: changed(f.context, change) }), /TRUSTED_CONTEXT_REQUIRED/);
  }
});
test('another learner cannot supply a prerequisite decision', async () => {
  const prerequisite = await fixture({ nodeId: 'prerequisite' });
  const f = await fixture({ requirements: [{ relationshipId: 'edge', approvedBy: 'reviewer', artifactVersionId: prerequisite.context.curriculum.artifactVersionId, nodeId: 'prerequisite', masteryStatus: 'UNKNOWN' }] });
  const decision = changed(prerequisite.decision, d => { d.evidence.learnerId = 'another-learner'; });
  assert.throws(() => build({ ...f, prerequisite: { ...prerequisite, decision } }), /PREREQUISITE_SCOPE_MISMATCH/);
});
test('remediation mode requires a remediation challenge', async () => {
  const r = build(await fixture({ state: { mastery: { status: 'NOT_MASTERED', sampleSize: 4 } } })), g = candidate(r);
  assert.equal(g.academicMode, 'REMEDIATION'); assert.equal(validate(g, r).valid, true);
  g.phases[2].type = 'GUIDED_PRACTICE'; assert.equal(validate(g, r).valid, false);
});
test('text-entry CLOZE has deterministic source answer and no options', async () => {
  const r = build(await fixture()), g = candidate(r); g.challenges[0].type = 'CLOZE'; g.challenges[0].options = [];
  assert.equal(validate(g, r).valid, true); g.challenges[0].options = ['eight']; assert.equal(validate(g, r).valid, false);
});
test('non-JSON arrays cannot smuggle additional properties', async () => {
  const r = build(await fixture()), g = candidate(r); g.claims.length = 2; g.claims.hidden = 'unsupported prose';
  assert.equal(validate(g, r).valid, false);
});
test('deep malformed provider objects are rejected without stack overflow', async () => {
  const r = build(await fixture()); let data = {}; for (let i = 0; i < 100; i++) data = { nested: data };
  assert.equal(validate(data, r).valid, false);
});
test('specification checksum distinguishes variants of the same request for telemetry', async () => {
  const f = await fixture(); const a = await createGameGenerator({ generateStructuredGame: candidate }).generate(f);
  const b = await createGameGenerator({ generateStructuredGame(r) { const g = candidate(r); g.metadata.title = 'Discovery Trail'; return g; } }).generate(f);
  assert.equal(a.package.game.gameId, b.package.game.gameId);
  assert.notEqual(a.package.telemetryContext.specificationFingerprint, b.package.telemetryContext.specificationFingerprint);
});
test('safe validation diagnostics never echo unknown keys or text', async () => {
  const r = build(await fixture()), g = candidate(r); g['synthetic-secret-canary'] = 'private';
  const result = validate(g, r); assert.equal(result.valid, false); assert.equal(JSON.stringify(result).includes('synthetic-secret-canary'), false);
});

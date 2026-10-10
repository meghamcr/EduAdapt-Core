'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, planCandidate, twoChallenges } = require('./fixtures/plannerFixture');
const { createGamePlanner, buildPlanningRequest, validatePlan, selectPlannedGame } = require('../../src/services/gamePlanning/gamePlanner');
const { createGameGenerator } = require('../../src/services/gameGeneration/gameGenerator');
const { createGamePersistenceService } = require('../../src/services/gameGeneration/gamePersistence');
const { buildGenerationRequest } = require('../../src/services/gameGeneration/generationRequest');
const { validateGame } = require('../../src/services/gameGeneration/gameValidation');
const { strong } = require('../gameGeneration/fixtures/gameFixture');
const setup = async options => { const f = await fixture(options); return { ...f, input: { levelContext: f.levelContext, decisions: f.decisions(), language: 'en' } }; };
test('planner receives roles, source passages, grouped scope, adaptive policy and honest capabilities without learner PII', async () => {
  const f = await setup({ story: true }), r = buildPlanningRequest(f.input);
  assert(r.materials.some(m => m.role === 'story_context')); assert(r.materials.some(m => m.visualStatus === 'VISUAL_DEPENDENCY'));
  assert.equal(r.adaptive.worked.instructionalPolicy.difficulty, 'EASY');
  assert(r.capabilities.supported.some(c => c.mechanic === 'CONSTRUCTION'));
  assert.doesNotMatch(JSON.stringify(r), /synthetic-learner|MODEL_INFERENCE|MODEL_VISUAL_INTERPRETATION|correctAnswer/);
  assert.equal(Object.isFrozen(r.materials[0]), true);
});
test('valid multi-material plans are possible without forcing one game per node', async () => {
  const f = await setup({ mutate: a => { const m = structuredClone(a.nodes[1].materials[0]); m.text = 'The eight tokens can be arranged beside the four counters.'; a.nodes[1].materials.push(m); } });
  const r = buildPlanningRequest(f.input), p = planCandidate(r), second = r.materials.at(-1);
  p.games[0].materialRefs.push(second.materialRef); p.deferred = p.deferred.filter(d => d.materialRef !== second.materialRef);
  assert.equal(validatePlan(p, r).valid, true);
});
for (const [name, mutate, code] of [
  ['made up reference', (p) => p.games[0].materialRefs.push('invented'), 'INELIGIBLE_GAME_MATERIAL'],
  ['visual task as fact', (p, r) => { const ref = r.materials.find(m => m.visualStatus !== 'NOT_APPLICABLE').materialRef; p.games[0].materialRefs = [ref]; }, 'INELIGIBLE_GAME_MATERIAL'],
  ['cross node game', (p, r) => p.games[0].materialRefs.push(r.materials[0].materialRef), 'MULTI_NODE_GAME_UNSUPPORTED'],
  ['missing deferral', p => p.deferred.pop(), 'UNACCOUNTED_MATERIAL'],
  ['wrong request identity', p => p.requestFingerprint = '0'.repeat(64), 'PLAN_REQUEST_MISMATCH'],
  ['fake unsupported status', p => p.status = 'UNSUPPORTED', 'PLAN_STATUS_MISMATCH'],
  ['duplicate games', p => p.games.push(structuredClone(p.games[0])), 'DUPLICATE_GAME_ID'],
  ['inaccurate visual deferral', p => p.deferred.at(-1).reason = 'NOT_SELECTED', 'DEFERRAL_REASON_MISMATCH'],
  ['unsupported mechanics', p => p.games[0].mechanic = 'UNSUPPORTED_MECHANIC', 'ENUM'],
  ['invented academic output', p => p.answer = 'invented answer', 'UNKNOWN_FIELD']
]) test(`planner rejects ${name}`, async () => {
  const f = await setup(), r = buildPlanningRequest(f.input), p = planCandidate(r); mutate(p, r);
  const v = validatePlan(p, r); assert.equal(v.valid, false); assert(v.errors.some(e => e.code === code));
});
test('blocked prerequisites cannot be selected; a fully deferred plan is honest unsupported output', async () => {
  const f = await setup(), decisions = f.decisions({}, [{ relationshipId: 'edge', approvedBy: 'synthetic-policy', artifactVersionId: 'other-version', nodeId: 'other-node', masteryStatus: 'UNKNOWN' }]);
  const r = buildPlanningRequest({ ...f.input, decisions }); assert.equal(validatePlan(planCandidate(r), r).valid, true);
  assert.equal(planCandidate(r).status, 'UNSUPPORTED');
});
test('unreviewed artifact cannot produce trusted level context', async () => {
  const f = await fixture({ approved: false }), before = structuredClone(f.db.state);
  await assert.rejects(f.service.list(f.versionId), /APPROVED_CURRICULUM_REQUIRED/); assert.deepEqual(f.db.state, before);
});
test('unissued levels, decisions, selections and plans fail closed', async () => {
  const f = await setup(), request = buildPlanningRequest(f.input);
  assert.throws(() => buildPlanningRequest({ ...f.input, levelContext: structuredClone(f.levelContext) }), /ISSUED_LEVEL/);
  assert.throws(() => buildPlanningRequest({ ...f.input, decisions: structuredClone(f.input.decisions) }), /ISSUED_ADAPTIVE/);
  assert.throws(() => validatePlan(planCandidate(request), structuredClone(request)), /ISSUED_PLANNING/);
  assert.throws(() => selectPlannedGame({ ok: true, plan: planCandidate(request) }, 'source-practice', f.levelContext, f.input.decisions), /ISSUED_GAME_PLAN/);
});
test('provider errors and malformed output are bounded, sanitized and not cached', async () => {
  const f = await setup(); let calls = 0;
  const planner = createGamePlanner({ planStructuredGame() { calls++; if (calls === 1) throw Error('SECRET credentials'); return '{SECRET'; } });
  const first = await planner.plan(f.input), second = await planner.plan(f.input);
  assert.equal(first.error.code, 'PLANNER_PROVIDER_FAILURE'); assert.equal(second.error.code, 'GAME_PLAN_REJECTED'); assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify([first, second]), /SECRET|credentials|stack/);
});
test('equivalent plan requests reuse in-flight and completed work; changed adaptive policy invalidates it', async () => {
  const f = await setup(); let calls = 0;
  const planner = createGamePlanner({ async planStructuredGame(r) { calls++; await Promise.resolve(); return planCandidate(r); } });
  const [a, b] = await Promise.all([planner.plan(f.input), planner.plan(f.input)]); assert.equal(a, b); assert.equal(calls, 1);
  assert.equal(await planner.plan(f.input), a);
  await planner.plan({ ...f.input, decisions: f.decisions({ previousDifficulty: 'EASY', observations: strong }) }); assert.equal(calls, 2);
  assert.throws(() => selectPlannedGame(a, 'source-practice', f.levelContext, f.decisions({ previousDifficulty: 'EASY', observations: strong })), /GAME_PLAN_STALE/);
});
test('planned story generation is source-exact and persistent reuse binds level, mechanic and materials', async () => {
  const f = await setup({ story: true }), planner = createGamePlanner({ planStructuredGame: planCandidate });
  const plan = await planner.plan(f.input), planning = selectPlannedGame(plan, 'source-practice', f.levelContext, f.input.decisions);
  const input = { context: f.levelContext.contexts.worked, decision: f.input.decisions.worked, planning };
  const request = buildGenerationRequest(input); assert.equal(request.academicGrounding.evidence.length, 1); assert.equal(request.academicGrounding.evidence[0].role, 'story_context');
  const result = await createGameGenerator({ generateStructuredGame: twoChallenges }).generate(input); assert.equal(result.ok, true);
  const p = createGamePersistenceService(f.db), saved = await p.persistValidatedGame({ ...input, result });
  assert.equal((await p.findReusableGame(input)).gameSpecId, saved.gameSpecId);
  const restored = await f.db.$transaction(tx => p.loadValidatedGameInTransaction(tx, saved.gameSpecId)); assert.equal(restored.gameSpecId, saved.gameSpecId);
  const bad = structuredClone(twoChallenges(request)); bad.challenges[0].type = 'CLOZE'; bad.challenges[0].options = [];
  assert(validateGame(bad, request).errors.some(e => e.code === 'PLANNED_MECHANIC_MISMATCH'));
  assert.equal((await createGameGenerator({ generateStructuredGame: twoChallenges }).generate({ ...input, planning: structuredClone(planning) })).ok, false);
  f.db.state.gameSpec[0].spec.planning.levelId = `level-v1-${'0'.repeat(64)}`;
  await assert.rejects(f.db.$transaction(tx => p.loadValidatedGameInTransaction(tx, saved.gameSpecId)), /PLANNING_SCOPE_INVALID/);
});
test('unanswered source text cannot become planned recall evidence even when visually independent', async () => {
  const f = await setup({ mutate: a => { a.nodes[1].materials[0].student_completion = true; a.nodes[1].materials[0].role = 'question'; } });
  const r = buildPlanningRequest(f.input); assert.equal(planCandidate(r).status, 'UNSUPPORTED'); assert.equal(validatePlan(planCandidate(r), r).valid, true);
});

'use strict';
const { isDeepStrictEqual: equal } = require('node:util');
const { createLevelContextService } = require('../gamePlanning/levelContext');
const { createGamePlanner, selectPlannedGame } = require('../gamePlanning/gamePlanner');
const { decideAdaptiveLearning } = require('../adaptiveLearning/adaptiveDecision');
const { normalizePrerequisites } = require('../adaptiveLearning/prerequisitePolicy');
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const { fingerprint } = require('../curriculumIngestion/curriculumIdentity');
const { createGameplayService } = require('./gameplaySession');
const { createLearningLoop } = require('./learningLoop');
const { fields, id } = require('./gameplayEvents');
const { requireRuntimeVersion } = require('./runtimeProjection');

// This is server composition, not a second adaptive or evidence implementation.
// Production must inject explicit access, reviewed-level and execution policies.
// Neither a level package nor a successful plan grants curriculum approval.
function createLevelLearningLoop(db, { plannerProvider, provider, authorizeLevel, authorizeLearning,
  authorizeExecution, loadPrerequisites, now, maxRepairs = 1, maxPlans = 128 } = {}) {
  if (!Number.isSafeInteger(maxPlans) || maxPlans < 1 || maxPlans > 512) throw new Error('LEVEL_LOOP_CONFIG_INVALID');
  const contexts = createLevelContextService(db), gameplay = createGameplayService(db);
  const planner = createGamePlanner(plannerProvider), tickets = new Map();
  async function allowed(selection) {
    if (typeof authorizeLevel !== 'function') throw new Error('LEVEL_AUTHORIZATION_REQUIRED');
    const permission = await authorizeLevel(freeze(selection));
    if (!permission || typeof permission.reference !== 'string' || !permission.reference.trim()) throw new Error('LEVEL_AUTHORIZATION_REQUIRED');
  }
  async function boundary(operation) {
    try { return await operation(); }
    catch { return freeze({ ok: false, error: { code: 'LEVEL_REQUEST_REJECTED', stage: 'level' } }); }
  }
  async function decisionsFor(levelContext, learnerId) {
    if (typeof loadPrerequisites !== 'function') throw new Error('PREREQUISITE_POLICY_REQUIRED');
    const decisions = {};
    for (const [nodeId, context] of Object.entries(levelContext.contexts)) {
      const c = context.curriculum;
      if (typeof authorizeLearning !== 'function' || await authorizeLearning(freeze({ learnerId,
        curriculumArtifactVersionId: c.artifactVersionId, curriculumNodeId: c.mappedNodeId })) !== true) throw new Error('LEARNING_AUTHORIZATION_REQUIRED');
      const scope = { learnerId, artifactVersionId: c.artifactVersionId, nodeId: c.mappedNodeId };
      const learnerState = await gameplay.loadLearnerState(scope);
      decisions[nodeId] = decideAdaptiveLearning({ context, learnerState,
        prerequisites: normalizePrerequisites({ ...scope, nodeId, requirements: await loadPrerequisites(freeze({ ...scope, nodeId })) }) });
    }
    return decisions;
  }
  function catalogue(raw) {
    return boundary(async () => {
      fields(raw, ['learnerId', 'curriculumArtifactVersionId']);
      const selection = { learnerId: id(raw.learnerId), curriculumArtifactVersionId: id(raw.curriculumArtifactVersionId) };
      await allowed(selection);
      return freeze({ ok: true, catalogue: await contexts.list(selection.curriculumArtifactVersionId) });
    });
  }
  function prepare(raw) {
    return boundary(async () => {
      fields(raw, ['learnerId', 'curriculumArtifactVersionId', 'levelId', 'language']);
      const { language } = raw, learnerId = id(raw.learnerId);
      const selection = { curriculumArtifactVersionId: id(raw.curriculumArtifactVersionId), levelId: id(raw.levelId) };
      await allowed({ learnerId, ...selection });
      const levelContext = await contexts.build(selection), decisions = await decisionsFor(levelContext, learnerId);
      const result = await planner.plan({ levelContext, decisions, language });
      if (!result.ok) return result;
      const ticketId = `plan_${fingerprint({ learnerId, plan: result.plan })}`;
      tickets.set(ticketId, { learnerId, selection, result, language });
      if (tickets.size > maxPlans) tickets.delete(tickets.keys().next().value);
      const p = levelContext.packaged;
      // Exact source notes only. Teacher notes, synthesis/inference and answer keys
      // are absent. Visual flags survive; no claim that these notes resolve them.
      const notes = p.level.notes.map(section => ({ kind: section.kind, materials: section.materialRefs.map(ref => {
        const m = p.materials[ref];
        return { materialRef: ref, text: m.text, sourceRefs: m.sourceRefs, visualStatus: m.visualStatus };
      }) }));
      const materialAccounting = p.level.materialRefs.map(materialRef => {
        const material = p.materials[materialRef];
        const games = result.plan.games.filter(g => g.materialRefs.includes(materialRef)).map(g => g.id);
        const deferred = result.plan.deferred.find(d => d.materialRef === materialRef);
        return { materialRef, disposition: material.role === 'teacher_note' ? 'TEACHER_ONLY' : games.length ? 'INTERACTION_EVIDENCE' : 'DEFERRED',
          inNotes: p.level.notes.some(n => n.materialRefs.includes(materialRef)), games,
          ...(deferred ? {reason:deferred.reason, requiredCapability:deferred.requiredCapability} : {}) };
      });
      return freeze({ ok: true, planId: ticketId, status: result.plan.status,
        level: { levelId: p.level.levelId, title: p.level.title, sourceSpan: p.level.sourceSpan }, notes,
        games: result.plan.games.map(g => ({ id: g.id, mechanic: g.mechanic, purpose: g.purpose, materialRefs: g.materialRefs })),
        deferred: result.plan.deferred, materialAccounting, sourceReviewStatus: levelContext.sourceReviewStatus, levelReviewStatus: 'UNREVIEWED',
        limitations: ['GENERATED_MODELS_DO_NOT_RESOLVE_ORIGINAL_EXERCISES', 'NO_AUTOMATIC_LEVEL_ADVANCEMENT', 'LEVEL_PRESENTATION_REQUIRES_EXPLICIT_SERVER_AUTHORIZATION'] });
    });
  }
  function launch(raw) {
    return boundary(async () => {
      fields(raw, ['learnerId', 'planId', 'gameId', 'creationKey', 'runtimeVersion']);
      const learnerId = id(raw.learnerId), planId = id(raw.planId), gameId = id(raw.gameId), creationKey = id(raw.creationKey);
      const runtimeVersion = raw.runtimeVersion; requireRuntimeVersion(runtimeVersion);
      const ticket = tickets.get(planId);
      if (!ticket || ticket.learnerId !== learnerId) throw new Error('PLAN_NOT_FOUND');
      await allowed({ learnerId, ...ticket.selection });
      const levelContext = await contexts.build(ticket.selection), decisions = await decisionsFor(levelContext, learnerId);
      const planning = selectPlannedGame(ticket.result, gameId, levelContext, decisions);
      const c = levelContext.contexts[planning.nodeId].curriculum;
      const loop = createLearningLoop(db, { provider, authorizeLearning, authorizeExecution, loadPrerequisites, now, maxRepairs,
        prepareGeneration: ({ context, decision }) => {
          const expected = decisions[planning.nodeId];
          if (!equal(context, levelContext.contexts[planning.nodeId]) || !equal(decision.instructionalDecision, expected.instructionalDecision) ||
              !equal(decision.academicDecision, expected.academicDecision)) throw new Error('GAME_PLAN_STALE');
          return planning;
        } });
      return loop.start({ learnerId, curriculumArtifactVersionId: c.artifactVersionId, curriculumNodeId: c.mappedNodeId,
        creationKey, runtimeVersion });
    });
  }
  return Object.freeze({ catalogue, prepare, launch });
}
module.exports = { createLevelLearningLoop };

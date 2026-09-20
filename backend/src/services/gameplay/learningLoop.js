'use strict';
const { createGenerationContextService } = require('../gameGeneration/generationContext');
const { createGameGenerator } = require('../gameGeneration/gameGenerator');
const { createGamePersistenceService } = require('../gameGeneration/gamePersistence');
const { normalizePrerequisites } = require('../adaptiveLearning/prerequisitePolicy');
const { decideAdaptiveLearning } = require('../adaptiveLearning/adaptiveDecision');
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const { createGameplayService } = require('./gameplaySession');
const { fields, id } = require('./gameplayEvents');
const { requireRuntimeVersion } = require('./runtimeProjection');

// Server-only composition: actor identity comes from authenticated transport, not
// a request body. There is deliberately no default client, provider or allow policy.
function createLearningLoop(db, { provider, authorizeLearning, authorizeExecution, loadPrerequisites, now, maxRepairs = 1 } = {}) {
  const contexts = createGenerationContextService(db), persistence = createGamePersistenceService(db);
  const gameplay = createGameplayService(db, { authorizeExecution, now });
  async function start(raw) {
    let stage = 'input';
    const failed = code => freeze({ ok: false, error: { code, stage } });
    try {
      fields(raw, ['learnerId', 'curriculumArtifactVersionId', 'curriculumNodeId', 'creationKey', 'runtimeVersion']);
      // Detach before authorization/provider awaits.
      const input = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, key === 'runtimeVersion' ? value : id(value)]));
      requireRuntimeVersion(input.runtimeVersion);
      stage = 'authorization';
      if (typeof authorizeLearning !== 'function' || await authorizeLearning(freeze({
        learnerId: input.learnerId, curriculumArtifactVersionId: input.curriculumArtifactVersionId, curriculumNodeId: input.curriculumNodeId
      })) !== true) return failed('LEARNING_AUTHORIZATION_REQUIRED');
      stage = 'curriculum';
      const context = await contexts.build({ curriculumArtifactVersionId: input.curriculumArtifactVersionId, curriculumNodeId: input.curriculumNodeId });
      stage = 'learner_state';
      const scope = { learnerId: input.learnerId, artifactVersionId: context.curriculum.artifactVersionId, nodeId: context.curriculum.mappedNodeId };
      const snapshot = await gameplay.loadLearningSnapshot(scope);
      stage = 'adaptive';
      // Explicit server policy only; no client prerequisites or inferred hierarchy.
      // An unresolved prerequisite stops dependent work; selecting its separately
      // approved target is a policy-owner operation, never an invented transition.
      if (typeof loadPrerequisites !== 'function') return failed('PREREQUISITE_POLICY_REQUIRED');
      const prerequisites = normalizePrerequisites({ ...scope, nodeId: context.curriculum.nodeId,
        requirements: await loadPrerequisites(freeze({ ...scope, nodeId: context.curriculum.nodeId })) });
      const decision = decideAdaptiveLearning({ context, learnerState: snapshot.learnerState, prerequisites });
      if (!decision.academicDecision.dependentWorkAllowed) return failed('PREREQUISITE_TARGET_REQUIRED');
      const generationInput = { context, decision };
      stage = 'reuse';
      let stored = await persistence.findReusableGame(generationInput);
      if (!stored) {
        stage = 'generation';
        const result = await createGameGenerator(provider, { maxRepairs }).generate(generationInput);
        if (!result.ok) return failed(result.failure.code === 'PROVIDER_FAILURE' ? 'PROVIDER_FAILURE' : 'GENERATION_REJECTED');
        stage = 'persistence';
        stored = await persistence.persistValidatedGame({ ...generationInput, result });
      }
      stage = 'runtime';
      const runtime = await createGameplayService(db, { authorizeExecution, now, expectedEvidenceRevision: snapshot.revision }).openRuntimeSession({
        learnerId: input.learnerId, gameSpecId: stored.gameSpecId, creationKey: input.creationKey, runtimeVersion: input.runtimeVersion
      });
      return freeze({ ok: true, runtime });
    } catch {
      // Never serialize exceptions, provider candidates, validation reports or DB
      // details. Stage is a closed server literal, not data from the exception.
      return failed('LEARNING_LOOP_REJECTED');
    }
  }
  async function boundary(operation, raw) {
    try { return freeze({ ok: true, result: await operation(raw) }); }
    catch { return freeze({ ok: false, error: { code: 'RUNTIME_REQUEST_REJECTED', stage: 'runtime' } }); }
  }
  return Object.freeze({ start,
    submitEvent: raw => boundary(gameplay.ingestRuntimeEvent, raw),
    restore: raw => boundary(gameplay.restoreRuntimeSession, raw) });
}
module.exports = { createLearningLoop };

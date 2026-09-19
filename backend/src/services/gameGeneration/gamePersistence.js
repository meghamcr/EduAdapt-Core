'use strict';

const { isDeepStrictEqual: equal } = require('node:util');
const { createGenerationContextService, requireGenerationContext } = require('./generationContext');
const { requireAdaptiveDecision, POLICY } = require('../adaptiveLearning/adaptiveDecision');
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const { requireValidatedGeneration, generationInputIdentity } = require('./gameGenerator');
const { buildGenerationRequest } = require('./generationRequest');
const { validateGame, copyJson } = require('./gameValidation');
const { fingerprint } = require('../curriculumIngestion/curriculumIdentity');
const { VERSION, LIMITS } = require('./gameContract');
const STORAGE_VERSION = 'grounded-game-storage-v1';
const STATUS = 'VALIDATED_PENDING_RUNTIME';
const MAX_TRANSACTION_ATTEMPTS = 3;
const REUSE_LIMIT = 100;

class GamePersistenceError extends Error {
  constructor(code) { super(code); this.name = 'GamePersistenceError'; this.code = code; }
}
const fail = code => { throw new GamePersistenceError(code); };
function exactKeys(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype ||
      Reflect.ownKeys(value).some(key => !keys.includes(key)) ||
      Object.values(Object.getOwnPropertyDescriptors(value)).some(d => !Object.hasOwn(d, 'value'))) fail('PERSISTENCE_INPUT_INVALID');
}
function prepare(input, persist) {
  exactKeys(input, persist ? ['context', 'decision', 'prerequisite', 'result'] : ['context', 'decision', 'prerequisite']);
  const { context, decision, prerequisite } = input;
  try {
    requireGenerationContext(context); requireAdaptiveDecision(decision);
    if (prerequisite) {
      exactKeys(prerequisite, ['context', 'decision']);
      requireGenerationContext(prerequisite.context); requireAdaptiveDecision(prerequisite.decision);
    }
    const request = buildGenerationRequest({ context, decision, prerequisite });
    if (persist) {
      const binding = requireValidatedGeneration(input.result), result = input.result, p = result.package;
      if (!equal(binding.inputIdentity, generationInputIdentity(input)) || binding.requestFingerprint !== fingerprint(request)) fail('GENERATION_INPUT_BINDING_MISMATCH');
      if (result.ok !== true || !result.validationResults.at(-1)?.valid || p.status !== 'VALIDATED' || p.contractVersion !== VERSION ||
          p.requestFingerprint !== fingerprint(request) || p.specificationFingerprint !== fingerprint(p.game) ||
          p.specificationFingerprint !== binding.specificationFingerprint || !equal(p.academicGrounding, request.academicGrounding) ||
          !equal(p.telemetryContext, { ...p.game.telemetry.binding, specificationFingerprint: p.specificationFingerprint }) ||
          !validateGame(p.game, request).valid) fail('VALIDATED_PACKAGE_INVALID');
    }
    // New object prevents an asynchronous caller from swapping top-level handles.
    return { context, decision, prerequisite: prerequisite ? { ...prerequisite } : undefined, request,
      game: persist ? input.result.package.game : undefined };
  } catch (error) {
    if (error instanceof GamePersistenceError) throw error;
    fail('TRUSTED_GENERATION_INPUT_REQUIRED');
  }
}
function prefix(request) {
  return `p3e_${fingerprint({ storageVersion: STORAGE_VERSION, adaptiveVersion: POLICY.version, requestFingerprint: fingerprint(request) })}_`;
}
function envelope(game, input) {
  const specificationFingerprint = fingerprint(game);
  return {
    storageVersion: STORAGE_VERSION, generationContractVersion: VERSION, adaptivePolicyVersion: POLICY.version,
    requestFingerprint: fingerprint(input.request), specificationFingerprint,
    contextFingerprint: fingerprint((input.prerequisite || input).context),
    dependentContextFingerprint: input.prerequisite ? fingerprint(input.context) : null,
    academicGrounding: input.request.academicGrounding,
    game,
    telemetryContext: { ...game.telemetry.binding, specificationFingerprint },
    limitations: ['SOURCE_RECALL_ONLY', 'NODE_OBJECTIVE_APPLICABILITY_NOT_ESTABLISHED', 'NOT_RUNTIME_CERTIFIED']
  };
}
function dataFor(game, input) {
  const c = (input.prerequisite || input).context.curriculum;
  return {
    slug: `${prefix(input.request)}${fingerprint(game)}`, title: game.metadata.title, subject: c.subject,
    topic: c.hierarchyPath.at(-1).title, grade: c.grade,
    curriculumArtifactVersionId: c.artifactVersionId, curriculumNodeId: c.mappedNodeId,
    renderingMode: 'ENGINE_NEUTRAL', difficulty: game.instructionalPolicy.difficulty,
    status: STATUS, spec: envelope(game, input), version: game.specVersion
  };
}
function verifiedRow(row, input) {
  try {
    if (!row || typeof row.id !== 'string' || !row.id || row.status !== STATUS) return false;
    const stored = copyJson(row.spec, LIMITS.requestBytes + LIMITS.candidateBytes);
    if (stored.storageVersion !== STORAGE_VERSION || !validateGame(stored.game, input.request).valid) return false;
    const expected = dataFor(stored.game, input);
    return Object.entries(expected).every(([key, value]) => equal(row[key], value));
  } catch { return false; }
}
function returned(row, reused) {
  return freeze({ gameSpecId: row.id, slug: row.slug, status: row.status, reused, storedPackage: structuredClone(row.spec) });
}

// Domain boundary only: no environment loading, default client, auth claims,
// provider access, or public HTTP interface. Inject a trusted server DB adapter.
function createGamePersistenceService(db) {
  const contexts = createGenerationContextService(db);
  async function transaction(operation) {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt++) {
      try { return await db.$transaction(operation, { isolationLevel: 'Serializable', timeout: 30000 }); }
      catch (error) {
        // PostgreSQL can reject a waiter with a stale serializable snapshot even
        // though all writers lock the artifact. Retry the ENTIRE transaction.
        if (['P2034', 'P2002'].includes(error?.code)) {
          if (attempt < MAX_TRANSACTION_ATTEMPTS) continue;
          fail('PERSISTENCE_CONFLICT_RETRY_EXHAUSTED');
        }
        if (error instanceof GamePersistenceError) throw error;
        fail('PERSISTENCE_DATABASE_FAILURE');
      }
    }
  }
  async function recheck(tx, input) {
    const selections = [input.context, ...(input.prerequisite ? [input.prerequisite.context] : [])];
    // Common lock order for dependent/prerequisite pairs, avoiding AB/BA waits.
    selections.sort((a, b) => {
      const x = `${a.curriculum.artifactVersionId}\0${a.curriculum.mappedNodeId}`;
      const y = `${b.curriculum.artifactVersionId}\0${b.curriculum.mappedNodeId}`;
      return x < y ? -1 : x > y ? 1 : 0;
    });
    for (const original of selections) {
      let fresh;
      try {
        fresh = await contexts.buildInTransaction(tx, {
          curriculumArtifactVersionId: original.curriculum.artifactVersionId,
          curriculumNodeId: original.curriculum.mappedNodeId
        });
      } catch (error) {
        // Preserve database conflict codes only for the bounded transaction retry.
        if (['P2034', 'P2002'].includes(error?.code)) throw error;
        fail('CURRICULUM_AUTHORITY_RECHECK_FAILED');
      }
      if (!equal(fresh, original)) fail('GENERATION_CONTEXT_STALE');
    }
  }
  async function persistValidatedGame(input) {
    const prepared = prepare(input, true);
    return transaction(async tx => {
      await recheck(tx, prepared);
      const data = dataFor(prepared.game, prepared);
      const existing = await tx.gameSpec.findUnique({ where: { slug: data.slug } });
      if (existing) {
        if (!verifiedRow(existing, prepared)) fail('IMMUTABLE_GAME_CONFLICT');
        return returned(existing, true);
      }
      const created = await tx.gameSpec.create({ data });
      if (!verifiedRow(created, prepared)) fail('GAME_WRITE_VERIFICATION_FAILED');
      return returned(created, false);
    });
  }
  async function findReusableGame(input) {
    const prepared = prepare(input, false);
    return transaction(async tx => {
      await recheck(tx, prepared);
      const target = prepared.request.academicGrounding.target;
      const rows = await tx.gameSpec.findMany({ where: {
        curriculumArtifactVersionId: target.artifactVersionId, curriculumNodeId: target.mappedNodeId,
        difficulty: prepared.request.instructionalPolicy.difficulty, status: STATUS,
        slug: { startsWith: prefix(prepared.request) }
      }, orderBy: { slug: 'asc' }, take: REUSE_LIMIT });
      // Invalid/legacy records are neither repaired nor mutated. A miss means
      // generate a new variant; it does not authorize a weaker fallback.
      const row = rows.find(candidate => verifiedRow(candidate, prepared));
      return row ? returned(row, true) : null;
    });
  }
  async function loadValidatedGameInTransaction(tx, gameSpecId) {
    // Reload from trusted storage, never caller game JSON. Reconstruct the stored
    // instructional CONTRACT for validation, not a new adaptive learner decision.
    const row = await tx.gameSpec.findUnique({ where: { id: gameSpecId } });
    if (!row?.curriculumArtifactVersionId || !row.curriculumNodeId || row.spec?.storageVersion !== STORAGE_VERSION) fail('GROUNDED_GAME_REQUIRED');
    const stored = copyJson(row.spec, LIMITS.requestBytes + LIMITS.candidateBytes);
    const selection = { curriculumArtifactVersionId: row.curriculumArtifactVersionId, curriculumNodeId: row.curriculumNodeId };
    const forTarget = stored.academicGrounding?.prerequisiteFor;
    const selections = [selection];
    if (forTarget) {
      const imports = await tx.curriculumArtifactImport.findMany({ where: { versionId: forTarget.artifactVersionId } });
      if (imports.length !== 1 || !imports[0].nodeMapping[forTarget.nodeId]) fail('GROUNDED_GAME_REQUIRED');
      selections.push({ curriculumArtifactVersionId: forTarget.artifactVersionId, curriculumNodeId: imports[0].nodeMapping[forTarget.nodeId] });
    }
    const loaded = new Map();
    for (const s of [...selections].sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) loaded.set(JSON.stringify(s), await contexts.buildInTransaction(tx, s));
    const selected = loaded.get(JSON.stringify(selection));
    const policy = stored.game?.instructionalPolicy;
    function contract(context, mode, blocked = false) {
      const c = context.curriculum;
      return freeze({ decisionVersion: POLICY.version,
        academicDecision: { artifactVersionId: c.artifactVersionId, targetNodeId: c.nodeId, mappedNodeId: c.mappedNodeId, mode,
          dependentWorkAllowed: !blocked, requiresSeparatelyGroundedPrerequisiteContext: blocked,
          prerequisiteStatus: { dependentWorkAllowed: !blocked, unresolved: blocked ? [{ artifactVersionId: selected.curriculum.artifactVersionId, nodeId: selected.curriculum.nodeId, relationshipId: forTarget.relationshipId }] : [] } },
        instructionalDecision: policy, evidence: { learnerId: 'stored-contract-validation' },
        constraints: { academicScopeLocked: true, difficultyCannotExpandScope: true, allowAcademicInference: false, automaticNodeCombinationAllowed: false, hierarchyImpliesPrerequisites: false }
      });
    }
    const input = forTarget ? { context: loaded.get(JSON.stringify(selections[1])), prerequisite: { context: selected, decision: contract(selected, 'PRIMARY') } } : { context: selected };
    input.decision = contract(input.context, stored.game.academicMode, Boolean(forTarget));
    input.request = buildGenerationRequest(input);
    if (!verifiedRow(row, input)) fail('STORED_GAME_INVALID');
    return returned(row, true);
  }
  return Object.freeze({ persistValidatedGame, findReusableGame, loadValidatedGameInTransaction });
}
module.exports = { createGamePersistenceService, GamePersistenceError, STORAGE_VERSION, STATUS };

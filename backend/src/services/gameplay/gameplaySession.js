'use strict';
const { randomUUID } = require('node:crypto');
const { fingerprint } = require('../curriculumIngestion/curriculumIdentity');
const { freeze, normalizeLearnerState } = require('../adaptiveLearning/learnerStateProvider');
const { createGamePersistenceService } = require('../gameGeneration/gamePersistence');
const { createGenerationContextService } = require('../gameGeneration/generationContext');
const { GameplayError, fail, fields, id, parseEvent } = require('./gameplayEvents');
const { initialState, applyEvent } = require('./gameplayState');
const { replaySession, observationsFor, deriveMastery, MASTERY_POLICY } = require('./learningEvidence');
const CONTRACT = 'trusted-gameplay-v1';
const scopeIdentity = (learnerId, artifactVersionId, nodeId) => fingerprint({ learnerId, artifactVersionId, nodeId });
function requirePlayableSequence(game) {
  const positions = game.challenges.map(c => game.phases.findIndex(p => p.id === c.phaseId));
  if (positions.some((p, i) => p < 0 || i > 0 && p < positions[i - 1])) fail('UNSUPPORTED_GAME_SEQUENCE');
}

function createGameplayService(db, { now = () => new Date(), authorizeExecution } = {}) {
  const games = createGamePersistenceService(db);
  const contexts = createGenerationContextService(db);
  async function transaction(fn) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await db.$transaction(fn, { isolationLevel: 'Serializable', timeout: 30000 }); }
      catch (error) {
        if (['P2034', 'P2002'].includes(error?.code)) { if (attempt < 2) continue; fail('GAMEPLAY_CONFLICT'); }
        if (error instanceof GameplayError) throw error;
        fail('GAMEPLAY_STORAGE_OR_AUTHORITY_FAILURE');
      }
    }
  }
  const lockScope = (tx, scopeId) => tx.$queryRaw`SELECT "id" FROM "CurriculumNodeMastery" WHERE "id" = ${scopeId} FOR UPDATE`;
  const lockLearner = (tx, learnerId) => tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${learnerId} FOR UPDATE`;
  async function checkedGame(tx, session) {
    const stored = await games.loadValidatedGameInTransaction(tx, session.gameSpecId), p = stored.storedPackage;
    requirePlayableSequence(p.game);
    if (session.contractVersion !== CONTRACT || session.specificationChecksum !== p.specificationFingerprint ||
        session.artifactVersionId !== p.game.grounding.artifactVersionId || session.nodeId !== p.game.grounding.mappedNodeId ||
        session.difficulty !== p.game.instructionalPolicy.difficulty || session.adaptiveMode !== p.game.academicMode ||
        session.scopeId !== scopeIdentity(session.learnerId, session.artifactVersionId, session.nodeId)) fail('SESSION_GAME_MISMATCH');
    return p.game;
  }
  async function evidence(tx, scope, expectedSequence = scope.nextSequence) {
    const sessions = await tx.gameplayEvidenceSession.findMany({ where: { scopeId: scope.id }, take: 1001 });
    if (sessions.length > 1000) fail('EVIDENCE_REPLAY_LIMIT');
    const observations = [], collected = [];
    for (const session of sessions) {
      if (session.learnerId !== scope.learnerId || session.nodeId !== scope.nodeId || session.artifactVersionId !== scope.artifactVersionId) fail('EVIDENCE_SCOPE_MISMATCH');
      const game = await checkedGame(tx, session);
      const events = await tx.gameplayEvidenceEvent.findMany({ where: { sessionId: session.id }, orderBy: { sequence: 'asc' } });
      collected.push(...events);
      const state = replaySession(session, game, events);
      observations.push(...observationsFor(session, state, events, game));
    }
    collected.sort((a,b) => a.scopeSequence - b.scopeSequence);
    if (collected.length !== expectedSequence || collected.some((e,i) => e.scopeSequence !== i + 1)) fail('EVIDENCE_ORDER_DRIFT');
    return observations.sort((a,b) => a.provenance.scopeSequence - b.provenance.scopeSequence);
  }
  async function openSession(raw) {
    fields(raw, ['learnerId', 'gameSpecId', 'creationKey']);
    const input = { learnerId: id(raw.learnerId), gameSpecId: id(raw.gameSpecId), creationKey: id(raw.creationKey) };
    if (typeof authorizeExecution !== 'function') fail('RUNTIME_AUTHORIZATION_REQUIRED');
    return transaction(async tx => {
      await lockLearner(tx, input.learnerId);
      const stored = await games.loadValidatedGameInTransaction(tx, input.gameSpecId), p = stored.storedPackage;
      requirePlayableSequence(p.game);
      // Trusted injected server policy must certify the EXACT checksum and actor.
      // The pending-runtime DB status is never treated as execution permission.
      const authorization = await authorizeExecution(Object.freeze({ learnerId: input.learnerId, gameSpecId: input.gameSpecId, specificationChecksum: p.specificationFingerprint }));
      if (!authorization || typeof authorization.reference !== 'string' || !authorization.reference.trim() || authorization.reference.length > 160) fail('RUNTIME_AUTHORIZATION_REQUIRED');
      const scopeId = scopeIdentity(input.learnerId, p.game.grounding.artifactVersionId, p.game.grounding.mappedNodeId);
      let scope = await tx.curriculumNodeMastery.findUnique({ where: { id: scopeId } });
      if (!scope) scope = await tx.curriculumNodeMastery.create({ data: { id: scopeId, learnerId: input.learnerId, artifactVersionId: p.game.grounding.artifactVersionId, nodeId: p.game.grounding.mappedNodeId, nextSequence: 0, status: 'UNKNOWN', sampleSize: 0, policyVersion: MASTERY_POLICY } });
      await lockScope(tx, scopeId);
      if (scope.id !== scopeIdentity(scope.learnerId, scope.artifactVersionId, scope.nodeId)) fail('EVIDENCE_SCOPE_MISMATCH');
      const existing = await tx.gameplayEvidenceSession.findMany({ where: { learnerId: input.learnerId, creationKey: input.creationKey } });
      if (existing.length) {
        if (existing.length !== 1 || existing[0].gameSpecId !== input.gameSpecId || existing[0].specificationChecksum !== p.specificationFingerprint) fail('SESSION_KEY_CONFLICT');
        return freeze({ sessionId: existing[0].id, status: existing[0].status });
      }
      const session = await tx.gameplayEvidenceSession.create({ data: { id: randomUUID(), ...input, scopeId,
        artifactVersionId: p.game.grounding.artifactVersionId, nodeId: p.game.grounding.mappedNodeId,
        specificationChecksum: p.specificationFingerprint, contractVersion: CONTRACT, difficulty: p.game.instructionalPolicy.difficulty,
        adaptiveMode: p.game.academicMode, runtimeAuthorizationReference: authorization.reference,
        status: 'CREATED', state: initialState(), createdAt: now() } });
      return freeze({ sessionId: session.id, status: session.status });
    });
  }
  async function ingestEvent(raw) {
    fields(raw, ['learnerId', 'sessionId', 'event']);
    const learnerId = id(raw.learnerId), sessionId = id(raw.sessionId), event = parseEvent(raw.event);
    return transaction(async tx => {
      await lockLearner(tx, learnerId);
      const session = await tx.gameplayEvidenceSession.findUnique({ where: { id: sessionId } });
      if (!session || session.learnerId !== learnerId) fail('SESSION_NOT_FOUND');
      await lockScope(tx, session.scopeId);
      const scope = await tx.curriculumNodeMastery.findUnique({ where: { id: session.scopeId } });
      if (!scope || scope.learnerId !== learnerId || scope.nodeId !== session.nodeId || scope.artifactVersionId !== session.artifactVersionId) fail('EVIDENCE_SCOPE_MISMATCH');
      const game = await checkedGame(tx, session);
      const priorMastery = deriveMastery(await evidence(tx, scope));
      if (scope.status !== priorMastery.status || scope.sampleSize !== priorMastery.sampleSize || scope.policyVersion !== priorMastery.policyVersion) fail('MASTERY_PROJECTION_DRIFT');
      const events = await tx.gameplayEvidenceEvent.findMany({ where: { sessionId }, orderBy: { sequence: 'asc' } });
      const before = replaySession(session, game, events);
      const previous = events.find(e => e.eventKey === event.eventId);
      if (previous) {
        if (previous.payloadFingerprint !== fingerprint(event)) fail('EVENT_KEY_CONFLICT');
        return receipt(previous);
      }
      const observedAt = now(), outcome = applyEvent(game, before, event, observedAt.getTime());
      const sequence = scope.nextSequence + 1;
      if (!Number.isSafeInteger(sequence) || sequence > 2147483647) fail('SEQUENCE_EXHAUSTED');
      const row = await tx.gameplayEvidenceEvent.create({ data: { id: randomUUID(), sessionId, scopeId: scope.id,
        eventKey: event.eventId, sequence: outcome.state.sequence, scopeSequence: sequence, payloadFingerprint: fingerprint(event),
        type: event.type, phaseId: event.phaseId || game.challenges.find(c => c.id === event.challengeId)?.phaseId || null,
        challengeId: event.challengeId || null, payload: event, observedAt, correctness: outcome.correctness,
        attempt: outcome.attempt, responseTimeMs: outcome.responseTimeMs, derivedTypes: outcome.derivedTypes } });
      await tx.gameplayEvidenceSession.update({ where: { id: sessionId }, data: { state: outcome.state, status: outcome.state.status } });
      const observations = await evidence(tx, scope, sequence), mastery = deriveMastery(observations);
      await tx.curriculumNodeMastery.update({ where: { id: scope.id }, data: { nextSequence: sequence, ...mastery } });
      return receipt(row);
    });
  }
  async function loadLearnerState(raw) {
    fields(raw, ['learnerId', 'artifactVersionId', 'nodeId']);
    const learnerId = id(raw.learnerId), artifactVersionId = id(raw.artifactVersionId), nodeId = id(raw.nodeId);
    return transaction(async tx => {
      await lockLearner(tx, learnerId);
      const context = await contexts.buildInTransaction(tx, { curriculumArtifactVersionId: artifactVersionId, curriculumNodeId: nodeId });
      const sourceNodeId = context.curriculum.nodeId;
      const scopeId = scopeIdentity(learnerId, artifactVersionId, nodeId); await lockScope(tx, scopeId);
      const scope = await tx.curriculumNodeMastery.findUnique({ where: { id: scopeId } });
      if (!scope) return normalizeLearnerState({ learnerId, artifactVersionId, nodeId: sourceNodeId, observations: [] });
      if (scope.id !== scopeIdentity(scope.learnerId, scope.artifactVersionId, scope.nodeId)) fail('EVIDENCE_SCOPE_MISMATCH');
      const observations = await evidence(tx, scope), mastery = deriveMastery(observations);
      if (scope.status !== mastery.status || scope.sampleSize !== mastery.sampleSize || scope.policyVersion !== mastery.policyVersion) fail('MASTERY_PROJECTION_DRIFT');
      const latest = observations.slice(-5);
      return normalizeLearnerState({ learnerId, artifactVersionId, nodeId: sourceNodeId, previousDifficulty: latest.at(-1)?.provenance.difficulty || null,
        mastery: { status: mastery.status, sampleSize: mastery.sampleSize || null },
        observations: latest.map(({ provenance, ...observation }) => observation) });
    });
  }
  return Object.freeze({ openSession, ingestEvent, loadLearnerState });
}
function receipt(row) {
  return freeze({ eventId: row.eventKey, sequence: row.sequence, attempt: row.attempt, correctness: row.correctness, derivedTypes: structuredClone(row.derivedTypes) });
}
module.exports = { createGameplayService, CONTRACT };

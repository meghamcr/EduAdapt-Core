'use strict';
const { isDeepStrictEqual: equal } = require('node:util');
const { fingerprint } = require('../curriculumIngestion/curriculumIdentity');
const { parseEvent, fail } = require('./gameplayEvents');
const { initialState, applyEvent } = require('./gameplayState');
const MASTERY_POLICY = 'source-recall-mastery-v1';
function replaySession(session, game, events) {
  let state = initialState();
  for (const row of events) {
    const event = parseEvent(row.payload);
    if (row.sessionId !== session.id || row.scopeId !== session.scopeId || row.sequence !== state.sequence + 1 ||
        row.eventKey !== event.eventId || row.type !== event.type || row.payloadFingerprint !== fingerprint(event) ||
        row.phaseId !== (event.phaseId || game.challenges.find(c => c.id === event.challengeId)?.phaseId || null) || row.challengeId !== (event.challengeId || null)) fail('EVENT_INTEGRITY_FAILED');
    const result = applyEvent(game, state, event, new Date(row.observedAt).getTime());
    for (const key of ['correctness', 'attempt', 'responseTimeMs', 'derivedTypes']) if (!equal(row[key], result[key])) fail('EVENT_INTEGRITY_FAILED');
    state = result.state;
  }
  if (!equal(state, session.state) || state.status !== session.status) fail('SESSION_INTEGRITY_FAILED');
  return state;
}
function observationsFor(session, state, events, game) {
  return state.resolved.map(item => {
    const event = events.find(e => e.sequence === item.finalSequence);
    if (!event || !Number.isSafeInteger(event.scopeSequence)) fail('EVENT_INTEGRITY_FAILED');
    return {
      id: `${session.id}_${item.challengeId}`, correctness: item.correctness, accuracy: null,
      attempts: item.attempts || null, hintsUsed: item.hintsUsed, mistakes: item.mistakes,
      responseTimeSec: item.responseTimeSec, skipped: item.skipped, completion: item.completion, abandoned: item.abandoned,
      misconceptionCodes: null,
      provenance: { sessionId: session.id, gameSpecId: session.gameSpecId, specificationChecksum: session.specificationChecksum,
        artifactVersionId: session.artifactVersionId, nodeId: session.nodeId, challengeId: item.challengeId,
        difficulty: session.difficulty, remediation: item.remediation, scopeSequence: event.scopeSequence, objectiveRefs: [],
        taskFingerprint: fingerprint(game.challenges.find(c => c.id === item.challengeId).prompt),
        evidenceKind: 'DOMAIN_VERIFIED_SOURCE_RECALL', timingKind: 'SERVER_RECEIPT_INTERVAL' }
    };
  });
}
function deriveMastery(observations) {
  const window = observations.slice(-5);
  const strong = window.filter(o => o.correctness === true && o.completion && !o.skipped && !o.abandoned && o.attempts === 1 && o.hintsUsed === 0 && o.mistakes === 0 && !o.provenance.remediation);
  const struggle = window.filter(o => o.mistakes >= 2 || o.correctness === false && o.attempts >= 1);
  const varied = new Set(strong.map(o => o.provenance.taskFingerprint)).size >= 2 && new Set(strong.map(o => o.provenance.sessionId)).size >= 2;
  const status = struggle.length >= 2 ? 'NOT_MASTERED' : strong.length >= 3 && varied && !window.some(o => o.mistakes > 0 || o.skipped || o.abandoned || o.hintsUsed > 0 || o.provenance.remediation) ? 'MASTERED' : 'UNKNOWN';
  return { status, sampleSize: window.length, policyVersion: MASTERY_POLICY };
}
module.exports = { replaySession, observationsFor, deriveMastery, MASTERY_POLICY };

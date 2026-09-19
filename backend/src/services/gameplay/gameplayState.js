'use strict';
const { fail } = require('./gameplayEvents');
const { scoreChallenge } = require('./gameplayScoring');
function initialState() { return { status: 'CREATED', phaseIndex: -1, challengeIndex: 0, active: null, resolved: [], sequence: 0, lastTime: null }; }
function applyEvent(game, before, event, time) {
  const state = structuredClone(before), derivedTypes = [];
  if (!Number.isSafeInteger(time) || state.lastTime !== null && time < state.lastTime) fail('CLOCK_NOT_MONOTONIC');
  if (state.sequence >= 500) fail('SESSION_EVENT_LIMIT');
  if (['COMPLETED', 'ABANDONED'].includes(state.status)) fail('SESSION_TERMINAL');
  let correctness = null, attempt = null, responseTimeMs = null;
  const phase = game.phases[state.phaseIndex];
  const challenge = event.challengeId ? game.challenges.find(c => c.id === event.challengeId) : null;
  if (event.challengeId && !challenge) fail('UNKNOWN_CHALLENGE');
  const finish = skipped => {
    state.resolved.push({ ...state.active, completion: !skipped, skipped, abandoned: false, finalSequence: state.sequence + 1 });
    state.active = null; state.challengeIndex++; derivedTypes.push('CHALLENGE_COMPLETED');
  };
  if (event.type === 'GAME_STARTED') {
    if (state.status !== 'CREATED') fail('INVALID_SEQUENCE'); state.status = 'STARTED';
  } else {
    if (state.status !== 'STARTED') fail('GAME_NOT_STARTED');
    if (['PHASE_STARTED', 'REMEDIATION_STARTED'].includes(event.type)) {
      const next = game.phases[state.phaseIndex + 1];
      if (!next || event.phaseId !== next.id || state.active || game.challenges.slice(state.challengeIndex).some(c => c.phaseId === phase?.id)) fail('PHASE_ORDER');
      if ((next.type === 'REMEDIATION') !== (event.type === 'REMEDIATION_STARTED')) fail('PHASE_EVENT_TYPE');
      state.phaseIndex++;
      if (event.type === 'REMEDIATION_STARTED') derivedTypes.push('PHASE_STARTED');
    } else if (event.type === 'CHALLENGE_PRESENTED') {
      if (state.active || game.challenges[state.challengeIndex]?.id !== challenge.id || challenge.phaseId !== phase?.id) fail('CHALLENGE_ORDER');
      state.active = { challengeId: challenge.id, attempts: 0, hintsUsed: 0, mistakes: 0, correctness: null,
        presentedAt: time, responseTimeSec: null, remediation: phase.type === 'REMEDIATION' || game.academicMode === 'REMEDIATION' };
    } else if (['ANSWER_SUBMITTED', 'HINT_REQUESTED', 'CHALLENGE_SKIPPED'].includes(event.type)) {
      if (!state.active || state.active.challengeId !== challenge.id) fail('CHALLENGE_NOT_ACTIVE');
      if (event.type === 'ANSWER_SUBMITTED') {
        correctness = scoreChallenge(challenge, event.response); attempt = ++state.active.attempts;
        const elapsed = time - state.active.presentedAt;
        // Receipt latency is not cognitive processing time. Excessive intervals
        // remain unknown rather than being clipped into invented evidence.
        responseTimeMs = elapsed <= 86400000 ? elapsed : null;
        state.active.responseTimeSec = responseTimeMs === null ? null : responseTimeMs / 1000;
        state.active.correctness = correctness; if (!correctness) state.active.mistakes++;
        derivedTypes.push(correctness ? 'ANSWER_CORRECT' : 'ANSWER_INCORRECT');
        if (correctness) finish(false);
      } else if (event.type === 'HINT_REQUESTED') {
        if (!game.instructionalPolicy.hintsAllowed || !challenge.hint) fail('HINT_NOT_ALLOWED'); state.active.hintsUsed++;
      } else finish(true);
    } else if (event.type === 'GAME_COMPLETED') {
      if (state.active || state.challengeIndex !== game.challenges.length || phase?.type !== 'COMPLETE') fail('GAME_INCOMPLETE');
      state.status = 'COMPLETED';
    } else if (event.type === 'GAME_ABANDONED') {
      if (state.active) {
        state.resolved.push({ ...state.active, completion: false, skipped: false, abandoned: true, finalSequence: state.sequence + 1 }); state.active = null;
      }
      state.status = 'ABANDONED';
    } else fail('CLIENT_EVENT_NOT_ALLOWED');
  }
  state.sequence++; state.lastTime = time;
  return { state, correctness, attempt, responseTimeMs, derivedTypes };
}
module.exports = { initialState, applyEvent };

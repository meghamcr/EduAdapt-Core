'use strict';
const { copyJson } = require('../gameGeneration/gameValidation');
class GameplayError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'GameplayError'; }
}
function fail(code) { throw new GameplayError(code); }
function fields(value, allowed, required = allowed) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !allowed.includes(k)) || required.some(k => !Object.hasOwn(value, k))) fail('INVALID_FIELDS');
}
function id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(value)) fail('INVALID_ID'); return value; }
const CLIENT_EVENTS = Object.freeze(['GAME_STARTED', 'PHASE_STARTED', 'CHALLENGE_PRESENTED', 'ANSWER_SUBMITTED', 'HINT_REQUESTED', 'CHALLENGE_SKIPPED', 'REMEDIATION_STARTED', 'GAME_COMPLETED', 'GAME_ABANDONED']);
function parseEvent(raw) {
  let event; try { event = copyJson(raw, 2048); } catch { fail('INVALID_EVENT'); }
  const phase = ['PHASE_STARTED', 'REMEDIATION_STARTED'].includes(event?.type);
  const challenge = ['CHALLENGE_PRESENTED', 'ANSWER_SUBMITTED', 'HINT_REQUESTED', 'CHALLENGE_SKIPPED'].includes(event?.type);
  const keys = ['eventId', 'type', ...(phase ? ['phaseId'] : []), ...(challenge ? ['challengeId'] : []), ...(event?.type === 'ANSWER_SUBMITTED' ? ['response'] : [])];
  fields(event, keys); id(event.eventId);
  if (!CLIENT_EVENTS.includes(event.type)) fail('CLIENT_EVENT_NOT_ALLOWED');
  if (phase) id(event.phaseId); if (challenge) id(event.challengeId);
  if (event.type === 'ANSWER_SUBMITTED' && !(typeof event.response === 'string' && event.response.length <= 120 || Number.isSafeInteger(event.response) && event.response >= 0 && event.response < 6)) fail('INVALID_RESPONSE');
  return event;
}
module.exports = { GameplayError, fail, fields, id, parseEvent, CLIENT_EVENTS };

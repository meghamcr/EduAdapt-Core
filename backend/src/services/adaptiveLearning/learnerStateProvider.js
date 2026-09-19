const states = new WeakSet();
const DIFFICULTIES = Object.freeze(['EASY', 'MEDIUM', 'HARD']);
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function object(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).some(k => !keys.includes(k))) fail('INVALID_EVIDENCE_FIELDS');
}
function id(value) { if (typeof value !== 'string' || !value.trim() || value !== value.trim()) fail('INVALID_EVIDENCE_ID'); return value; }
function number(value, integer = false, max = Infinity) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) fail('INVALID_EVIDENCE_NUMBER');
  return value;
}
function boolean(value) { if (value === undefined || value === null) return null; if (typeof value !== 'boolean') fail('INVALID_EVIDENCE_BOOLEAN'); return value; }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
// Server-side trust adapter only. This is NOT authentication of browser payloads.
function normalizeLearnerState(input) {
  object(input, ['learnerId', 'artifactVersionId', 'nodeId', 'previousDifficulty', 'mastery', 'observations']);
  const previousDifficulty = input.previousDifficulty ?? null;
  if (previousDifficulty !== null && !DIFFICULTIES.includes(previousDifficulty)) fail('INVALID_DIFFICULTY');
  let mastery = { status: 'UNKNOWN', sampleSize: null, confidence: null };
  if (input.mastery !== undefined && input.mastery !== null) {
    object(input.mastery, ['status', 'sampleSize', 'confidence']);
    if (!['UNKNOWN', 'MASTERED', 'NOT_MASTERED'].includes(input.mastery.status)) fail('INVALID_MASTERY');
    mastery = { status: input.mastery.status, sampleSize: number(input.mastery.sampleSize, true), confidence: number(input.mastery.confidence, false, 1) };
    if (mastery.status !== 'UNKNOWN' && !(mastery.sampleSize > 0)) fail('MASTERY_EVIDENCE_REQUIRED');
    if (mastery.status !== 'UNKNOWN' && mastery.confidence === 0) fail('CONTRADICTORY_MASTERY');
  }
  if (input.observations !== undefined && !Array.isArray(input.observations)) fail('INVALID_OBSERVATIONS');
  const seen = new Set();
  const observations = (input.observations || []).map(raw => {
    object(raw, ['id', 'correctness', 'accuracy', 'attempts', 'responseTimeSec', 'hintsUsed', 'skipped', 'mistakes', 'misconceptionCodes', 'completion', 'abandoned']);
    const key = id(raw.id); if (seen.has(key)) fail('DUPLICATE_OBSERVATION'); seen.add(key);
    const row = { id: key, correctness: boolean(raw.correctness), accuracy: number(raw.accuracy, false, 1), attempts: number(raw.attempts, true), responseTimeSec: number(raw.responseTimeSec), hintsUsed: number(raw.hintsUsed, true), skipped: boolean(raw.skipped), mistakes: number(raw.mistakes, true), completion: boolean(raw.completion), abandoned: boolean(raw.abandoned), misconceptionCodes: null };
    if (row.attempts === 0) fail('INVALID_ATTEMPTS');
    if (raw.misconceptionCodes !== undefined && raw.misconceptionCodes !== null) {
      if (!Array.isArray(raw.misconceptionCodes)) fail('INVALID_MISCONCEPTIONS');
      row.misconceptionCodes = [...new Set(raw.misconceptionCodes.map(id))].sort();
    }
    if (row.correctness !== null && row.accuracy !== null && row.accuracy !== Number(row.correctness)) fail('CONTRADICTORY_OUTCOME');
    if (row.completion === true && (row.abandoned === true || row.skipped === true)) fail('CONTRADICTORY_COMPLETION');
    return row;
  });
  const state = freeze({ learnerId: id(input.learnerId), artifactVersionId: id(input.artifactVersionId), nodeId: id(input.nodeId), previousDifficulty, mastery, observations });
  states.add(state); return state;
}
function requireLearnerState(value) { if (!states.has(value)) fail('NORMALIZED_LEARNER_STATE_REQUIRED'); }
module.exports = { normalizeLearnerState, requireLearnerState, DIFFICULTIES, fail, freeze, object, id };

'use strict';

const { isDeepStrictEqual: equal } = require('node:util');
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const { schema, LIMITS, EVENTS } = require('./gameContract');

// Fixed error codes/paths only: never echo candidate text, property names or
// provider exception messages into diagnostics.
function checkSchema(value, rule, path = '$', errors = []) {
  const add = code => { if (errors.length < 100) errors.push({ code, path }); };
  if (rule.anyOf) {
    if (!rule.anyOf.some(branch => checkSchema(value, branch, path, []).length === 0)) add('TYPE');
    return errors;
  }
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (rule.type === 'integer' ? !Number.isSafeInteger(value) : type !== rule.type) { add('TYPE'); return errors; }
  if (rule.enum && !rule.enum.includes(value)) add('ENUM');
  if (type === 'object') {
    if (Object.keys(value).some(key => !Object.hasOwn(rule.properties, key))) add('UNKNOWN_FIELD');
    for (const key of rule.required) {
      if (!Object.hasOwn(value, key)) errors.push({ code: 'REQUIRED', path: `${path}.${key}` });
      else checkSchema(value[key], rule.properties[key], `${path}.${key}`, errors);
      if (errors.length >= 100) break;
    }
  } else if (type === 'array') {
    if (value.length < rule.minItems || value.length > rule.maxItems) add('ARRAY_SIZE');
    value.slice(0, rule.maxItems).forEach((item, i) => checkSchema(item, rule.items, `${path}[${i}]`, errors));
  } else if (type === 'string') {
    if (value.length < (rule.minLength || 0) || value.length > (rule.maxLength || Infinity)) add('TEXT_SIZE');
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) add('IDENTIFIER');
  } else if (rule.type === 'integer' && (value < rule.minimum || value > rule.maximum)) add('NUMBER_RANGE');
  return errors;
}

// Reject non-JSON data, accessors, cycles, excessive nesting, and oversize input
// before serialization. Avoid invoking user-defined toJSON/getters.
function copyJson(input, maxBytes = LIMITS.candidateBytes) {
  const seen = new Set(); let budget = maxBytes;
  function visit(value, depth) {
    if (depth > LIMITS.depth) throw new Error('JSON_LIMIT');
    if (typeof value === 'string') {
      budget -= Buffer.byteLength(JSON.stringify(value));
    } else if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) budget -= 24;
    else {
      if (!value || typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) throw new Error('JSON_INVALID');
      seen.add(value);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) throw new Error('JSON_INVALID');
      if (Array.isArray(value) && (Object.keys(value).length !== value.length ||
          Object.keys(value).some((key, index) => key !== String(index)))) throw new Error('JSON_INVALID');
      const result = Array.isArray(value) ? [] : {};
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (Array.isArray(value) && key === 'length') continue;
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('JSON_INVALID');
        budget -= Buffer.byteLength(key) + 4;
        if (budget < 0) throw new Error('JSON_LIMIT');
        result[key] = visit(descriptor.value, depth + 1);
      }
      seen.delete(value);
      if (Array.isArray(value) && result.length !== Object.keys(value).length) throw new Error('JSON_INVALID');
      return result;
    }
    if (budget < 0) throw new Error('JSON_LIMIT');
    return value;
  }
  return visit(input, 0);
}

function decodeCandidate(raw) {
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw) > LIMITS.candidateBytes) throw new Error('JSON_LIMIT');
    try { raw = JSON.parse(raw); } catch { throw new Error('MALFORMED_JSON'); }
  }
  return copyJson(raw);
}

function validateGame(candidate, request) {
  // Only the bounded builder can issue a request accepted as authority.
  require('./generationRequest').requireRequest(request);
  let game;
  try { game = decodeCandidate(candidate); }
  catch { return freeze({ valid: false, errors: [{ code: 'CANDIDATE_JSON_INVALID', path: '$' }] }); }
  const errors = checkSchema(game, schema);
  const add = (code, path) => { if (errors.length < 100) errors.push({ code, path }); };
  if (errors.length) return freeze({ valid: false, errors });
  const a = request.academicGrounding, policy = request.instructionalPolicy;
  const evidence = new Map(a.evidence.map(e => [e.id, e]));
  if (game.gameId !== request.gameId) add('GAME_ID_MISMATCH', '$.gameId');
  if (!equal(game.grounding, a.target)) add('ACADEMIC_SCOPE_MISMATCH', '$.grounding');
  if (game.academicMode !== a.mode) add('ACADEMIC_MODE_MISMATCH', '$.academicMode');
  if (!equal(game.instructionalPolicy, policy)) add('ADAPTIVE_POLICY_MISMATCH', '$.instructionalPolicy');
  const hasEvidence = (id, path) => { if (!evidence.has(id)) add('UNKNOWN_EVIDENCE', path); return evidence.get(id); };
  const unique = (items, path) => { if (new Set(items).size !== items.length) add('DUPLICATE_ID', path); };
  unique(game.claims.map(c => c.evidenceId), '$.claims');
  game.claims.forEach((claim, i) => {
    const ref = hasEvidence(claim.evidenceId, `$.claims[${i}].evidenceId`);
    if (ref && claim.text !== ref.text) add('UNSUPPORTED_ACADEMIC_CLAIM', `$.claims[${i}].text`);
  });
  const claimIds = new Set(game.claims.map(c => c.evidenceId));
  unique(game.phases.map(p => p.id), '$.phases');
  unique(game.phases.map(p => p.type), '$.phases');
  if (game.phases[0].type !== 'INTRO' || game.phases.at(-1).type !== 'COMPLETE') add('PHASE_LIFECYCLE', '$.phases');
  const phases = new Map(game.phases.map((p, index) => [p.id, { ...p, index }]));
  game.phases.forEach((p, i) => {
    unique(p.teachingRefs, `$.phases[${i}].teachingRefs`);
    p.teachingRefs.forEach(id => hasEvidence(id, `$.phases[${i}].teachingRefs`));
    const expectedInstruction = p.type === 'INTRO' ? 'WELCOME' : p.type === 'COMPLETE' ? 'CELEBRATE' : ['TEACH', 'DEMONSTRATE'].includes(p.type) ? 'READ_SOURCE' : policy.guidanceLevel === 'STEP_BY_STEP' ? 'TRY_WITH_SUPPORT' : 'COMPLETE_CHALLENGES';
    if (p.instruction !== expectedInstruction) add('PHASE_INSTRUCTION', `$.phases[${i}].instruction`);
  });
  unique(game.challenges.map(c => c.id), '$.challenges');
  game.challenges.forEach((c, i) => {
    const path = `$.challenges[${i}]`, ref = hasEvidence(c.prompt.evidenceId, `${path}.prompt.evidenceId`);
    if (!equal(c.groundingRefs, [c.prompt.evidenceId]) || !claimIds.has(c.prompt.evidenceId)) add('CHALLENGE_GROUNDING', `${path}.groundingRefs`);
    if (ref) {
      const { start, end } = c.prompt;
      // UTF-16 offsets, whole token spans only; the prompt is the FULL source
      // passage with this span blanked. Never a model paraphrase/question pair.
      if (end <= start || end > ref.text.length || start === 0 && end === ref.text.length ||
          (start > 0 && !/\s/u.test(ref.text[start - 1])) || (end < ref.text.length && !/\s/u.test(ref.text[end])) ||
          c.correctAnswer !== ref.text.slice(start, end) || c.correctAnswer.trim() !== c.correctAnswer) add('ANSWER_NOT_SOURCE_SPAN', `${path}.correctAnswer`);
      if (c.type === 'MCQ_CLOZE') {
        if (c.options.length < 2 || new Set(c.options).size !== c.options.length || !c.options.includes(c.correctAnswer)) add('MCQ_OPTIONS', `${path}.options`);
        // Alternatives are explicitly source fragments, not asserted false facts.
        if (c.options.some(option => !ref.text.includes(option))) add('UNSUPPORTED_OPTION', `${path}.options`);
      } else if (c.options.length) add('UNEXPECTED_OPTIONS', `${path}.options`);
    }
    if (c.difficulty !== policy.difficulty) add('DIFFICULTY_MISMATCH', `${path}.difficulty`);
    if (c.telemetryKey !== c.id) add('TELEMETRY_KEY', `${path}.telemetryKey`);
    if (c.feedback.evidenceId !== c.prompt.evidenceId) add('FEEDBACK_GROUNDING', `${path}.feedback`);
    if (policy.hintsAllowed ? !c.hint || c.hint.evidenceId !== c.prompt.evidenceId : c.hint !== null) add('HINT_POLICY', `${path}.hint`);
    const phase = phases.get(c.phaseId);
    if (!phase || ['INTRO', 'TEACH', 'DEMONSTRATE', 'COMPLETE'].includes(phase.type)) add('CHALLENGE_PHASE', `${path}.phaseId`);
    if (policy.scaffoldingLevel === 'HIGH' || policy.reinforcementLevel === 'HIGH') {
      if (!game.phases.some(p => ['TEACH', 'DEMONSTRATE'].includes(p.type) && phases.get(p.id).index < (phase?.index ?? -1) && p.teachingRefs.includes(c.prompt.evidenceId))) add('SCAFFOLDING_REQUIRED', `${path}.phaseId`);
    }
    if (policy.guidanceLevel === 'STEP_BY_STEP' && !['GUIDED_PRACTICE', 'REMEDIATION'].includes(phase?.type)) add('GUIDANCE_REQUIRED', `${path}.phaseId`);
  });
  if (a.mode === 'REMEDIATION' && !game.challenges.some(c => phases.get(c.phaseId)?.type === 'REMEDIATION')) add('REMEDIATION_PHASE_REQUIRED', '$.phases');
  const ids = game.challenges.map(c => c.id);
  if (!equal(game.completion.challengeIds, ids)) add('COMPLETION_MISMATCH', '$.completion');
  if (!equal(game.telemetry.events, EVENTS) || !equal(game.telemetry.challengeKeys, ids) || !equal(game.telemetry.binding, {
    gameId: game.gameId, specVersion: 1, artifactVersionId: a.target.artifactVersionId, nodeId: a.target.nodeId, difficulty: policy.difficulty, learningObjectiveRefs: []
  })) add('TELEMETRY_BINDING', '$.telemetry');
  return freeze({ valid: errors.length === 0, errors });
}
module.exports = { validateGame, checkSchema, copyJson, decodeCandidate };

'use strict';
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const VERSION = 'level-game-plan-v1';
// Capabilities describe what the existing validator, scorer and renderer can
// actually execute. They are not curriculum keyword → mechanic mappings.
const CAPABILITIES = freeze({ version: 'visual-construction-capabilities-v1', languages: ['en'],
  supported: [
    { mechanic: 'CONSTRUCTION', family: 'BLOCK_MODEL', purposes: ['MATCH_GENERATED_REFERENCE'], evidence: 'VALIDATED_GENERATED_GEOMETRY' },
    { mechanic: 'CLOZE', family: 'TEXT_RESPONSE', purposes: ['RECALL_EXPLICIT_TEXT'], evidence: 'EXACT_SOURCE_SPAN' },
    { mechanic: 'MCQ_CLOZE', family: 'OPTION_RESPONSE', purposes: ['RECALL_EXPLICIT_TEXT'], evidence: 'EXACT_SOURCE_SPAN' }
  ],
  unsupported: [
    { mechanic: 'CONSTRUCTION', family: 'BLOCK_MODEL', purposes: ['MATCH_GENERATED_REFERENCE'], evidence: 'VALIDATED_GENERATED_GEOMETRY' },'MATCHING', 'CLASSIFICATION', 'SEQUENCING', 'VISUAL_IDENTIFICATION',
    'DRAG_DROP', 'EXPLORATION', 'PUZZLE', 'PASSAGE_COMPREHENSION', 'GUIDED_INVESTIGATION', 'OBSERVATION', 'MULTI_STAGE_REASONING'],
  limits: ['EXPLICIT_SOURCE_OR_VALIDATED_GENERATED_MODEL', 'ONE_APPROVED_NODE_PER_GAME', 'NO_VISUAL_INFERENCE', 'NO_UNANSWERED_TASK_SOLUTIONS', 'NO_LEVEL_MASTERY_CLAIM']
});
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const text = (maxLength = 160) => ({ type: 'string', minLength: 1, maxLength });
const enumeration = values => ({ type: 'string', enum: values });
const array = (items, minItems = 0, maxItems = 128) => ({ type: 'array', items, minItems, maxItems });
const DEFER_REASONS = ['VISUAL_DEPENDENCY', 'UNANSWERED_TASK', 'UNSUPPORTED_MECHANIC', 'SUPPORT_MATERIAL', 'NOT_SELECTED'];
const gameObject = properties => {const s=object(properties);s.required=s.required.filter(k=>k!=='construction');return s;};
const schema = freeze(object({
  planVersion: enumeration([VERSION]), requestFingerprint: { ...text(64), pattern: '^[a-f0-9]{64}$' },
  status: enumeration(['READY', 'UNSUPPORTED']),
  games: array(gameObject({ construction: require('../educationalVisuals/construction').schema, id: { ...text(64), pattern: '^[a-zA-Z0-9_-]+$' },
    materialRefs: array(text(), 1, 16), mechanic: enumeration(CAPABILITIES.supported.map(c => c.mechanic)),
    purpose: enumeration(['RECALL_EXPLICIT_TEXT','MATCH_GENERATED_REFERENCE']) }), 0, 8),
  deferred: array(object({ materialRef: text(), reason: enumeration(DEFER_REASONS),
    requiredCapability: enumeration(['NONE', 'CONSTRUCTION', ...CAPABILITIES.unsupported]) }))
}));
module.exports = { VERSION, CAPABILITIES, schema };

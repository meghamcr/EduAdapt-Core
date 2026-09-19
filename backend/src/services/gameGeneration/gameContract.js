'use strict';

const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const VERSION = 'source-game-v1';
const LIMITS = freeze({ requestBytes: 180000, candidateBytes: 100000, evidenceCount: 64, repairCount: 2, depth: 20 });
const PHASES = ['INTRO', 'TEACH', 'DEMONSTRATE', 'GUIDED_PRACTICE', 'CORE_GAMEPLAY', 'ADAPTIVE_CHALLENGE', 'MASTERY_CHECK', 'REMEDIATION', 'COMPLETE'];
const EVENTS = ['GAME_STARTED', 'PHASE_STARTED', 'CHALLENGE_PRESENTED', 'ANSWER_SUBMITTED', 'ANSWER_CORRECT', 'ANSWER_INCORRECT', 'HINT_REQUESTED', 'CHALLENGE_SKIPPED', 'REMEDIATION_STARTED', 'CHALLENGE_COMPLETED', 'GAME_COMPLETED', 'GAME_ABANDONED'];
const enumeration = values => ({ type: 'string', enum: values });
const text = (maxLength = 12000) => ({ type: 'string', minLength: 1, maxLength });
const identifier = { ...text(160), pattern: '^[a-zA-Z0-9_-]+$' };
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const array = (items, minItems = 0, maxItems = 32) => ({ type: 'array', items, minItems, maxItems });
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const objectiveRefs = array(identifier, 0, 0); // Phase 3B has no selected-node applicability assertion.
const instructionalPolicy = object({
  difficulty: enumeration(['EASY', 'MEDIUM', 'HARD']),
  scaffoldingLevel: enumeration(['HIGH', 'MODERATE', 'LOW']), hintsAllowed: { type: 'boolean' },
  guidanceLevel: enumeration(['STEP_BY_STEP', 'ON_DEMAND']),
  challengeIntensity: enumeration(['EASY', 'MEDIUM', 'HARD']), reinforcementLevel: enumeration(['HIGH', 'STANDARD'])
});
const hint = object({ template: enumeration(['REREAD_SOURCE']), evidenceId: identifier });
const schema = freeze(object({
  contractVersion: enumeration([VERSION]), gameId: identifier, specVersion: integer(1, 1),
  metadata: object({ title: enumeration(['Source Quest', 'Discovery Trail', 'Memory Journey']),
    fiction: object({ setting: enumeration(['CLOUD_GARDEN', 'STAR_LIBRARY', 'ISLAND']),
      character: enumeration(['MIRA', 'ROBOT_COMPANION', 'FRIENDLY_DRAGON']),
      narrative: enumeration(['COLLECT_STARS', 'RESTORE_STORYBOOK', 'FOLLOW_TRAIL']),
      dialogue: enumeration(['LET_US_EXPLORE', 'TRY_TOGETHER', 'KEEP_GOING']) }) }),
  grounding: object({ artifactVersionId: text(200), nodeId: text(200), mappedNodeId: text(200) }),
  academicMode: enumeration(['PRIMARY', 'REINFORCEMENT', 'REMEDIATION', 'PREREQUISITE']),
  instructionalPolicy, learningObjectiveRefs: objectiveRefs,
  claims: array(object({ evidenceId: identifier, text: text() }), 1, 64),
  phases: array(object({ id: identifier, type: enumeration(PHASES),
    instruction: enumeration(['WELCOME', 'READ_SOURCE', 'TRY_WITH_SUPPORT', 'COMPLETE_CHALLENGES', 'CELEBRATE']),
    teachingRefs: array(identifier, 0, 64) }), 3, 10),
  challenges: array(object({ id: identifier, type: enumeration(['CLOZE', 'MCQ_CLOZE']), phaseId: identifier,
    prompt: object({ template: enumeration(['SOURCE_CLOZE']), evidenceId: identifier, start: integer(0, 11999), end: integer(1, 12000) }),
    groundingRefs: array(identifier, 1, 1), learningObjectiveRefs: objectiveRefs,
    correctAnswer: text(120), options: array(text(120), 0, 6),
    feedback: object({ correct: enumeration(['MATCHED_SOURCE']), incorrect: enumeration(['REVISIT_SOURCE']), evidenceId: identifier }),
    hint: { anyOf: [hint, { type: 'null' }] }, difficulty: enumeration(['EASY', 'MEDIUM', 'HARD']), telemetryKey: identifier
  }), 1, 24),
  completion: object({ type: enumeration(['ALL_CHALLENGES']), challengeIds: array(identifier, 1, 24) }),
  reward: object({ type: enumeration(['DECORATIVE_STAR', 'CELEBRATION']), quantity: integer(1, 10) }),
  visuals: object({ theme: enumeration(['PAPER', 'PIXEL', 'PLAIN']),
    assets: array(enumeration(['DECORATIVE_BACKGROUND', 'FICTIONAL_COMPANION', 'REWARD_ICON']), 0, 3) }),
  telemetry: object({ events: array(enumeration(EVENTS), EVENTS.length, EVENTS.length),
    binding: object({ gameId: identifier, specVersion: integer(1, 1), artifactVersionId: text(200), nodeId: text(200),
      difficulty: enumeration(['EASY', 'MEDIUM', 'HARD']), learningObjectiveRefs: objectiveRefs }),
    challengeKeys: array(identifier, 1, 24) })
}));

// Only these reviewed non-academic template strings may be rendered. No generated
// arbitrary prose or executable URLs/asset paths cross the validation boundary.
const templates = freeze({
  CLOUD_GARDEN: 'In a make-believe cloud garden', STAR_LIBRARY: 'In an imaginary star library', ISLAND: 'On a pretend island',
  MIRA: 'Mira', ROBOT_COMPANION: 'a robot companion', FRIENDLY_DRAGON: 'a friendly dragon',
  COLLECT_STARS: 'collects pretend stars with you.', RESTORE_STORYBOOK: 'restores an imaginary storybook with you.', FOLLOW_TRAIL: 'follows a pretend trail with you.',
  LET_US_EXPLORE: 'Let us explore!', TRY_TOGETHER: 'Let us try together!', KEEP_GOING: 'Keep going!',
  WELCOME: 'Welcome to the source quest.', READ_SOURCE: 'Read the source passage.', TRY_WITH_SUPPORT: 'Read the passage, find the missing text, then check your answer.',
  COMPLETE_CHALLENGES: 'Complete the source challenges.', CELEBRATE: 'You completed the quest!',
  SOURCE_CLOZE: 'Restore the missing text from this source passage.', REREAD_SOURCE: 'Read the source passage again.',
  MATCHED_SOURCE: 'Your answer matches the source text.', REVISIT_SOURCE: 'Compare your answer with the source text.'
});
module.exports = { VERSION, LIMITS, PHASES: freeze(PHASES), EVENTS: freeze(EVENTS), schema, instructionalPolicy, templates };

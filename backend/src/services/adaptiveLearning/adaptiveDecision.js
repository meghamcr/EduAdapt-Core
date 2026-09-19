const { requireLearnerState, DIFFICULTIES, fail, freeze, object } = require('./learnerStateProvider');
const { evaluatePrerequisites } = require('./prerequisitePolicy');
const POLICY = freeze({ version: 'adaptive-v1', window: 5, minimumSamples: 3, strongAccuracy: 0.85, weakAccuracy: 0.6, maximumStrongAttempts: 2, maximumStrongHints: 1, repeatedSignalCount: 2 });
function decideAdaptiveLearning(input) {
  object(input, ['context', 'learnerState', 'prerequisites']);
  const { context, learnerState, prerequisites } = input;
  // Caller must obtain this object from the trusted Phase 3B builder. Shape/freeze
  // checks are defense in depth, not a substitute for server-side authorization.
  if (!context || !Object.isFrozen(context) || context.contextVersion !== 1 || context.grounding?.reviewStatus !== 'APPROVED' || context.grounding?.imported !== true || context.constraints?.academicScopeLocked !== true || context.constraints?.allowAcademicInference !== false || context.constraints?.contentScope !== 'SELECTED_NODE_ONLY' || typeof context.curriculum?.artifactVersionId !== 'string' || typeof context.curriculum?.nodeId !== 'string') fail('TRUSTED_GENERATION_CONTEXT_REQUIRED');
  requireLearnerState(learnerState);
  const s = learnerState, c = context.curriculum;
  if (s.artifactVersionId !== c.artifactVersionId || s.nodeId !== c.nodeId) fail('LEARNER_SCOPE_MISMATCH');
  const prerequisiteStatus = evaluatePrerequisites(prerequisites, context, s.learnerId);
  const rows = s.observations.slice(-POLICY.window), reasons = [], signals = {};
  const count = fn => rows.filter(fn).length;
  const outcome = r => r.accuracy ?? (r.correctness === null ? null : Number(r.correctness));
  signals.strong = count(r => outcome(r) !== null && outcome(r) >= POLICY.strongAccuracy && r.completion === true && r.hintsUsed !== null && r.hintsUsed <= POLICY.maximumStrongHints && r.attempts !== null && r.attempts <= POLICY.maximumStrongAttempts && r.mistakes === 0 && r.skipped === false && r.abandoned === false && (r.misconceptionCodes === null || r.misconceptionCodes.length === 0));
  signals.weak = count(r => outcome(r) !== null && outcome(r) < POLICY.weakAccuracy);
  signals.hintDependence = count(r => r.hintsUsed !== null && r.hintsUsed > POLICY.maximumStrongHints);
  signals.repeatedAttempts = count(r => r.attempts !== null && r.attempts > POLICY.maximumStrongAttempts);
  signals.mistakes = count(r => (r.mistakes !== null && r.mistakes > 0) || r.misconceptionCodes?.length > 0);
  signals.skips = count(r => r.skipped === true); signals.abandonment = count(r => r.abandoned === true);
  const repeated = key => signals[key] >= POLICY.repeatedSignalCount;
  for (const [key, code] of Object.entries({weak:'REPEATED_LOW_ACCURACY',hintDependence:'HIGH_HINT_DEPENDENCE',repeatedAttempts:'REPEATED_ATTEMPTS',mistakes:'REPEATED_MISTAKES',skips:'REPEATED_SKIPS',abandonment:'REPEATED_ABANDONMENT'})) if (repeated(key)) reasons.push(code);
  const negative = reasons.length > 0;
  const sufficient = count(r => Object.entries(r).some(([k, v]) => !['id', 'responseTimeSec'].includes(k) && v !== null && (!Array.isArray(v) || v.length > 0))) >= POLICY.minimumSamples;
  if (negative && s.mastery.status === 'MASTERED') reasons.push('MASTERY_CONFLICTS_WITH_RECENT_EVIDENCE');
  let difficulty = s.previousDifficulty || 'EASY', mode = 'PRIMARY';
  if (s.previousDifficulty === null) reasons.push('COLD_START');
  if (!sufficient) reasons.push('INSUFFICIENT_EVIDENCE');
  if (s.mastery.status === 'NOT_MASTERED') reasons.push('DEMONSTRATED_MASTERY_GAP');
  if (s.mastery.status === 'MASTERED') reasons.push('SUPPLIED_MASTERY_EVIDENCE');
  if (!prerequisiteStatus.dependentWorkAllowed) {
    mode = 'PREREQUISITE'; difficulty = 'EASY';
    reasons.push(prerequisiteStatus.status === 'GAP' ? 'PREREQUISITE_GAP' : 'PREREQUISITE_UNKNOWN');
  } else if (negative || s.mastery.status === 'NOT_MASTERED') {
    mode = 'REMEDIATION';
    if (sufficient && negative) difficulty = DIFFICULTIES[Math.max(0, DIFFICULTIES.indexOf(difficulty) - 1)];
  } else if (sufficient && signals.strong >= POLICY.minimumSamples && s.previousDifficulty !== null && !signals.weak && !signals.hintDependence && !signals.repeatedAttempts && !signals.mistakes && !signals.skips && !signals.abandonment) {
    difficulty = DIFFICULTIES[Math.min(2, DIFFICULTIES.indexOf(difficulty) + 1)]; mode = 'REINFORCEMENT'; reasons.push('SUSTAINED_STRONG_EVIDENCE');
  } else if (s.mastery.status === 'MASTERED') mode = 'REINFORCEMENT';
  if (difficulty === s.previousDifficulty) reasons.push('DIFFICULTY_HELD');
  else if (s.previousDifficulty !== null) reasons.push('DIFFICULTY_CHANGED');
  if (prerequisiteStatus.status === 'NOT_SUPPLIED') reasons.push('NO_PREREQUISITES_SUPPLIED');
  const needsSupport = mode === 'PREREQUISITE' || mode === 'REMEDIATION' || !sufficient || difficulty === 'EASY';
  const missing = rows.flatMap(r => Object.keys(r).filter(key => r[key] === null).map(field => ({ observationId: r.id, field })));
  if (!rows.length) missing.push({ observationId: null, field: 'observations' });
  if (s.mastery.status === 'UNKNOWN') missing.push({ observationId: null, field: 'mastery' });
  if (s.previousDifficulty === null) missing.push({ observationId: null, field: 'previousDifficulty' });
  return freeze({ decisionVersion: POLICY.version,
    academicDecision: { targetNodeId: c.nodeId, mappedNodeId: c.mappedNodeId, artifactVersionId: c.artifactVersionId, mode, dependentWorkAllowed: prerequisiteStatus.dependentWorkAllowed, requiresSeparatelyGroundedPrerequisiteContext: !prerequisiteStatus.dependentWorkAllowed, prerequisiteStatus, reasonCodes: [...reasons] },
    instructionalDecision: { difficulty, scaffoldingLevel: needsSupport ? 'HIGH' : difficulty === 'MEDIUM' ? 'MODERATE' : 'LOW', hintsAllowed: true, guidanceLevel: needsSupport ? 'STEP_BY_STEP' : 'ON_DEMAND', challengeIntensity: difficulty, reinforcementLevel: needsSupport ? 'HIGH' : 'STANDARD' },
    evidence: { learnerId: s.learnerId, confidence: sufficient && (signals.strong >= POLICY.minimumSamples || negative) ? 'SUPPORTED' : 'LIMITED', observationsUsed: structuredClone(rows), observationsMissing: missing, suppliedMastery: structuredClone(s.mastery), signals, reasonCodes: [...reasons], responseTimeUsedForDifficulty: false },
    constraints: { academicScopeLocked: true, difficultyCannotExpandScope: true, allowAcademicInference: false, automaticNodeCombinationAllowed: false, hierarchyImpliesPrerequisites: false }
  });
}
module.exports = { decideAdaptiveLearning, POLICY };

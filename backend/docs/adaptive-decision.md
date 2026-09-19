# Phase 3C: deterministic adaptive decisions

Phase 3B Generation Context → trusted Learner State + explicit Prerequisite Evidence
→ Adaptive Decision (WHAT + HOW) → future Game Generation (Phase 3D).

This phase has no database client, network/provider call, content generation, route,
mastery update, telemetry ingestion, GameSpec write or schema change. It consumes
already trusted input and returns an immutable decision. It does not approve content.

## Public workflow and trust

```js
const { normalizeLearnerState } = require('./src/services/adaptiveLearning/learnerStateProvider');
const { normalizePrerequisites } = require('./src/services/adaptiveLearning/prerequisitePolicy');
const { decideAdaptiveLearning, POLICY } = require('./src/services/adaptiveLearning/adaptiveDecision');
const learnerState = normalizeLearnerState(trustedServerEvidence);
const prerequisites = normalizePrerequisites(trustedApprovedRelationships);
const decision = decideAdaptiveLearning({ context, learnerState, prerequisites });
```

`context` must come from the Phase 3B builder. Its approved/imported/scope constraints
and frozen outer object are checked defensively, but shape/freeze is NOT proof of
origin. Never deserialize browser JSON and label it a trusted context. Future server
orchestration must call the actual builder; future GameSpec persistence must still
recheck approval atomically. This engine cannot query current approval state.

Both normalizers are controlled SERVER trust adapters, not public endpoints. Only
an authorized evidence source may supply their input. Type validation, an approvedBy
string or an evidence reference is not authentication or proof that evidence is true.
No legacy database adapter is wired in. Normalized objects are detached, deeply frozen
and registered in module-private WeakSets; raw objects and JSON clones cannot bypass
the normalization step. Re-normalization at a future process boundary requires the
same trusted source validation. Utility exports in learnerStateProvider are internal
validation/freezing helpers, not alternate decision entry points.

## Learner evidence contract

Required: `learnerId`, `artifactVersionId`, `nodeId` (exact nonblank IDs).
The version/node must match the selected context. Optional fields:

- `previousDifficulty`: EASY/MEDIUM/HARD, or null. Only a trusted prior server decision,
  never a browser difficulty label or a dashboard band.
- `mastery`: `{status, sampleSize, confidence}`. Status is UNKNOWN, MASTERED or
  NOT_MASTERED. Known status needs a positive integer sampleSize; confidence, if
  supplied, is a ratio [0,1] and cannot be zero for known status. Unknown metadata
  remains null. No mastery percentage is calculated from other signals.
- `observations`: oldest-to-newest array of distinct, stable observation IDs. Each
  observation may contain `correctness` (boolean), `accuracy` (ratio [0,1]),
  `attempts` (positive integer), `responseTimeSec` (nonnegative finite seconds),
  `hintsUsed`/`mistakes` (nonnegative integers), `skipped`, `completion`, `abandoned`
  (booleans), and `misconceptionCodes` (trusted evidence labels, not generated facts).

A row represents one bounded assessment/learning episode. Use correctness for a
binary outcome OR accuracy for an aggregate outcome. Supplying both is allowed only
when accuracy equals the binary outcome (0 or 1); a final answer and session average
must not be conflated. Completed-and-abandoned or completed-and-skipped rows are
contradictory and rejected. Failed attempts before a final correct answer can still
produce a positive mistake count. Duplicate observation IDs are rejected.

All omitted/null observations remain null, not zero/false/failure. Unknown fields,
XP, arbitrary scores, dashboard mastery, browser difficulty and legacy title-based
Topic/Subtopic substitutions are rejected. The source must provide a consistent
observation order and period: no timestamps, inferred recency, randomness or clock
reads influence a decision. Historical mastery and recent struggle may legitimately
disagree; this is explicitly reported and recent repeated struggle gets remediation.

## Difficulty policy (`POLICY`, adaptive-v1)

- Use the most recent **5** observations; require at least **3** nonempty observations
  beyond response-time-only evidence for a supported transition.
- A strong observation requires accuracy ≥ **0.85** (or correct=true), completion=true,
  attempts ≤ **2**, hintsUsed ≤ **1**, mistakes=0, skipped=false and abandoned=false,
  with no recorded misconception. Missing required signals cannot qualify.
- At least **3** strong observations with NO weak/struggle observations in the window
  allow EASY→MEDIUM or MEDIUM→HARD. HARD stays HARD. Known NOT_MASTERED blocks promotion.
- Repetition means at least **2** observations with a signal: accuracy < **0.60**,
  hintsUsed > **1**, attempts > **2**, mistakes/misconceptions, skips or abandonment.
  Repeated struggle selects REMEDIATION and high support. With sufficient observations,
  difficulty drops only one level: HARD→MEDIUM or MEDIUM→EASY.
- With no trusted prior difficulty, start EASY. An existing trusted difficulty is
  retained when recent evidence is sparse; it is a continuation, not a fresh cold
  start. Thus one mistake at HARD cannot cause HARD→EASY. Sparse evidence increases
  support without inventing mastery.
- A prerequisite gate blocks dependent work and recommends EASY, step-by-step support;
  this exceptional instructional reset is not a claim that the primary skill failed.
- Response time is returned as contextual evidence but NEVER used alone or combined
  as a speed penalty/reward in v1. There are no calibrated task-relative time norms.

Unknown prerequisites are not assumed mastered. Missing relationships also must not
be interpreted as proof that prerequisites do not exist. Hints remain available even
at HARD. HIGH scaffolding/STEP_BY_STEP guidance/HIGH reinforcement are used for EASY,
sparse evidence, remediation and prerequisite gates; otherwise scaffolding is MODERATE
at MEDIUM or LOW at HARD, with ON_DEMAND guidance and STANDARD reinforcement.

Confidence is categorical (`SUPPORTED` or `LIMITED`), describing support for this
policy decision, not a statistical probability or computed mastery. Supplied mastery
confidence is preserved separately. Provider integration must avoid repeatedly treating
old evidence as new progression evidence; observationsUsed identifies the exact window
for future persisted decision/evidence-consumption tracking.

## Explicit prerequisites and academic scope

`normalizePrerequisites` takes `{learnerId, artifactVersionId, nodeId, requirements}`.
Each requirement contains `relationshipId`, `approvedBy`, prerequisite artifactVersionId
and nodeId, `masteryStatus`, and nullable `evidenceReference`. MASTERED/NOT_MASTERED
require an evidence reference. Duplicate targets and self-dependencies are rejected.
The policy must match BOTH the learner and selected context. No hierarchy lookup occurs.

`evaluatePrerequisites(policy, context, learnerId)` returns NOT_SUPPLIED, SATISFIED,
GAP or UNKNOWN, explicit requirements, unresolved requirements and dependentWorkAllowed.
An empty list means NOT_SUPPLIED. Known mastered requirements permit dependent work;
any unknown/unmastered requirement blocks it and selects PREREQUISITE mode.

The academic target/version ALWAYS remains the originally selected context. An unmet
external prerequisite is reported only as an identifier/reference, never fetched,
selected as a new target or supplied with invented content. The decision sets
`requiresSeparatelyGroundedPrerequisiteContext=true`; future orchestration must obtain
an independently approved context before teaching/remediating that prerequisite. It
must NOT generate primary application/classification work while dependentWorkAllowed
is false. No cyclic prerequisite graph is traversed; this phase evaluates one explicit
set of direct requirements. Multi-node graph validation remains future policy work.

Chapter objectives and curriculum text are not copied or changed. Parent relationships
are navigation, not prerequisite evidence. HARD changes reasoning/application and
support within the selected node's approved scope; it never adds higher-grade facts,
new objectives or related concepts. Automatic node combination is disabled.

## Decision contract and reasons

- `decisionVersion`: adaptive-v1.
- `academicDecision`: targetNodeId, mappedNodeId, artifactVersionId; mode PRIMARY,
  REINFORCEMENT, REMEDIATION or PREREQUISITE; dependentWorkAllowed;
  requiresSeparatelyGroundedPrerequisiteContext; prerequisiteStatus; reasonCodes.
- `instructionalDecision`: difficulty, scaffoldingLevel, hintsAllowed, guidanceLevel,
  challengeIntensity, reinforcementLevel.
- `evidence`: learnerId, categorical confidence, normalized observationsUsed,
  observationsMissing (null fields, including unknown mastery/prior difficulty),
  suppliedMastery, signal counts, reasonCodes, responseTimeUsedForDifficulty=false.
- `constraints`: academicScopeLocked=true, difficultyCannotExpandScope=true,
  allowAcademicInference=false, automaticNodeCombinationAllowed=false,
  hierarchyImpliesPrerequisites=false.

Stable reason codes: COLD_START, INSUFFICIENT_EVIDENCE, REPEATED_LOW_ACCURACY,
HIGH_HINT_DEPENDENCE, REPEATED_ATTEMPTS, REPEATED_MISTAKES, REPEATED_SKIPS,
REPEATED_ABANDONMENT, DEMONSTRATED_MASTERY_GAP, SUPPLIED_MASTERY_EVIDENCE,
MASTERY_CONFLICTS_WITH_RECENT_EVIDENCE, PREREQUISITE_GAP, PREREQUISITE_UNKNOWN,
SUSTAINED_STRONG_EVIDENCE, DIFFICULTY_HELD, DIFFICULTY_CHANGED,
NO_PREREQUISITES_SUPPLIED. Signal counts preserve isolated observations even when they
do not meet a transition threshold. Reasons are policy labels, never AI explanations.

## Validation and deferred persistence

`npm run test:adaptive` runs synthetic, injected tests; `npm test` includes all existing
Phase 1/2/3B suites. Actual Phase 3B contexts are built with transactional mocks in
integration unit tests. Decisions themselves use no database or network dependency.

Future Phase 3F needs reviewed durable association of learner evidence with exact
artifact/node/objective versions, event deduplication, evidence provenance, ordered
observation windows and prior policy decisions/consumed evidence. Existing legacy
Topic/Subtopic mastery is not an automatic substitute. No schema change is proposed
or applied here. Phase 3D must honor prerequisite blocking and curriculum scope and
must not turn this decision into new academic content or permanent approval.

Phase 3E adds `requireAdaptiveDecision`, which verifies that a decision was issued
in-process by this engine. It does not normalize or mint decisions, change policy,
authenticate evidence, or serialize trust. The persistence service requires issued
decisions and checks their generation binding; reuse identity excludes learner
identity. See [game-persistence.md](game-persistence.md).

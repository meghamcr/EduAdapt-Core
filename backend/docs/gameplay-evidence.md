# Phase 3F — trusted gameplay evidence and source-recall mastery

## Audit and scope

Audited clean checkpoint: `3e59926`. The implemented generation/persistence chain
remains unchanged in academic capability: source-recall/cloze only, no established
node-objective applicability, no audited Unity contract or rendering runtime.

Existing models cannot faithfully store this chain's evidence:

- `GameSession` targets legacy Game/Lesson and stores browser-style summaries.
- `GamePlaySession` stores slug, summary percentages, attempts and concept JSON;
  it has no artifact/challenge/checksum association or event idempotency constraints.
- `StudentInteraction` targets legacy GameSession/Topic/Subtopic and lacks durable
  variant/challenge/order/deduplication identity.
- `StudentMistake` requires legacy session/topic identities. No name-based mapping
  to recursive CurriculumNode is valid.
- `StudentProgress` targets Lesson; Topic/Subtopic mastery targets those legacy
  models. XPTransaction and leaderboard records are gamification, not learning.

`app.js:1125` computes correctness in the browser. Wrong answers receive score 50,
accuracy .5 and participation rewards; the two direct writes at approximately
1138/1152 use GameSession or game_play_session. Timing is zero or missing, attempts
are hard-coded to one, difficulty comes from browser game fields, completion is
always true, and subject/topic labels become concepts_mastered/misunderstood.
There is no meaningful hint/skip/remediation chronology in that path. It remains
legacy/untrusted, was not modified, and is not ingested by this service.

## Schema proposal — NOT deployed

The minimal foundation uses three new tables:

| Model | Responsibility |
| --- | --- |
| GameplayEvidenceSession | Learner, immutable GameSpec/checksum, artifact/node, policy versions, trusted difficulty/mode, authorization reference, creation token and replayable state |
| GameplayEvidenceEvent | Append-only bounded interaction, server receipt time, session and scope order, dedup token, derived correctness/attempt/outcomes |
| CurriculumNodeMastery | Artifact+mapped-node+learner identity, scope sequence counter and reproducible conservative mastery projection |

Existing model columns, rows and historical migrations are untouched. New reverse
Prisma relations on User/GameSpec/CurriculumNode/ArtifactVersion are navigation
only. No Topic/Subtopic or objective associations are fabricated. Sessions/events
link to protected parent identities through restrictive foreign keys.

SQL: `prisma/proposals/phase3f/migration.sql`. It is intentionally outside the
configured `prisma/migrations` directory: deployment and migration-baseline
reconciliation remain subject to human review. The local Prisma schema now
describes these models, but production does not gain them merely by generating
a client. Never run migrate deploy/db push/reset against Supabase for this work.

Unique constraints enforce learner+creationKey, session+eventKey,
session+sequence, scope+scopeSequence, and learner+artifact+node mastery identity.
Additional SQL CHECK constraints bound states, event types, sequences and response
intervals, and disallow correctness/attempt on non-answer events. These CHECKs are
SQL guarantees beyond Prisma's representation; preserve them in future migrations.

The proposal was applied only to an isolated `/tmp/eduadapt-phase3f-postgres`
PostgreSQL cluster, with TCP disabled and a private Unix socket on port 55439.
`tests/gameplay/disposableMigration.sql` creates minimal synthetic parent-key tables
matching existing ID types, applies the proposal, and verifies inserts, duplicate
token/session order/scope order rejection, FK checks, answer-only correctness and
restrictive deletion. The cluster was stopped afterwards. This proves the additive
SQL against those parent keys, **not full historical migration bootstrap or live
RLS compatibility**. Prisma's schema-diff command returned without SQL in this
environment; the proposal was authored explicitly and verified locally instead.
No live environment variables, production data or migration ledger were used.

## Public domain API and runtime gate

`createGameplayService(db, {now?, authorizeExecution?})` exposes:

```js
openSession({learnerId, gameSpecId, creationKey})
ingestEvent({learnerId, sessionId, event})
loadLearnerState({learnerId, artifactVersionId, nodeId})
```

All identity arguments must come from an authenticated, authorized future server
boundary. They are not evidence that an actor is authorized. No HTTP route,
browser role/flag, auth system or default database connection is provided.

Session creation reloads the persisted GameSpec using Phase 3E's new internal
`loadValidatedGameInTransaction`. That method rebuilds fresh Phase 3B context(s),
uses Phase 2C authority checks, reconstructs the stored instructional contract for
validation, and verifies the complete Phase 3E envelope/checksums. It does not
create a new adaptive learner decision or accept client game JSON. Historical,
unapproved, unmapped, changed or malformed games fail closed. Prerequisite games
retain and recheck both original and taught context identities.

`VALIDATED_PENDING_RUNTIME` is never interpreted as execution permission.
By default `openSession` fails with `RUNTIME_AUTHORIZATION_REQUIRED`. The injected
trusted server policy must verify the learner and exact GameSpec/checksum against
future runtime certification, returning `{reference}` to durable authorization
evidence. No such production certifier exists yet. Tests inject a clearly synthetic
certifier; this is not authentication or a claim that games are currently playable.
The callback must be safe to repeat during transaction retries and avoid provider
or slow external operations inside the transaction. Certification expiry/revocation
must be integrated before production; no automatic expiry is invented here.

Session creation fixes game/checksum/version, artifact, mapped node, difficulty and
adaptive mode. Requests cannot set these independently. Challenge/answer definitions
are reloaded from the same immutable variant for each event/evidence replay; checksum
drift and stale curriculum approval block processing. Challenge phase order must
also be executable in this sequential protocol, or session creation fails.

## Event protocol

Every event has a bounded `eventId` deduplication token and `type`. Only the exact
fields for that type are allowed:

| Input event | Additional fields |
| --- | --- |
| GAME_STARTED, GAME_COMPLETED, GAME_ABANDONED | None |
| PHASE_STARTED, REMEDIATION_STARTED | phaseId |
| CHALLENGE_PRESENTED, HINT_REQUESTED, CHALLENGE_SKIPPED | challengeId |
| ANSWER_SUBMITTED | challengeId, response |

ANSWER_CORRECT, ANSWER_INCORRECT and CHALLENGE_COMPLETED are **derived outcomes**
stored in the accepted event's `derivedTypes` array, never client judgments.
REMEDIATION_STARTED also derives PHASE_STARTED. Thus all twelve Phase 3D event
concepts are represented without trusting caller correctness.

The state machine is CREATED → STARTED → COMPLETED or ABANDONED. GAME_STARTED
must precede phases. Phases advance in declared order; challenges advance in
declared order within their phases. Presentation precedes answering/hints/skips.
An incorrect answer increments attempts and leaves the challenge active. A correct
answer resolves it and derives completion. A skip also resolves it, but its learning
observation explicitly has `skipped=true`, `completion=false`; resolved does not
mean learned. Remediation phases require their specific event type.

GAME_COMPLETED requires all challenges resolved and the COMPLETE phase entered.
It does not require every answer to be correct and does not itself confer mastery.
Abandonment ends a started session, preserving active partial challenge evidence.
Abandonment before a challenge is active remains a raw session event, not a made-up
academic observation. Completed challenges cannot restart; terminal sessions reject
new ordinary events. Exact retransmissions return the prior receipt, including
after termination. Reusing a token for different content is rejected.

Maximum 500 commands per session; events over 2 KB and responses over 120 characters
are rejected. A learner/node replay is bounded to 1,000 sessions and fails rather
than silently truncating history beyond that limit. It currently replays complete
bounded history for integrity; larger deployments need reviewed archival/checkpoint
or incremental replay design.

## Scoring and timing

CLOZE uses exact, case-sensitive string equality with the trusted answer. There is
**no** trimming, case folding, numeric coercion or Unicode normalization. MCQ_CLOZE
requires a zero-based integer option index within the trusted options array; the
domain resolves the option and compares against the stored correct answer. Other
challenge types are rejected. No model grades answers.

Attempts come from state, never a client attempt number. Client correctness,
expectedAnswer, score, accuracy, difficulty, mastery, timestamps, elapsed times and
XP are rejected as unknown fields. Receipts contain event ID, sequence, derived
attempt/correctness and event types, **not answer keys or game/scoring snapshots**.

Time comes from the injected server clock (real Date by default), from accepted
presentation receipt to answer receipt. It includes network/idle delay and is
labelled SERVER_RECEIPT_INTERVAL, not cognitive response speed. Backwards/invalid
clock values fail; intervals over 24 hours remain null. Timing never contributes
to mastery and Phase 3C continues to ignore speed for difficulty. No client timing
or synthetic zero is promoted to trusted learning evidence.

## Raw evidence, replay and mistakes

Events retain bounded submitted responses plus trusted challenge/session/variant
references, attempt, correctness and timestamp. Incorrect submissions are mistake
evidence; expected answers remain referenced through immutable GameSpec/checksum
and challenge rather than duplicated or returned to clients. No conceptual label
or LLM diagnosis is fabricated, and StudentMistake is not misused.

Session state and node mastery are projections, not raw truth. Replay validates
payload hashes, sequences, scope, phase/challenge references, derived correctness,
attempts/outcomes, session state and checksum. Global scope order must be contiguous
and match its counter. Corrupt evidence or mastery projections fail closed rather
than silently being repaired during ingestion.

Each resolved or actively abandoned challenge becomes one observation summarizing
all its attempts/hints/mistakes, final correctness, completion/skip/abandonment and
receipt interval. Active unresolved challenges remain raw events until resolution,
avoiding counting each network submission as a separate learning observation.
Provenance retains learner via scope/session, game/checksum, artifact/node, challenge,
difficulty, remediation context, task fingerprint and durable scope sequence.
Raw events remain available for future policy changes. Objective references stay
empty; no objective evidence is fabricated.

## Conservative mastery and Phase 3C

Policy `source-recall-mastery-v1` recomputes from the latest five resolved observations:

- Strong: correct, completed, first attempt, no hints/mistakes/skips/abandonment,
  and not remediation.
- MASTERED: at least three strong observations, across at least two sessions and
  two distinct source-span tasks, with no struggle/skip/abandonment/hint/remediation
  in the window. Renaming a duplicate challenge does not create task diversity.
- NOT_MASTERED: at least two observations with actual incorrect submission evidence
  (two mistakes, or final incorrect with an attempt).
- Otherwise UNKNOWN. Hints, skips, completion and speed alone do not imply failure
  or success. Sparse/mixed evidence can return uncertainty rather than a numeric
  mastery percentage.

These statuses mean **observed source-recall mastery within this artifact/node's
supported tasks**, not complete chapter/objective coverage or higher-order reasoning.
The policy is a conservative foundation, not an empirically validated learning
assessment. Node/variant coverage calibration remains future work.

`loadLearnerState` accepts the mapped node ID, rebuilds approved Phase 3B context
even on cold start, and resolves its source node ID for Phase 3C. It checks durable history/projection and calls the existing
`normalizeLearnerState`, returning its issued immutable shape. Observations follow
scope sequence; the latest completed-observation difficulty supplies prior difficulty.
Missing evidence yields cold-start null/UNKNOWN, not fabricated mastery. The caller
can pass the result directly to `decideAdaptiveLearning` with an actual Phase 3B
context and explicit prerequisite policy. Phase 3F does not reimplement adaptation.
The normalized observation ID resolves back to session/challenge provenance.

## Atomicity, trust and remaining work

All session/event/mastery writes share Serializable transactions and existing-row
learner/scope locks. Learner locks precede scope/artifact work to serialize a learner's
evidence updates. Unique keys enforce deduplication even across concurrent callers.
P2034/P2002 conflicts retry the whole transaction at most three times. A failure
rolls back event, session projection and mastery together. No provider runs inside
these retries. APIs emit fixed error codes, never raw DB errors or submitted answers.

Tests use synthetic fixtures/in-memory transactional adapters; the SQL proposal also
has separate disposable PostgreSQL constraint verification. In-memory concurrency
tests do not prove production MVCC/RLS behavior. No Supabase, Grade 4 import, Grade 6
mutation, frontend change, curriculum change, XP, leaderboard or legacy mastery write
was performed. Proposed foreign keys reference existing data, but no backfill occurs.

Production prerequisites remain authenticated actor/learner authorization, trusted
runtime certification and lifecycle/revocation policy, scoped database permissions,
rate limits, bounded answer retention and protection of sensitive free text. Service
identity arguments and private in-process issuance are not authentication. Direct
browser writes remain outside this trust boundary. Raw responses are restricted
evidence, not logs. Future Phase 3G must expose a sanitized runtime view, retain
answer keys server-side, audit Unity/rendering contracts, and implement validated
transport/session ownership before real play. No renderer or runtime translation
is implemented here. Future gamification may consume trusted completion separately;
XP and leaderboard progress never feed academic mastery.

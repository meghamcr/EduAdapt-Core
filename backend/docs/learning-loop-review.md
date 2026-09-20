# Phase 3G / Phase 4 implementation and security review

## Implemented backend loop

`createLearningLoop(db, options)` connects approved/mapped curriculum context,
server-loaded learner state, adaptive decision, identity-aware reuse or bounded
provider generation/repair, trusted persistence, execution authorization and safe
runtime projection. Its event and restore operations connect runtime interaction
to deterministic scoring, durable evidence/mastery and subsequent adaptation.
It has no default Prisma client, environment loading, network access, authentication
or execution policy. Tests inject a transactional in-memory adapter and fake provider.

Server options:

- `provider.generateStructuredGame(request)`: injected Phase 3D provider.
- `authorizeLearning({learnerId,curriculumArtifactVersionId,curriculumNodeId})`:
  must return exactly true; authenticated actor/tenant/course authorization is the
  adapter's responsibility. Checked before curriculum reads/provider work.
- `authorizeExecution`: exact-GameSpec policy documented in `unity-runtime.md`.
- `loadPrerequisites({learnerId,artifactVersionId,nodeId})`: required server policy;
  source-node identity, normalized explicit requirements, never a client array.
  Returning [] means NOT_SUPPLIED, not proof that no prerequisites exist.
- Optional `now` and `maxRepairs` (default 1; existing bounded maximum 2).

`start({learnerId,curriculumArtifactVersionId,curriculumNodeId,creationKey,runtimeVersion})`
returns `{ok:true,runtime}` or `{ok:false,error:{code,stage}}`.
`submitEvent` / `restore` return `{ok:true,result}` or the same safe error shape.
Completion/abandonment use ordinary validated terminal events. The API accepts no
client adaptive decision, expected answer, mastery projection or difficulty override.

Every new launch loads trusted evidence. Its scope sequence is captured in the
same transaction as replay, then checked under the learner/scope locks when opening
the session. If events arrive while a provider runs, launch fails instead of
silently using stale evidence. A validated game may remain reusable in storage;
no gameplay evidence/mastery is written on a rejected launch. No provider request
is made inside a DB transaction. Existing Serializable retry limits remain three
for storage conflicts; provider exceptions are not automatically retried.

Prerequisite policy is explicit and fail-closed: unresolved prerequisites return
PREREQUISITE_TARGET_REQUIRED before provider work. There is no automatic learning-
path selection. The policy owner must choose a separately approved prerequisite
node and launch it through this same boundary. Existing Phase 3D/E explicit
prerequisite game APIs remain supported; no hierarchy inference was introduced.

Source recall is the only supported academic mechanic. Difficulty changes support
and presentation, not verified higher reasoning. MASTERED remains the restricted
`source-recall-mastery-v1` window, not proof of chapter/objective mastery. This is
not proctoring: clients can revisit teaching and repeat practice. Response time is
server receipt latency, never cognitive speed. XP/rewards do not feed mastery.

## Phase 3F audit and fixes

- Existing event replay, deterministic scoring, owner/scope checks, append-only
  event keys, state/mastery verification and transactional rollback retained.
- Found authorization only at initial open. Execution policy is now rechecked on
  all gameplay events (including legacy domain entry), duplicates and restores.
- Existing idempotent open trusted stored status without replay. It now verifies
  session/game linkage and replays durable events before returning existing state.
- Top-level input validation formerly allowed accessors/symbol/non-enumerable
  properties. It now rejects them without invoking getters.
- Added safe runtime projection inside the same trusted transaction as session
  creation/retrieval; projection failure rolls back new session/scope creation.
- Added atomic evidence revision guard for newly orchestrated launches. Existing
  domain-level manual launch stays available to trusted server policy owners.

## Security boundary review

Only injected trusted server adapters may invoke domain services. There are no new
public routes. Client learner IDs must never be treated as authentication. The
future adapter needs verified sessions/tokens, tenant/role authorization, body
limits, rate limits, appropriate CORS/CSRF handling and runtime certification.
These are deployment gates, not capabilities claimed by this implementation.

Stored GameSpecs are reloaded and validated against current approved imported
artifacts, checksums, curriculum mapping and policy envelopes on every execution.
Game reuse matches generation/policy identities and rechecks current authority;
legacy/invalid/ungrounded games cannot launch. Event payloads are bounded and
allowlisted; supplied academic/scoring fields reject. Session ownership, challenge
and phase ordering, event-key fingerprints and replay protect trusted evidence.
The projector never spreads stored packages into responses. Plain-text rendering
and catalog assets avoid interpreting source/generated data as executable content.

`learningLoop` catches all provider, policy and DB exceptions and exposes only
closed error codes/stages. No raw prompt, candidate, DB URL, validation evidence,
answer or stack is returned or logged. Lower-level domain exceptions must not be
serialized by future routes. Unknown/stale versions fail closed. No new logging
infrastructure, live provider call, live database operation or curriculum edit was
used for this implementation.

Replay currently scans all sessions in a scope (limit 1,000; 500 events/session).
A historical corrupt/invalidated game blocks dependent evidence replay safely.
Archival, cursor-based evidence processing, certification revocation lifecycle,
request throttling and cross-node recommendation are future work. Tests validate
transaction logic using a serialized fake adapter; they do not prove production
PostgreSQL contention, deployed grants/RLS or browser authentication.

## Platform and gamification audit

| Area | Status | Current boundary / gap |
|---|---|---|
| Approved artifact/context, adaptive policy, generation/repair, persistence | IMPLEMENTED | Server services with deterministic tests; deployment not asserted |
| Trusted runtime/evidence/subsequent adaptation | IMPLEMENTED | Service-level loop, fake-provider end-to-end tests |
| Authenticated HTTP learning/gameplay API | NOT YET CONNECTED | No route/controller/bootstrap for this loop; required policy injection fails closed |
| Teacher portal | PARTIALLY IMPLEMENTED | Root app.js/login.html/index.html use Supabase Auth/profile queries and local demo state; no trusted loop calls |
| Student experience | PARTIALLY IMPLEMENTED | Teacher portal selects students for legacy quiz attempts; no authenticated student Unity launch flow |
| Admin experience | NOT YET CONNECTED | Schema role exists; no trusted admin runtime/review dashboard connection |
| Unity 6 Web | NOT YET CONNECTED | Assets contain template scenes/settings/resources, no C# runtime loader/DTO implementation |
| XP, levels, badges, leaderboard | PARTIALLY IMPLEMENTED | Prisma models and portal XP display exist; no trusted backend reward service/ledger integration |
| Learning-path recommendation | NOT YET CONNECTED | Same selected-node adaptation exists; automatic cross-node policy not implemented |

Concrete frontend migration needs (reported, not edited): `app.js` reads legacy
`game_spec` including quiz correct associations, computes correctness/rewards in
`submitAnswer`, and directly inserts legacy GameSession/game_play_session values.
It also permits local demo identity and does not establish backend role/tenant
permissions. Those paths are not trusted Phase 3F evidence and are not consumed by
this loop. Replace them with authenticated safe-projection/event endpoints before
calling the portal secure or connected. Browser-side role labels or localStorage
are not authorization. Production exposure of legacy tables depends on grants/RLS
and requires a separate reviewed access-policy change; no live policies were read
or changed here. No evidence from these legacy writes is silently adopted.

There is no safe existing gamification service to wire in. Decorative runtime
rewards are display-only, not XP transactions. Future reward issuance must derive
from accepted server events with durable idempotency and its own policy; it must
not become mastery evidence. No motivational system was fabricated.

## Phase 3F migration review (read-only)

Active path: `prisma/migrations/20260919000200_gameplay_evidence/migration.sql`.
Proposal: `prisma/proposals/phase3f/migration.sql`. They are byte-for-byte identical.
The active file's inherited header incorrectly says it is outside migrations;
its actual location makes it eligible for a future migrate deploy. This task did
not change either SQL file, Prisma schema, migration history or deployment state.
Do NOT deploy just because local validation/tests pass.

The SQL matches the three Prisma models, TEXT actor/artifact/node IDs, UUID
GameSpec FK, JSONB fields, timestamp precision, defaults/nullability, five unique
indexes and session scope/createdAt index. Ten FKs use RESTRICT on delete/update.
Mastery → session → event creation order satisfies the new internal dependencies;
User, game_spec, CurriculumNode and CurriculumArtifactVersion must already exist.
The immediately preceding 20260919000100 migration creates artifact storage.
CHECKs further constrain status/mode/difficulty, evidence sequence bounds, sample
size, nonnegative counters/timing, JSON types and answer-only correctness/attempts.
Those SQL-only CHECKs are not fully expressed by Prisma validation. Separate FKs do
not themselves enforce every cross-table scope equality; services verify these via
replay/identity checks. Direct client writes must be forbidden by deployment policy.
Deletion requires child-before-parent removal; RESTRICT prevents curriculum/User/
GameSpec cascading through retained trusted evidence. No deletion service was added.

Historical migrations still do not build a clean base schema. The existing
Phase 2B.1 baseline/ledger discrepancy remains unresolved in the repository's
recorded strategy. No fresh-bootstrap or live-schema compatibility claim is made.
Existing historical hashes are checked by Prisma foundation tests. No schema change
or new migration is required for Phase 3G/4. SQL was NOT applied here.

## Review/staging scope

New: src/services/gameplay/runtimeProjection.js; src/services/gameplay/learningLoop.js;
tests/runtime/runtime.test.js; tests/runtime/fixtures/runtimeFixture.js;
tests/learningLoop/learningLoop.test.js; docs/unity-runtime.md;
docs/runtime-example.json; docs/learning-loop-review.md (all relative to backend/).
Modified: src/services/gameplay/gameplayEvents.js; src/services/gameplay/gameplaySession.js;
tests/gameplay/schema.test.js; package.json; docs/gameplay-evidence.md.

Keep the pre-existing root .gitignore and untracked EduAdapt-GameRuntime project
out of this backend change's staging list. No stage, commit, push or deployment was
performed. A read-only status/log was taken at startup before the attachment's
Git restriction was inspected; subsequent Git use is limited to permitted diff
whitespace verification.

## Final local verification — 2026-09-20

| Check | Passed | Failed |
|---|---:|---:|
| Phase 3F gameplay | 60 | 0 |
| Phase 3G runtime | 36 | 0 |
| Phase 4 full-loop integration | 21 | 0 |
| Adaptive engine | 57 | 0 |
| Game generation | 81 | 0 |
| Game persistence | 67 | 0 |
| Generation context / grounding | 37 | 0 |
| Combined focused run, including artifact services | 415 | 0 |
| Prisma foundation | 8 | 0 |
| Complete backend `npm test` (includes Phase 1/1B's 86 tests) | 509 | 0 |

All eight created/modified JavaScript files passed `node --check`. The installed
Prisma CLI passed `validate --schema backend/prisma/schema.prisma` from repository
root. No schema/client generation or migration application was needed. Permitted
`git diff --check` passed. No tests were skipped in the final complete run.

The first full run had 508 passes and one existing Prisma smoke-test timeout.
Dependency tracing found macOS `compressed,dataless` cloud placeholders and an
ECANCELED filesystem read in ignored node_modules. Exact cached packages were
restored offline: @prisma/client 7.10.0, xtend 4.0.2, remeda 2.33.4,
pg-cloudflare 1.4.0, pgpass 1.0.5, split2 4.2.0 and pg-int8 1.0.1. No source,
package version or lockfile was changed to mask the failure. The foundation and
complete suites then passed. Keep development dependencies locally available;
future cloud offloading can reproduce the environmental failure.

READY FOR BACKEND IMPLEMENTATION REVIEW. Not a claim of a deployed, authenticated,
Unity-rendered complete platform; the connection/deployment gates above remain.

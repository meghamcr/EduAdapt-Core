# Phase 3E: trusted game persistence and reuse

## Audit and schema decision

Audited checkpoint: `0975de7` (`Add grounded AI game generation and validation
pipeline`), with a clean working tree before this phase. Current implementation,
not older handoff descriptions, determined this design.

- Phase 2C already provides `gameGroundingInTransaction`: full artifact integrity,
  APPROVED review, successful import, exact mapping, book/chapter identity and
  materialized-node checks. It locks the artifact version used by review/import.
- Phase 3B already builds the authoritative immutable context using that helper.
- Phase 3C produces immutable academic/instructional decisions.
- Phase 3D validates bounded source-recall games but previously had no durable
  writer, reuse policy, or issuance marker for validated results.
- `GameSpec` has a unique `slug`, JSON `spec`, scalar `version`, free-string status
  and renderingMode, nullable curriculum IDs and an artifact-version FK. It has
  **no separate version table or native provenance/checksum columns**.
- No backend routes/authentication boundary, reuse engine or other backend
  `GameSpec.create/update/upsert` writer existed. Browser `app.js` directly reads
  `game_spec` at line 500 and inserts manually composed quiz records at line 1050.

The existing schema is sufficient for **this service's append-only variants and
idempotency**. No schema changes or migration proposal are needed. A full SHA-256
request/contract identity and specification checksum determine the unique slug.
Each variant is a separate row. Its JSON column holds a versioned envelope with
the **exact, unmodified Phase 3D GameSpecification at `spec.game`**, plus provenance.
This envelope is a storage format, not a change to the strict generation schema.
No unsupported Prisma fields are introduced. SQL was neither created nor applied.

This does not establish database-wide immutability or authorization. Existing
direct writers can bypass an application service; permissions/authentication
must be resolved before deployment. JSON provenance is not a cryptographic
signature proving which actor wrote a row. The reuse validator proves content
and current compatibility, not an authenticated historical generating actor.

## Public server-side API

```js
const { createGamePersistenceService } = require('./src/services/gameGeneration/gamePersistence');
const games = createGamePersistenceService(trustedServerPrisma);

// All handles below are actual in-process outputs, not browser JSON.
const input = { context, decision }; // Optional prerequisite: {context, decision}
const existing = await games.findReusableGame(input);
if (!existing) {
  const result = await generator.generate(input); // Outside any DB transaction.
  if (result.ok) {
    const stored = await games.persistValidatedGame({ ...input, result });
  }
}
```

Methods return detached, frozen `{gameSpecId, slug, status, reused, storedPackage}`.
Reuse returns `null` on no compatible candidate. Stale/unapproved curriculum
throws a controlled error; it must not be interpreted as permission to generate
against that stale context. Rebuild trusted inputs instead. No automatic provider
call, repair, actor inference, environment loading, Prisma construction or network
connection exists in this module. Callers inject the server's trusted DB adapter.

## Issued inputs and validated packages

Phase 3B contexts and Phase 3C decisions are now registered in private WeakSets;
their existing contents and decision behavior are unchanged. Guards exported by
their modules only verify issuance; they cannot register arbitrary objects.
The successful Phase 3D result is registered in a private WeakMap, binding full
input fingerprints (including any prerequisite context/decision), request hash
and specification hash **before asynchronous provider work**. There is no public
issuer or `validated: true` shortcut. JSON clones and raw candidates are rejected.

Persistence requires actual issued context, decision and successful result. It:

1. Rejects additional input fields, including caller role/teacher ID, academic
   text, browser difficulty, learner records and scores.
2. Reconstructs the bounded request using Phase 3D and checks the issued result's
   exact input/request binding. A swapped decision is rejected even when it
   coincidentally has the same instructional policy.
3. Checks successful validation, contract, specification/request checksums,
   academic grounding and telemetry binding.
4. Runs the full deterministic Phase 3D validator again. Persistence never repairs.

These registrations defend the domain API against accidental/client-JSON bypass;
they are **not authentication** or a sandbox against malicious server code. Server
dependencies and the Phase 3C evidence normalizers remain trusted. Issuance does
not survive serialization/process restarts. There is intentionally no arbitrary
result rehydration API. Already persisted games can be reused after full checks
using freshly issued context/decision handles.

## Write-time authority and race handling

The write runs in a Serializable transaction. `generationContext.buildInTransaction`
shares the existing Phase 3B projection and Phase 2C checks with normal `build`;
there is no second weaker implementation. Before any GameSpec lookup/create it:

- locks the artifact using the same parameterized SELECT FOR UPDATE as review;
- verifies immutable snapshot/projection/identity checksums and fingerprints;
- requires current APPROVED status and a successful import;
- verifies import mapping, exact selected mapped node and full materialization;
- rebuilds the context and compares **all fields** to the original issued context.

For prerequisite games, both dependent and prerequisite contexts are rechecked
in deterministic artifact/node lock order. The persisted curriculum IDs refer to
the actually taught prerequisite; original target/relationship provenance remains
in academicGrounding. No prerequisite is inferred or fetched automatically.

Review/import operations that use the shared lock cannot race past this check.
External SQL writers that ignore service contracts are not made safe by this
module. Deployment must restrict such writes and preserve artifact immutability.
Rechecks are transactional snapshots, not permanent approval of later gameplay.

## Stored identity, versioning and status

Slug format:

```text
p3e_<hash(storage version + adaptive version + request fingerprint)>_<spec hash>
```

The request fingerprint binds artifact/node, academic scope/mode, full instructional
policy, source provenance and generation/schema/template contracts. Learner IDs,
observation records and full adaptive evidence are **not stored or included in
reusable identity**. Full decision hashes are used only in the in-memory issuance
check. Changing a learner while preserving the compatible request permits reuse.

The storage envelope retains:

- storage, generation and adaptive contract versions;
- request and specification fingerprints;
- selected and optional dependent context fingerprints;
- full bounded academic grounding and source provenance;
- exact validated game and telemetry context/checksum;
- explicit source-recall, objective-applicability and runtime limitations.

Top-level row metadata is derived from trusted context/game, never caller fields:
title, subject, topic (selected node title), grade, non-null artifact and mapped-node
IDs, difficulty and initial version. `version` equals the game's `specVersion`
(currently 1). It is **not a mutable sequence counter**. Different generated
variants get different slugs/rows, rather than overwriting version 1 in place.
There is no update, destructive upsert, deletion, publication or migration path.

New rows explicitly use `status = VALIDATED_PENDING_RUNTIME` and
`renderingMode = ENGINE_NEUTRAL`. Both existing schema fields are free strings.
This means validated against the generation contract, **not runtime-certified,
published, assigned to students or ready for Unity**. No status promotion API is
provided. The old browser ignores this distinction, so this is a domain status,
not sufficient access control by itself.

## Reuse and idempotency

Reuse first rechecks current curriculum authority in the same Serializable
transaction. Candidate selection filters exact artifact, mapped node, difficulty,
status and the deterministic request/contract slug prefix. Up to 100 candidates
are inspected in lexical slug order. For each candidate the service revalidates:

- the complete stored Phase 3D game against the current bounded request;
- exact envelope fields and specification/request/context checksums;
- full instructional policy and academic mode, not difficulty alone;
- artifact/node metadata, row metadata, version, status and rendering mode.

The first valid variant wins deterministically. Malformed, incompatible and legacy
rows are skipped without repair or mutation. If the first 100 contain no compatible
game, return a conservative miss; no unbounded scan or title-based fallback occurs.
Reuse means reuse for future trusted integration, not permission to launch.

Persistence uses `findUnique(slug)` followed by `create`, backed by the **existing
database unique constraint**, not application checks alone. A matching row is
fully verified and returned unchanged. A corrupt or occupied incompatible slug
fails with `IMMUTABLE_GAME_CONFLICT`; no overwriting fallback exists. Created rows
are verified before commit. A transaction failure rolls back the create.

Serializable conflicts (`P2034`) and unique conflicts (`P2002`) retry the **whole
transaction**, including authority checks, at most three times. A concurrent
exact create then converges on the committed row. Persistent conflicts return
`PERSISTENCE_CONFLICT_RETRY_EXHAUSTED`. Other DB errors return fixed safe codes;
no raw DB message, query, credential, stack or request body is propagated.
There is no provider call or learner evidence consumption during these retries.

## Historical compatibility and direct-client risk

Old rows may retain null curriculum IDs, READY status and browser quiz JSON.
They are not rewritten, adopted as grounded variants, or selected for trusted
reuse. New writes never use Phase 2C's historical-null exemption.

The only direct `game_spec` insert found is `app.js:1050`: `saveQuiz`
builds the payload at lines 1035–1049 from browser fields/teacher state, with
`spec.question/options/correct/teacherId` and READY status. This remains
**legacy/untrusted for generated games**. Its offline fallback stores local quiz
records; it is not a server persistence boundary.

The direct read at `app.js:500` feeds `state.quizzes` through lines 526–534, expects
those legacy question/options/correct fields, and does not filter by runtime
status. The Phase 3E envelope is intentionally not a legacy browser quiz. Do not
deploy its rows into a student-facing flow until an authorized read boundary and
status/runtime handling are implemented. No frontend or RLS/grants were changed.

## Authentication prerequisite

No trustworthy server authentication/authorization implementation was found in
the audited backend. This service is not an endpoint and exposes no fake actor
approval flag. Future server integration must authenticate a teacher/admin/system
actor using verified server credentials, authorize school/tenant and curriculum
scope, obtain normalized learner/prerequisite evidence from trusted sources, then
invoke Phase 3B/3C and these APIs. Never forward localStorage roles, arbitrary
teacher IDs, browser scores/difficulty or client-supplied academic text.

Database permissions must prevent direct clients from creating/updating trusted
generated rows or changing their provenance. The current schema has no dedicated
tenant/actor/provenance-signature columns; deployment authorization/audit attribution
may require a separately reviewed design. That is not a blocker to this injected
domain service, but **end-to-end security is not complete**. No live RLS policy,
grant or database state was accessed to make this claim.

## Tests, Phase 3F and runtime boundary

Run from `backend/`:

```sh
npm run test:game-persistence
npm test
```

Tests use existing synthetic approved/imported curriculum fixtures and a
Prisma-shaped transactional in-memory adapter, extended with the actual GameSpec
slug uniqueness and query behavior. They cover trust/input swaps, checksum and
authority drift, reuse exclusions, historical rows, prerequisite targeting,
rollback, concurrent requests and bounded serialization/unique-conflict retries.
No network or live DB is used. Fake transactions serialize; these tests verify
service behavior and retry paths, **not PostgreSQL MVCC or RLS deployment**.

Phase 3F can use stable GameSpec IDs, immutable specification checksums, exact
artifact/node identity and declared challenge/event IDs as inputs to a separately
authenticated session/scoring/evidence boundary. It must recheck launch authority,
validate events server-side, deduplicate them and distinguish trusted scoring
from client claims before any learner/XP updates. This phase performs none of
those writes and does not invent objective applicability or mastery evidence.

Before a first complete real playable adaptive game: implement authenticated
orchestration/read access and direct-write restrictions, certify a runtime adapter
against actual Unity/frontend contracts, resolve assets/scoring/phase execution,
perform controlled provider and playthrough acceptance, then implement validated
telemetry and learner updates. Source-recall-only generation, unestablished
node-objective applicability and unvalidated higher-order reasoning remain explicit
limits. Persistence does not remove them or certify educational effectiveness.

Phase 3F adds an internal `loadValidatedGameInTransaction(tx, gameSpecId)` read path
for durable sessions. It reloads a stored variant, reconstructs the persisted
instructional contract solely for validation, rebuilds fresh Phase 3B context(s),
and verifies the exact Phase 3E envelope. It neither accepts browser game JSON nor
mints a new Phase 3C decision. This trusted scoring read contains answer keys and
must not be returned as a public runtime payload. See
[gameplay-evidence.md](gameplay-evidence.md) for the separate execution gate.

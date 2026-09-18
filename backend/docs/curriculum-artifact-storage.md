# Phase 2B.2: proposed curriculum artifact persistence

Status: repository design/implementation only. No SQL has been applied. No importer,
provider, production database, curriculum file or historical curriculum ID is changed.

## Storage choice

Use four additive tables: scoped chapter identity, immutable artifact version,
append-only review history, and successful import history. A complete JSONB snapshot
preserves the variable-depth hierarchy and all Phase 1 fields, including future
unknown fields. Indexed scalar metadata supports identity, deduplication, review and
provenance queries without dozens of small pedagogical tables. JSONB projections
support source/objective/content queries; add specialized indexes only when actual
query workloads justify them.

This is semantic JSON preservation, not original file byte preservation: formatting,
object-key order and duplicate JSON keys cannot be recovered. The canonical SHA-256
checksum covers every parsed artifact field, including ingestion metadata. Original
PDFs are references only, never duplicated as database binary data. Source paths may
identify a local file rather than a durable asset; asset hosting is future work.

## Identity and editions

`CurriculumArtifactIdentity` scopes board, grade (string), subject, configured book
ID, edition string and configured chapter ID. Its ID is a version-prefixed SHA-256
of that exact tuple. Titles and chapter numbers are snapshot metadata, never global
keys. No case folding or title-based merging occurs. An absent/null edition maps to
an empty edition key meaning **unspecified**, not a guessed edition. Future users
must supply a stable edition identifier when two editions need to be distinguished.

Two editions with identical titles and even the same configured book/chapter IDs
have distinct scopes. This avoids altering `CurriculumBook`'s existing uniqueness
constraint, which excludes edition. The original book/chapter/node tables remain the
legacy materialized curriculum representation. Version storage can hold multiple
editions now; materializing multiple editions simultaneously in those legacy tables
is NOT solved here. A future approved importer/schema decision must handle their
legacy uniqueness constraint without changing existing IDs. Never bind an edition
to a legacy chapter by title alone.

## Exact Phase 1 mapping

| Phase 1 field | Persistence |
| --- | --- |
| board, grade, subject, book_id, edition, chapter_id | Scoped identity; also unchanged in snapshot |
| book, chapter, chapter_number | Snapshot display/order metadata |
| nodes and arbitrary parent_id hierarchy | Complete snapshot; original IDs retained |
| node content | Snapshot; v2 explicit-only `authoritativeNodes` projection |
| materials, roles, evidence_kind, student_completion, source_refs, visual | Snapshot unchanged |
| source_synthesis, review_inferences | Separate original arrays in snapshot; excluded from authoritative projection |
| learning_objectives + objective_evidence | Snapshot plus aligned `{text, evidence}` objectives JSON; absent historical evidence is null |
| source_context, documents, authorityVersion | Snapshot; sourceProvenance.registry; nullable scalar authorityVersion |
| _ingestion.sources | sourceProvenance.sources and snapshot: paths, checksums, selected pages, extraction stats/counts where supplied |
| _ingestion.model / generatedAt | Nullable model/generatedAt columns; snapshot originals retained |
| generating actor | Optional generatedBy supplied by trusted future caller; unknown remains null |
| source/content/configuration/implementation fingerprints | Indexed or queryable scalar columns; supplied content hash verified |
| _ingestion.reviewStatus | Immutable original claim in snapshot; independent database lifecycle starts UNREVIEWED |
| warnings, validationStats, artifactVersion, identityStrategy, all other metadata | Snapshot unchanged |
| trusted reviews/imports | Separate history rows; never inferred from generation metadata |

`artifactStorage.js` is a pure mapper and review-transition planner. It never imports
Prisma, opens a file, loads environment configuration, connects to a DB, or invokes
the existing importer. It validates with the unchanged Phase 1 validator, verifies
available metadata identity/content fingerprints and returns detached data. For
Prisma writes in a future service, nullable JSON projection `null` must be encoded
as `Prisma.DbNull` (SQL NULL), not `Prisma.JsonNull`. That adapter is not implemented.

## Versions and immutability

An exact canonical artifact repeats the same checksum/ID. Regeneration with changed
metadata gets another version even when content stays the same. `contentFingerprint`
uses the existing Phase 1 definition (all fields except `_ingestion`), not a semantic
similarity score. `sourceFingerprint` identifies supplied source inputs; it is not a
proof that two versions teach equivalent content. Unknown source hashes are never
considered equal evidence of the same source.

Unique artifactChecksum enforces snapshot idempotency; `(identityId, id)` supports a
composite foreign key preventing `currentVersionId` from selecting another scope.
Current means explicitly selected version, NOT automatically latest or approved.
It may be UNREVIEWED. Approved versions are queried by reviewStatus and review events;
approval history survives supersession. Multiple historical approvals are representable.

SQL guards prevent payload modification/deletion and identity-key modification;
only version reviewStatus/reviewRevision and identity currentVersionId can change.
Review and successful import records are append-only. All new foreign keys restrict
deletion. No existing data is backfilled or constrained to have provenance.

## Authority and evidence

The four categories remain exactly as Phase 1 defines them:
EXPLICIT_SOURCE_CONTENT, SOURCE_GROUNDED_SYNTHESIS, MODEL_VISUAL_INTERPRETATION,
MODEL_INFERENCE. Evidence kinds, references, visual flags and pedagogical roles remain
in their separate arrays. Navigation titles/descriptions are not newly asserted facts.
Only `renderMaterials(materials)` supplies the v2 authoritativeNodes content projection.
Visual descriptions, synthesis and inferences never enter that projection. Legacy
artifacts without authority v2 have a null projection, not a fabricated classification.

The SQL shape guards do not fully validate the rich JSON contract or establish truth
against a PDF. Future writers MUST call the validator/mapper and compare immutable
payload/checksum on conflicts. Human source review is still required. Approval never
promotes inference into explicit source content; corrections create a new version.
Existing `CurriculumNode.content` is untouched; the future importer must enforce this
projection when creating new materializations.

## Review lifecycle and concurrency contract

States: UNREVIEWED, IN_REVIEW, APPROVED, REJECTED, SUPERSEDED.

- UNREVIEWED → IN_REVIEW, REJECTED or SUPERSEDED.
- IN_REVIEW → APPROVED, REJECTED or SUPERSEDED.
- APPROVED → SUPERSEDED.
- REJECTED → IN_REVIEW or SUPERSEDED.
- SUPERSEDED is terminal; restoration requires a deliberate future workflow.

The pure transition planner returns expected revision/state, updated revision/state
and the audit event. Approval requires a supplied reviewer reference and authority-v2
projection. Reviewer references are optional elsewhere and are opaque trusted actor
references, not forced foreign keys to existing users. Historical records need no
invented reviewer. Timestamps and optional reasons live on review events.

A future repository service MUST update version state with a compare-and-swap on
`id + reviewStatus + reviewRevision` and insert the unique `(versionId, revision)`
event in the SAME transaction, requiring exactly one matched version. Lock the identity
before changing current version or superseding an approved version. SQL enums,
uniqueness, immutability and foreign keys do not independently enforce the transition
graph or an atomic event/state pair. No review write service is introduced in this phase.

## Import and GameSpec contract (future work)

`CurriculumArtifactImport` records a successful materialization, its target existing
chapter, importer fingerprint, time, optional actor and exact artifact→database node
ID mapping. `(versionId, chapterId)` is unique. Presence means already imported;
absence is not an instruction to import. Insert this row only in the transaction that
materializes and verifies approved curriculum. It is success history, not a failure log.
Before reuse, verify target identity, mapping and persisted state; a newer import can
have changed the legacy projection. The latest successful target import is operational
history, not a reason to delete older artifact versions. Serialization per target
chapter, active materialization selection, reactivation semantics and approval gating
belong to the explicitly deferred importer redesign.

`GameSpec.curriculumArtifactVersionId` is a nullable FK. Old game specs remain valid
with null and keep their existing curriculum_node_id unchanged. Future game creation
must atomically check APPROVED state and ensure the selected node ID belongs to that
snapshot (and use import nodeMapping if referencing a legacy materialization). This FK
alone does NOT impose approval or node membership. Once a version is superseded, the
historical game link should remain to explain its original grounding. No gameplay,
mastery, adaptive-learning, frontend or Unity behavior changes here.

## Migration location and baseline preservation

`prisma/proposed-migrations/phase2b2-curriculum-artifacts.sql` is a NEW FUTURE additive
forward migration candidate, intentionally outside `prisma/migrations/`, the path in
prisma7.config.ts. It cannot be automatically picked up by the configured deploy flow.
It is NOT an empty-database baseline and cannot repair the known ledger discrepancy.
It creates four tables, one enum, indexes/FKs, new-table guards and CHECKs, and adds
one nullable game_spec column/index/FK. UUID defaults on review/import IDs are generated
by Prisma, matching schema `uuid()` (not PostgreSQL defaults).

The historical checkpoint schema is copied byte-for-byte to
`prisma/baselines/phase2b1.schema.prisma`; baseline-reference.json now points to that
frozen file with its ORIGINAL hash. This lets the working schema evolve without
rewriting the historical reference. Both historical migration SQL files are unchanged.
The snapshot is evidence only, not an independently maintained schema or executable SQL.

Before any later deployment: reconcile the baseline/ledger under separate approval,
review new-table access policy (no grants/RLS changed here), test baseline bootstrap
and this delta on isolated PostgreSQL, compare schema/catalog including the SQL-only
CHECKs/functions/triggers, review lock behavior, then approve deployment explicitly.
Adding a nullable column does not backfill rows, but FK/index creation still requires
locks. Do not copy this file into the active migration directory until those gates pass.

## Verification and limits

`npm run test:artifacts` covers lossless mapping, authorities, identity scope/editions,
versions, review planning, legacy compatibility, recursion, and static schema/SQL
alignment. `npm test` also runs the existing Prisma foundation and complete Phase 1/1B
suites. Tests use synthetic source content and no providers/database. Static SQL checks
are not a substitute for PostgreSQL execution. No local PostgreSQL server tools were
available during this task; the proposal has not been executed anywhere.

The standard installed Prisma 7.10.0 CLI stalled before output in bounded validation
and generation attempts using dummy localhost URLs. The installed Prisma schema WASM
was invoked directly offline for DMMF validation (37 models); it found and verified the
composite-key fix. Normal CLI generation remains a gate before deployment/runtime use
of these new models. This task does not change CLI dependencies or diagnose that stall.

Recorded local results: 20 storage tests + 8 Prisma foundation tests + 86 Phase 1/1B
regression tests = 114 passed, 0 failed, 0 skipped. Syntax checks and `git diff --check`
passed. A read-only mapping check of the current local Chapter 1 artifact preserved
its complete 16-node / 7-objective JSON and UNREVIEWED state, with unchanged file bytes.
No source content from that artifact was copied into the synthetic test fixtures.

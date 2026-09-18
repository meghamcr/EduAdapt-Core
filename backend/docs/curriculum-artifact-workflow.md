# Phase 2C: review and safe curriculum materialization

This service implements local application code against the existing Phase 2B.2
schema. No new migration/schema change is required. The operator reports that
`20260919000100_curriculum_artifact_storage` is deployed; this task does not query,
modify or re-verify the live database. Historical SQL and Grade 6 data are untouched.

## Service boundaries

`createArtifactService(prisma, { dbNull: Prisma.DbNull })` receives its client explicitly.
Loading the module never loads `.env`, creates a client or issues a query. Methods:

- `persist(artifact, { generatedBy, selectCurrent })`
- `inspect(versionId)`
- `review(versionId, nextState, { expectedRevision, reviewerReference, notes })`
- `dryRun(versionId)`
- `importVersion(versionId, { importedBy })`
- `validateGameGrounding(versionId, materializedNodeId)`
- `gameGroundingInTransaction(tx, versionId, materializedNodeId)`

Write transactions use Serializable isolation; reads use RepeatableRead. Database
uniqueness/serialization conflicts fail safely, with no automatic retry. Re-inspect
and re-plan before an explicit retry. The CLI translates Prisma P2002/P2034 into
CONCURRENT_CONFLICT and suppresses raw provider errors, URLs, stacks and credentials.
Service callers must apply equivalent error handling and their own authorization.
This phase provides no HTTP endpoint, authentication change or reviewer authorization
system; possession of a reviewer reference is not authentication.

## Persistence and current version

The existing Phase 2B.2 mapper validates the artifact and retains the complete immutable
snapshot, identity, model/time, source registry/checksums/pages, extraction data,
objectives/evidence, fingerprints, materials, roles, warnings and visual metadata.
The mapper's canonical JSON checksum determines immutable version ID and replay identity.
Source/content equality alone does not mean identical artifacts. Generation metadata
changes yield new versions even if the educational content is unchanged.

All NEW versions start UNREVIEWED, regardless of status claimed inside the source file.
Exact replay returns the existing version and its actual review state; it neither
resets a completed review nor overwrites the original generating actor. Existing rows
are checked against the snapshot-derived immutable fields before reuse.

`selectCurrent` defaults to false. A newly created identity has no selected version.
Only an explicit true flag updates currentVersionId in the persistence transaction.
Current is a navigation selection, independent of approval and import. Approval does
not move currentVersionId or automatically supersede other versions.

Legacy artifacts can be archived with null authority/provenance fields. No Grade 6
backfill is performed. Such artifacts cannot gain authority-v2 approval implicitly.

## Explicit review state machine

| From | Allowed destinations |
| --- | --- |
| UNREVIEWED | IN_REVIEW, REJECTED, SUPERSEDED |
| IN_REVIEW | APPROVED, REJECTED, SUPERSEDED |
| APPROVED | SUPERSEDED |
| REJECTED | IN_REVIEW, SUPERSEDED |
| SUPERSEDED | none |

Approval AND rejection require a nonblank reviewerReference. Other transitions can
have a null reviewer. Notes are optional. Approval requires validated authority-v2
content and an explicit review operation; passing validation never approves anything.

Each review locks the version row, checks caller expectedRevision, performs a
compare-and-swap update of state/revision and inserts one append-only event in the
same transaction. Failed event insertion rolls back the state update. Stale revisions
fail. History is never updated or rewritten. Corrections to content require a new
artifact version, not editing a reviewed snapshot.

## Authority boundary

Only EXPLICIT_SOURCE_CONTENT rendered by the unchanged Phase 1 renderer is written to
CurriculumNode.content. SOURCE_GROUNDED_SYNTHESIS remains in source_synthesis;
MODEL_VISUAL_INTERPRETATION and MODEL_INFERENCE remain review-only information.
Visual descriptions never become authoritative content. Snapshot metadata preserves
student_completion, page evidence, unanswered tasks and visual dependencies.

Structural validation does not prove textbook fidelity. Human reviewers must examine
source pages, objectives, visuals, unresolved dependencies and unanswered questions
before deciding approval. Approval does not promote inference into source content.

## Dry-run plan

Dry-run uses read queries only and never selects current, reviews, imports, writes
history, locks rows FOR UPDATE, or changes curriculum. It reports version/review
status, scoped identity, provenance fingerprints, expected book/chapter/nodes,
parent-first order, stable nodeMapping, existing matches, proposed creations, import
history and explicit conflict codes. Missing versions return VERSION_NOT_FOUND;
unapproved versions can be described but are blocked with NOT_APPROVED.

Sibling order is source order, then exact node ID for deterministic ties. Titles are
not unique keys. Arbitrary recursive depth is preserved. The validator rejects
missing parents, cycles, self-parenting, duplicate IDs and unreachable nodes.
Artifact node IDs are reused exactly; a collision in another chapter is a conflict,
not an invitation to change an existing ID. nodeMapping records those explicit pairs.

Plans are advisory snapshots, not authorization tokens. Execute-import recomputes the
plan inside its transaction; a previously successful dry run cannot bypass new
conflicts or a later review decision.

## Materialization and conflict policy

The importer locks the version row using a parameterized SELECT FOR UPDATE (the same
lock used by reviews), requires APPROVED and authority-v2 integrity, and recomputes all
checks inside a Serializable transaction. A concurrent supersession is serialized;
serialization conflicts abort. The importer creates only missing compatible book,
chapter and parent-first nodes. It verifies full expected rows and node count before
writing CurriculumArtifactImport in the SAME transaction. Any failure rolls back all
changes. There is no delete, replacement, update or upsert of curriculum rows.

- A book can be reused only with identical ID, board, grade, subject, title and edition.
- Both ID collisions and the legacy book/title and chapter/number uniqueness constraints
  are checked. Same title under another board/grade/subject is not the same identity.
- An existing chapter without a matching version import record is legacy data; even
  byte-identical content does not prove provenance. Import is blocked for separate
  operator reconciliation. It is never silently adopted or backfilled.
- Any prior import from another version/target blocks replacement, including regenerated
  versions with unchanged text. Safe version activation/replacement is future work.
- Matching import history, exact mapping and complete matching rows allow idempotent
  reuse. Drift, extra/missing nodes, wrong parents/order/content or cross-chapter ID
  collisions fail; the importer does not repair data automatically.
- SourceFile is left unspecified on new materializations; source references and full
  provenance stay in the immutable version. Existing sourceFile metadata is preserved.

The legacy book unique(board, grade, subject, title) omits edition. Artifact storage
can represent multiple editions, but conflicting editions cannot safely be materialized
simultaneously into these legacy tables. Import fails explicitly rather than merging
editions or rewriting existing identifiers. Existing 612 Grade 6 nodes require no
new provenance, review record or identifier changes.

The old file-only `importCurriculumToDatabase.js` entry point is now disabled. Its
export rejects with LEGACY_IMPORT_DISABLED and does not construct a client. This closes
the previous approval bypass and chapter delete-and-recreate route.

## GameSpec grounding

Historical null artifact linkage remains accepted. A non-null link requires an
APPROVED, valid version, a matching successful import, an exact mapping and matching
materialized chapter/nodes. A node outside the mapping is rejected. Superseded versions
cannot ground NEW games; historical GameSpec rows are not changed.

`validateGameGrounding` is a standalone check, not a durable authorization. Future game
writers must call `gameGroundingInTransaction` using the SAME Serializable transaction
as their GameSpec.create so the version lock protects the approval decision until
commit. No game generation or GameSpec write is implemented here.

## CLI safeguards and operational workflow

From `backend/`, use `node src/services/curriculumArtifacts/artifactCli.js --help`.
No `.env` is loaded. Configure ONLY `CURRICULUM_DATABASE_URL` through a secure process
environment. Every operation additionally requires `--target host:port/database` to
match that URL exactly (default port 5432). Passwords must never be command arguments,
pasted into reports, or committed. Persist/review/import require `--write`. Default
command is dry-run. `--select-current` is accepted only for persist. There is no
implicit approval, import, target fallback or retry.

For manual validation, FIRST use an explicitly disposable database with the current
schema, prepared under separate authorization. Do not bootstrap a temporary schema
inside live Supabase or replay the incomplete historical migrations blindly.
The following localhost target is an example only, not a configured database:

```sh
node src/services/curriculumArtifacts/artifactCli.js persist --file /absolute/path/to/synthetic.json --target localhost:5432/eduadapt_disposable --write
node src/services/curriculumArtifacts/artifactCli.js inspect --version VERSION_ID --target localhost:5432/eduadapt_disposable
node src/services/curriculumArtifacts/artifactCli.js review --version VERSION_ID --state IN_REVIEW --revision 0 --target localhost:5432/eduadapt_disposable --write
# After an actual source review, explicitly supply the responsible reviewer:
node src/services/curriculumArtifacts/artifactCli.js review --version VERSION_ID --state APPROVED --revision 1 --reviewer REVIEWER_REFERENCE --target localhost:5432/eduadapt_disposable --write
node src/services/curriculumArtifacts/artifactCli.js dry-run --version VERSION_ID --target localhost:5432/eduadapt_disposable
# Inspect allowed/conflicts, target identity, nodes and mapping before continuing:
node src/services/curriculumArtifacts/artifactCli.js import --version VERSION_ID --actor OPERATOR_REFERENCE --target localhost:5432/eduadapt_disposable --write
node src/services/curriculumArtifacts/artifactCli.js dry-run --version VERSION_ID --target localhost:5432/eduadapt_disposable
```

Post-import plan must show allowed=true, alreadyImported=true, no missing nodes and
all expected nodesMatching. Repeat explicit import must return reused=true without
new curriculum/history rows. Test a stale review revision, unapproved import, title/ID
collision and mismatched edition; each must fail without curriculum mutation. Run
concurrent review/import and simultaneous creates in disposable PostgreSQL to exercise
actual locks, unique constraints and serialization failures. Unit mocks cannot prove
PostgreSQL transaction behavior.

For the existing Grade 4 Maths Mela Chapter 1, the intended controlled workflow is:
**generation already completed → persist → inspect → human source review → explicit
approval → dry-run → inspect plan → separately authorized explicit import → verify**.
Use its existing local processed-phase1b artifact without regenerating or editing it.
It contains 16 nodes and 7 objectives and remains UNREVIEWED locally. None of these
persist/review/import steps were performed on it or on the live database in this task.

## Local verification

`npm run test:artifacts` runs existing storage tests plus service tests with synthetic
fixtures and an injected transactional mock. It covers rollback, stale decisions,
provenance, authority, plans, idempotency, conflicts, legacy protection and GameSpec
checks. `npm test` includes all Phase 1/1B and Prisma foundation tests. No mock writes
are database writes. No test requires a provider or live database.

The pre-deployment tests that assumed exactly two migrations now explicitly include
the committed third migration and pin its SHA-256; historical hash checks remain.
No SQL or historical manifest evidence is rewritten. Generated Prisma client output
is local ignored build output, not a schema or migration change.

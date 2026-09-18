# Phase 2B.1: Prisma runtime and migration foundation

This step fixes local runtime initialization and records a forward strategy. It
does not authorize production migrations, ledger edits, imports or schema design.
No provenance/authority tables are introduced here.

## Runtime

`src/prismaClient.js` remains the one CommonJS client export. It loads the backend
`.env` using a path relative to the module, quietly and without overriding process
environment values. Application queries use `DATABASE_URL` through the official
`@prisma/adapter-pg` adapter, pinned to 7.10.0 to match the installed Prisma client
and CLI. The adapter brings its `pg` driver dependency; no separate driver API is
used by application code.

Missing/invalid runtime URLs raise `PRISMA_RUNTIME_CONFIG_INVALID` without URL
values or URL-parser causes. `DIRECT_URL` is deliberately not a runtime fallback.
CommonJS caching centralizes imports; a namespaced global cache prevents repeated
client/adapter creation during development reloads. Restart the process after
changing connection configuration. Call `$disconnect()` when a standalone script
finishes, not after every application request. Client construction does not query
the database.

`prisma7.config.ts` continues to use `DIRECT_URL` for CLI administration. In the
Phase 2A environment, this is a session pooler on port 5432; runtime uses a
transaction pooler on port 6543. The variable name does not imply an unpooled host.
Do not change TLS/certificate handling to bypass validation. URL settings remain
operator configuration; this step does not assert live connectivity.

Reference: [Prisma 7 adapter setup](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7).

## Known checkpoint and live state

Repository checkpoint: `ae63187`, "Complete curriculum ingestion Phase 1".
The non-executable `prisma/baseline-reference.json` records exact SHA-256 hashes
for the checkpoint schema and both historical migration files. It is outside the
migration directory and is NOT an automatically deployable baseline.

Phase 2A read-only observations (historical snapshot, not current row guarantees):

- PostgreSQL 17.6; 33 application tables plus `_prisma_migrations`.
- Column names, types and nullability broadly match the Prisma schema.
- Two Grade 6 NCERT books: Ganita Prakash (10 chapters / 222 nodes) and Curiosity
  (12 chapters / 390 nodes): 22 chapters / 612 recursive nodes in total.
- Existing users, schools/classes and two game specs are protected.
- Curriculum, base organisation and game-spec/session creation history is absent
  from the two checked-in migrations.
- Live triggers, grants and RLS policies are not fully represented in Prisma.
- The original adaptive migration requests CASCADE where current schema/live DB
  use RESTRICT for 13 relationships, omits four mastery foreign keys, and declares
  an index absent from current schema/live DB.
- Broad public-role grants and RLS findings require a separately approved review;
  do not replicate them unquestioningly into new environments.

## Migration ledger discrepancy

`20260820231000_adaptive_learning`:

- Checked-in SHA-256:
  `64874ed118ee48ecf0bc40958dcc47d9e4002a4e775d5122ecc85d08c57d7a4f`.
- Completed live ledger SHA-256:
  `620a04407e33e2a38f7e8daa216ef988ad1e81fc2cdbae2e80b2352a6519e470`.
- The ledger contains rolled-back attempts from 2026-08-29 and 2026-09-18, plus a
  completed record on 2026-09-18. All report zero applied steps. This does not prove
  which SQL was executed; do not infer a repair procedure from the status alone.

`20260820231100_add_level_table` has a completed record and matching checksum:
`b0b000c1834465def1afa81bdfc84408ad2bd4a93aaa482b9edd7addb4322e07`.

Historical migration SQL remains byte-for-byte unchanged. Replaying it is unsafe:
it assumes an already populated base schema, creates already-existing objects and
can impose different deletion semantics. The checksum mismatch must not be hidden
by editing SQL or casually marking migrations applied.

## Adopted strategy: verified baseline, then additive forward migrations

1. Recover the exact SQL associated with the completed adaptive ledger checksum
   from deployment/operator history. Record the provenance of manual schema work.
   A matching table list alone is not proof of migration equivalence.
2. Prepare a complete baseline candidate outside the active migration directory,
   derived from the intended Prisma schema and compared with the verified live
   catalog. Inventory triggers, functions, extensions, grants and RLS separately.
   Explicitly decide which existing behavior belongs in a clean environment.
3. Prove reproducibility on a disposable, isolated local PostgreSQL database:
   baseline, schema comparison, application construction and integration tests.
   Use synthetic fixtures only. Never point bootstrap tooling at the backend's
   ordinary `.env`, `DATABASE_URL` or `DIRECT_URL` by default.
4. Obtain explicit approval for a coordinated repository migration-history
   transition and production ledger reconciliation. Preserve the old SQL in an
   immutable archive if a new baseline lineage replaces it. Do not append an
   empty-to-current baseline after the existing incomplete migrations.
5. Only after that transition is agreed, introduce separately reviewed additive
   forward migrations. Test both fresh bootstrap and baseline-to-new-schema
   upgrade paths on disposable databases before proposing production execution.

This is the foundation for reproducibility, not a claim that current `migrate deploy` can build an empty database. No deployable baseline SQL or live resolution
command is supplied in this step. Until reconciliation is approved, do not run
`migrate deploy`, `migrate dev`, `migrate resolve`, `db push`, reset or seed against
the live environment. Do not edit `_prisma_migrations`.

## Fresh development/test bootstrap (future, explicitly isolated)

A future bootstrap should require a dedicated disposable database URL and explicit
confirmation of its identity. It must refuse the production URLs and avoid loading
the local production `.env`. Generate an empty-to-schema SQL candidate offline,
review it together with required non-Prisma objects, then apply only to the empty
sandbox. Verify columns, keys, defaults, deletion actions, indexes, enums and
approved triggers/policies. Record hashes and tool versions. Do not copy production
rows or rewrite protected Grade 6 IDs.

The schema referenced by the manifest can be recovered from Git checkpoint
`ae63187`; the manifest is not a second independently maintained Prisma schema.
Future approved schema work should version the reference deliberately and update
its test, rather than quietly overwriting historical evidence.

## Local checks

From `backend/`:

- `npm run test:prisma`: configuration mocks, real offline adapter/client
  construction, CommonJS importer-load compatibility and reference hash checks.
- `npm run test:curriculum`: unchanged Phase 1/1B suite.
- `npm test`: both suites.

Runtime tests do not execute the importer. The real-client smoke test uses a fake
localhost URL and blocks socket/DNS/fetch attempts. Missing-configuration tests
mock dotenv, so they cannot accidentally load a developer's real credentials.
No automated test in this step requires live access or database writes.

## Remaining gates before imports

The existing importer still needs a separately approved redesign: approval gating,
lossless authority/provenance storage, identity checks, safe replacement/versioning,
concurrency behavior and verification within the transaction. Those are not fixed
here. Phase 2B.2 schema design and all data backfills remain unapproved.

## Phase 2B.2 reference preservation

The checkpoint schema is now frozen byte-for-byte at
`prisma/baselines/phase2b1.schema.prisma`. The reference manifest retains its original
hash and points there while `prisma/schema.prisma` evolves. Historical migration SQL
and ledger reconciliation requirements are unchanged. The new forward SQL proposal
is outside the configured migration directory; see
[curriculum artifact storage](curriculum-artifact-storage.md). Phase 2B.2 authorizes
repository storage design only, not deployment or importer work.

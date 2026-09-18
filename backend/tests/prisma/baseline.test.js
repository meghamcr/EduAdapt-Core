const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../prisma');
const reference = require('../../prisma/baseline-reference.json');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

test('baseline reference is nondeployable and preserves checkpoint schema/history', () => {
  assert.equal(reference.kind, 'NON_DEPLOYABLE_BASELINE_REFERENCE');
  assert.equal(reference.databaseWritesAllowed, false);
  assert.equal(reference.productionReconciliationApproved, false);
  assert.equal(hash(path.join(root, reference.schema.path)), reference.schema.sha256);
  for (const migration of reference.historicalMigrations) assert.equal(hash(path.join(root, migration.path)), migration.sha256);
  assert.deepEqual(fs.readdirSync(path.join(root, 'migrations')).sort(), [...reference.historicalMigrations.map(m => m.name), '20260919000100_curriculum_artifact_storage'].sort());
});

test('reference records the unresolved completed-ledger checksum discrepancy', () => {
  const adaptive = reference.historicalMigrations.find(m => m.name.endsWith('adaptive_learning'));
  assert.notEqual(adaptive.sha256, reference.phase2aObservation.completedAdaptiveMigrationChecksum);
  assert.equal(reference.checkpoint, 'ae63187');
  assert.equal(hash(path.join(root, 'migrations/20260919000100_curriculum_artifact_storage/migration.sql')), '5da20ed12d112834f91b381a645cf4eb415b74dfa4c929f8955ddb73d1fc28a9');
});

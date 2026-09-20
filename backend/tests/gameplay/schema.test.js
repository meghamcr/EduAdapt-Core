'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
test('Phase 3F migration matches additive proposal with durable unique keys', () => {
  const sql = fs.readFileSync(path.join(root, 'prisma/proposals/phase3f/migration.sql'), 'utf8');
  assert.doesNotMatch(sql, /^\s*(?:DROP|DELETE|UPDATE|ALTER\s+TABLE)\b/m);
  assert.equal((sql.match(/CREATE TABLE/g) || []).length, 3);
  for (const key of ['GameplayEvidenceEvent_sessionId_eventKey_key', 'GameplayEvidenceEvent_sessionId_sequence_key', 'GameplayEvidenceEvent_scopeId_scopeSequence_key', 'GameplayEvidenceSession_learnerId_creationKey_key']) assert.ok(sql.includes(key));
  assert.equal(fs.readFileSync(path.join(root, 'prisma/migrations/20260919000200_gameplay_evidence/migration.sql'), 'utf8'), sql);
  assert.equal((sql.match(/ON DELETE RESTRICT ON UPDATE RESTRICT/g) || []).length, 10);
  assert.equal((sql.match(/CREATE UNIQUE INDEX/g) || []).length, 5);
  assert.match(sql, /CHECK \(\("type" = 'ANSWER_SUBMITTED'\) = \("correctness" IS NOT NULL\)\)/);
});
test('new mastery is artifact/node-scoped, with no fabricated objective/topic associations', () => {
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const mastery = schema.match(/model CurriculumNodeMastery \{([\s\S]*?)\n\}/)[1];
  assert.match(mastery, /@@unique\(\[learnerId, artifactVersionId, nodeId\]\)/);
  assert.doesNotMatch(mastery, /Topic|Subtopic|Objective|XP|Leaderboard/);
});

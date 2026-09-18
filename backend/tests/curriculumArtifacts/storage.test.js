const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { curriculum } = require('../curriculumIngestion/fixtures/helpers');
const { fingerprint, contentFingerprint } = require('../../src/services/curriculumIngestion/curriculumIdentity');
const { renderMaterials } = require('../../src/services/curriculumIngestion/sourceFidelity');
const { prepareArtifactStorage: prepare, prepareReviewTransition: transition, compareVersions, REVIEW_STATES } = require('../../src/services/curriculumArtifacts/artifactStorage');
const root = path.resolve(__dirname, '../..');
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
const old = fs.readFileSync(path.join(root, 'prisma/baselines/phase2b1.schema.prisma'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'prisma/proposed-migrations/phase2b2-curriculum-artifacts.sql'), 'utf8');
const ref = [{ sourceId: 'source-A', page: 3 }];
function material(authority, evidence_kind, text, role = 'explanation') {
  return { authority, evidence_kind, text, role, source_refs: ref, student_completion: role === 'question',
    review_required: authority.startsWith('MODEL_'), visual: { status: authority === 'MODEL_VISUAL_INTERPRETATION' ? 'VISUAL_DEPENDENCY' : 'NOT_APPLICABLE', description: '', authority: 'MODEL_VISUAL_INTERPRETATION', review_required: true } };
}
function artifact() {
  const a = curriculum();
  a.source_context = { version: 1, authorityVersion: 2, mode: 'pdf', documents: [{ sourceId: 'source-A', sha256: 'a'.repeat(64), pages: [3] }] };
  a.objective_evidence = [ref];
  a.nodes.forEach(n => {
    n.materials = [material('EXPLICIT_SOURCE_CONTENT', 'SOURCE_TEXT', n.content), material('EXPLICIT_SOURCE_CONTENT', 'SOURCE_TEXT', 'How could you arrange the counters?', 'question')];
    n.source_synthesis = [material('SOURCE_GROUNDED_SYNTHESIS', 'SOURCE_SUMMARY', 'This section concerns arrangements.')];
    n.review_inferences = [material('MODEL_VISUAL_INTERPRETATION', 'VISUAL_READING', 'Possible diagram interpretation.'), material('MODEL_INFERENCE', 'DEDUCTION', 'Unverified deduction.')];
    n.content = renderMaterials(n.materials);
  });
  a._ingestion = { artifactVersion: 1, model: 'fixture-model', generatedAt: '2026-01-01T00:00:00.000Z', reviewStatus: 'UNREVIEWED', sourceFingerprint: 'b'.repeat(64), configurationFingerprint: 'c'.repeat(64), implementationFingerprint: 'd'.repeat(64), sources: [{ pdfPath: 'fixtures/arbitrary.pdf', sha256: 'a'.repeat(64), selectedPages: [3], stats: { extractedPages: 1, fileSizeBytes: 123 } }], warnings: [{ code: 'VISUAL_DEPENDENCY', message: 'Retain source visual.' }], validationStats: { totalNodes: 2 } };
  a._ingestion.contentFingerprint = contentFingerprint(a);
  return a;
}
function rehash(a) { a._ingestion.contentFingerprint = contentFingerprint(a); return a; }
function model(text, name) { return text.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))[1]; }

test('complete Phase 1 JSON round trips including future fields and educational structure', () => {
  const a = artifact(); a.future = { nested: ['tables', { blank: '' }] }; rehash(a);
  const p = prepare(a);
  assert.deepEqual(p.version.snapshot, a);
  a.nodes[0].materials[0].text = 'mutated';
  assert.notEqual(p.version.snapshot.nodes[0].materials[0].text, 'mutated');
});
test('same canonical artifact is idempotent regardless of property order', () => {
  const a = artifact(), reversed = Object.fromEntries(Object.entries(a).reverse());
  assert.equal(prepare(a).version.id, prepare(reversed).version.id);
  assert.match(schema, /artifactChecksum String @unique/);
  assert.match(sql, /CREATE UNIQUE INDEX "CurriculumArtifactVersion_artifactChecksum_key"/);
});
test('same source and unchanged content can have distinct generation versions', () => {
  const a = artifact(), b = artifact(); b._ingestion.generatedAt = '2026-01-02T00:00:00.000Z';
  const x = prepare(a), y = prepare(b);
  assert.equal(x.identity.id, y.identity.id); assert.notEqual(x.version.id, y.version.id);
  assert.deepEqual(compareVersions(x.version, y.version), { sameIdentity: true, sameArtifact: false, sameContent: true, sameSource: true });
});
test('changed source content produces a new content fingerprint', () => {
  const a = artifact(), b = artifact(); b.nodes[0].materials[0].text += ' Compare another grouping.'; b.nodes[0].content = renderMaterials(b.nodes[0].materials); rehash(b);
  assert.equal(compareVersions(prepare(a).version, prepare(b).version).sameContent, false);
});
test('all four authorities survive while projection contains only explicit text', () => {
  const v = prepare(artifact()).version, node = v.snapshot.nodes[0];
  assert.deepEqual([node.materials[0], node.source_synthesis[0], ...node.review_inferences].map(m => m.authority), ['EXPLICIT_SOURCE_CONTENT', 'SOURCE_GROUNDED_SYNTHESIS', 'MODEL_VISUAL_INTERPRETATION', 'MODEL_INFERENCE']);
  assert.equal(v.authoritativeNodes[0].content, renderMaterials(node.materials));
  assert.doesNotMatch(v.authoritativeNodes[0].content, /Unverified|interpretation|This section/);
  assert.equal(node.materials[1].student_completion, true);
});
test('authority promotion, malformed evidence and forged content are rejected', () => {
  for (const change of [a => { a.nodes[0].content += ' Unverified deduction.'; }, a => { a.nodes[0].materials[0].authority = 'MODEL_INFERENCE'; }, a => { a.objective_evidence[0][0].page = 99; }]) {
    const a = structuredClone(artifact()); change(a); rehash(a); assert.throws(() => prepare(a), /validation failed/);
  }
});
test('provenance preserves source references, checksums, pages and extraction metadata', () => {
  const a = artifact(), p = prepare(a).version.sourceProvenance;
  assert.deepEqual(p, { registry: a.source_context, sources: a._ingestion.sources });
  assert.equal(p.sources[0].pdfPath, 'fixtures/arbitrary.pdf');
});
test('objective evidence remains aligned with objective text, with no mastery linkage', () => {
  const a = artifact(), p = prepare(a).version;
  assert.deepEqual(p.objectives, [{ text: a.learning_objectives[0], evidence: ref }]);
  assert.doesNotMatch(model(schema, 'CurriculumArtifactVersion'), /Student|Mastery|LearningObjective\[\]/);
});
test('old curriculum needs no invented provenance, model, author or approval', () => {
  const v = prepare(curriculum()).version;
  for (const field of ['model', 'generatedAt', 'generatedBy', 'authorityVersion', 'authoritativeNodes', 'sourceFingerprint']) assert.equal(v[field], null);
  assert.deepEqual(v.sourceProvenance, { registry: null, sources: null });
  assert.equal(v.objectives[0].evidence, null); assert.equal(v.reviewStatus, 'UNREVIEWED');
});
test('same titles in different boards, grades, subjects, books and chapters stay separate', () => {
  const a = curriculum(), initial = prepare(a).identity.id;
  for (const key of ['board', 'grade', 'subject', 'book_id', 'chapter_id']) assert.notEqual(prepare({ ...a, [key]: `different-${key}` }).identity.id, initial);
  assert.equal(prepare({ ...a, book: 'New display title' }).identity.id, initial);
});
test('multiple editions coexist without changing source node IDs', () => {
  const a = curriculum(), b = { ...a, edition: 'another edition' };
  assert.notEqual(prepare(a).identity.id, prepare(b).identity.id);
  assert.deepEqual(prepare(a).version.snapshot.nodes.map(n => n.id), prepare(b).version.snapshot.nodes.map(n => n.id));
  const unspecified = { ...a }; delete unspecified.edition;
  assert.notEqual(prepare(unspecified).identity.id, prepare(a).identity.id);
});
test('recursive hierarchy has no fixed depth and existing node schema stays byte-identical', () => {
  const a = curriculum();
  for (let i = 0; i < 12; i++) a.nodes.push({ ...a.nodes[1], id: `deeper-${i}`, parent_id: i ? `deeper-${i-1}` : 'worked', title: `Level ${i}`, content: `Distinct educational explanation at recursive depth ${i}.` });
  assert.deepEqual(prepare(a).version.snapshot.nodes, a.nodes);
  assert.equal(model(schema, 'CurriculumNode'), model(old, 'CurriculumNode'));
  assert.equal(model(schema, 'CurriculumBook'), model(old, 'CurriculumBook'));
});
test('review lifecycle has explicit states and optimistic concurrency metadata', () => {
  assert.deepEqual(REVIEW_STATES, ['UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED']);
  const v = prepare(artifact()).version, date = new Date('2026-02-01T00:00:00Z');
  const start = transition(v, 'IN_REVIEW', { reviewedAt: date });
  const review = { ...v, ...start.update };
  assert.throws(() => transition(review, 'APPROVED', { reviewedAt: date }), /identified reviewer/);
  const approved = transition(review, 'APPROVED', { reviewedAt: date, reviewerReference: 'reviewer:fixture', notes: 'Source comparison complete.' });
  assert.equal(approved.expected.reviewRevision, 1); assert.equal(approved.event.revision, 2);
  assert.equal(approved.event.fromStatus, 'IN_REVIEW');
  const superseded = transition({ ...review, ...approved.update }, 'SUPERSEDED', { reviewedAt: date });
  assert.throws(() => transition({ ...review, ...superseded.update }, 'APPROVED', { reviewedAt: date }), /Invalid review transition/);
  assert.throws(() => transition(v, 'APPROVED', { reviewedAt: date }), /Invalid review transition/);
});
test('file approval cannot bypass review and legacy provenance cannot be approved implicitly', () => {
  const a = artifact(); a._ingestion.reviewStatus = 'APPROVED';
  const v = prepare(a).version; assert.equal(v.reviewStatus, 'UNREVIEWED'); assert.equal(v.snapshot._ingestion.reviewStatus, 'APPROVED');
  assert.throws(() => transition({ ...prepare(curriculum()).version, reviewStatus: 'IN_REVIEW' }, 'APPROVED', { reviewerReference: 'reviewer:fixture', reviewedAt: new Date() }), /authority-v2/);
});
test('metadata identity and fingerprint inconsistencies fail closed', () => {
  const a = artifact(); a._ingestion.contentFingerprint = '0'.repeat(64); assert.throws(() => prepare(a), /fingerprint mismatch/);
  const b = artifact(); b._ingestion.identity = { bookId: 'wrong' }; assert.throws(() => prepare(b), /identity disagrees/);
  const c = artifact(); c._ingestion.generatedAt = 'not-a-date'; assert.throws(() => prepare(c), /generatedAt/);
  assert.throws(() => prepare({ ...artifact(), extra: undefined }), /JSON values/);
});
test('current version is constrained to its own scope and successful import is unique', () => {
  assert.match(sql, /FOREIGN KEY \("id", "currentVersionId"\) REFERENCES "CurriculumArtifactVersion"\("identityId", "id"\)/);
  assert.match(sql, /CREATE UNIQUE INDEX "CurriculumArtifactImport_versionId_chapterId_key"/);
  assert.match(sql, /CREATE UNIQUE INDEX "CurriculumArtifactReview_versionId_revision_key"/);
});
test('GameSpec changes are nullable and preserve all historical fields and indexes', () => {
  const previous = model(old, 'GameSpec').split('\n').map(s => s.trim()).filter(Boolean);
  const current = model(schema, 'GameSpec').split('\n').map(s => s.trim());
  previous.forEach(line => assert.ok(current.includes(line), line));
  assert.match(schema, /curriculumArtifactVersionId String\?/);
  assert.match(sql, /ALTER TABLE "game_spec" ADD COLUMN "curriculum_artifact_version_id" TEXT;/);
});
test('proposed SQL only adds objects, never mutates legacy rows or migration history', () => {
  const withoutComments = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(withoutComments, /\b(DROP|TRUNCATE|GRANT|REVOKE|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+")\b/i);
  assert.doesNotMatch(withoutComments, /_prisma_migrations|ROW LEVEL SECURITY/i);
  const alters = withoutComments.match(/ALTER TABLE[^;]+;/g);
  assert.equal(alters.length, 7); alters.forEach(s => assert.match(s, / ADD (COLUMN|CONSTRAINT) /));
  assert.equal((sql.match(/CREATE TABLE /g) || []).length, 4);
  assert.match(sql, /payload is immutable/); assert.match(sql, /history is append-only/);
  assert.equal(fs.readdirSync(path.join(root, 'prisma/migrations')).length, 2);
});
test('all new Prisma storage fields have matching SQL columns and nullability', () => {
  for (const name of ['CurriculumArtifactIdentity', 'CurriculumArtifactVersion', 'CurriculumArtifactReview', 'CurriculumArtifactImport']) {
    const body = model(schema, name), table = sql.match(new RegExp(`CREATE TABLE "${name}" \\(([\\s\\S]*?)\\n\\);`))[1];
    for (const line of body.split('\n')) {
      const field = line.trim().match(/^(\w+) (String|Int|Json|DateTime|CurriculumReviewStatus)(\?)?(?:\s|$)/);
      if (!field) continue;
      const [, key, type, optional] = field, native = { String: 'TEXT', Int: 'INTEGER', Json: 'JSONB', DateTime: 'TIMESTAMP\\(3\\)', CurriculumReviewStatus: '"CurriculumReviewStatus"' }[type];
      assert.match(table, new RegExp(`"${key}" ${native}${optional ? '(?:,|\\n)' : ' (?:NOT NULL|PRIMARY KEY)'}`), `${name}.${key}`);
    }
  }
});
test('malformed and cyclic hierarchies cannot enter a new version', () => {
  const a = curriculum(); a.nodes[0].parent_id = 'worked';
  assert.throws(() => prepare(a), /validation failed/);
  assert.throws(() => prepare({ ...curriculum(), nodes: [null] }), /validation failed/);
});

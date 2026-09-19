'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGenerationContextService } = require('../../src/services/gameGeneration/generationContext');
const { createArtifactService } = require('../../src/services/curriculumArtifacts/artifactService');
const { artifact, rehash, database } = require('../curriculumArtifacts/fixtures/serviceFixture');
async function fixture(a = artifact(), { approve = true, imported = true } = {}) {
  const db = database(), storage = createArtifactService(db, { dbNull: null });
  const { versionId } = await storage.persist(a);
  if (approve) {
    await storage.review(versionId, 'IN_REVIEW', { expectedRevision: 0 });
    await storage.review(versionId, 'APPROVED', { expectedRevision: 1, reviewerReference: 'synthetic-reviewer' });
  }
  if (imported && approve) await storage.importVersion(versionId);
  db.trace = [];
  return { db, build: createGenerationContextService(db).build,
    input: { curriculumArtifactVersionId: versionId, curriculumNodeId: 'worked' }, a };
}
test('approved imported mapped node produces explicit content, scope and grounded objectives', async () => {
  const { build, input, a } = await fixture(); const c = await build(input);
  assert.equal(c.contextVersion, 1); assert.equal(c.curriculum.nodeId, 'worked'); assert.equal(c.curriculum.mappedNodeId, 'worked');
  assert.equal(c.curriculum.authoritativeContent, a.nodes[1].content);
  assert.deepEqual(c.curriculum.book, { id: a.book_id, title: a.book });
  assert.equal(c.curriculum.chapter.id, a.chapter_id); assert.equal(c.curriculum.edition, a.edition);
  assert.deepEqual(c.curriculum.learningObjectives, [{ index: 0, text: a.learning_objectives[0], sourceRefs: a.objective_evidence[0] }]);
  assert.equal(c.curriculum.objectiveScope, 'CHAPTER'); assert.equal(c.grounding.reviewStatus, 'APPROVED'); assert.equal(c.grounding.imported, true);
  assert.equal(c.constraints.academicScopeLocked, true); assert.equal(c.constraints.allowAcademicInference, false);
});
for (const field of ['curriculumArtifactVersionId', 'curriculumNodeId']) {
  for (const value of [undefined, null, '', ' ', 7]) test(`${field} rejects ${String(value)} before opening a transaction`, async () => {
    const { db, build, input } = await fixture(); input[field] = value;
    await assert.rejects(build(input)); assert.equal(db.trace.length, 0);
  });
}
test('omitted fields and unsupported caller content/bypass flags fail closed', async () => {
  const { db, build, input } = await fixture();
  for (const selection of [null, {}, { curriculumNodeId: 'worked' }, { curriculumArtifactVersionId: input.curriculumArtifactVersionId }, ...['allowLegacy', 'skipApproval', 'trustTitle', 'title', 'authoritativeContent', 'snapshot'].map(k => ({ ...input, [k]: true }))]) await assert.rejects(build(selection));
  assert.equal(db.trace.length, 0);
});
test('unknown explicit version never falls back to current', async () => {
  const { db, build, input } = await fixture();
  db.state.curriculumArtifactIdentity[0].currentVersionId = input.curriculumArtifactVersionId;
  await assert.rejects(build({ ...input, curriculumArtifactVersionId: 'unknown' }));
});
for (const state of ['UNREVIEWED', 'IN_REVIEW', 'REJECTED', 'SUPERSEDED']) test(`${state} cannot ground NEW generation`, async () => {
  const { db, build, input } = await fixture(); db.state.curriculumArtifactVersion[0].reviewStatus = state;
  await assert.rejects(build(input), /GAME_GROUNDING_BLOCKED/);
});
test('approved but unimported version is blocked', async () => {
  const { build, input } = await fixture(artifact(), { imported: false }); await assert.rejects(build(input), /GAME_GROUNDING_BLOCKED/);
});
test('node outside mapping is blocked, including a title supplied as node ID', async () => {
  const { build, input, a } = await fixture();
  await assert.rejects(build({ ...input, curriculumNodeId: 'not-mapped' }), /GAME_NODE_OUTSIDE_MAPPING/);
  await assert.rejects(build({ ...input, curriculumNodeId: a.nodes[1].title }), /GAME_NODE_OUTSIDE_MAPPING/);
});
test('missing materialized node fails rather than repairing', async () => {
  const { db, build, input } = await fixture(); db.state.curriculumNode.pop(); const before = structuredClone(db.state);
  await assert.rejects(build(input)); assert.deepEqual(db.state, before);
});
for (const field of ['content', 'parentId', 'orderIndex']) test(`materialized ${field} drift fails`, async () => {
  const { db, build, input } = await fixture(); db.state.curriculumNode[1][field] = field === 'orderIndex' ? 9 : 'tampered'; await assert.rejects(build(input));
});
for (const scope of ['nodeChapter', 'chapterBook', 'bookBoard', 'edition']) test(`wrong ${scope} scope fails`, async () => {
  const { db, build, input } = await fixture();
  if (scope === 'nodeChapter') db.state.curriculumNode[1].chapterId = 'wrong';
  if (scope === 'chapterBook') db.state.curriculumChapter[0].bookId = 'wrong';
  if (scope === 'bookBoard') db.state.curriculumBook[0].board = 'wrong';
  if (scope === 'edition') db.state.curriculumBook[0].edition = 'wrong';
  await assert.rejects(build(input));
});
test('snapshot, projection and import mapping integrity are checked by Phase 2C', async () => {
  for (const kind of ['snapshot', 'projection', 'mapping']) {
    const { db, build, input } = await fixture();
    if (kind === 'snapshot') db.state.curriculumArtifactVersion[0].snapshot.book = 'tampered';
    if (kind === 'projection') db.state.curriculumArtifactVersion[0].authoritativeNodes[1].content = 'tampered';
    if (kind === 'mapping') db.state.curriculumArtifactImport[0].nodeMapping.worked = 'root';
    await assert.rejects(build(input));
  }
});
test('duplicate titles and arbitrary hierarchy depth preserve exact ID path', async () => {
  const a = artifact();
  for (let i = 0; i < 25; i++) a.nodes.push({ ...structuredClone(a.nodes[1]), id: `deep-${i}`, parent_id: i ? `deep-${i-1}` : 'worked', title: 'Repeated title' });
  const { build, input } = await fixture(rehash(a)); const c = await build({ ...input, curriculumNodeId: 'deep-24' });
  assert.deepEqual(c.curriculum.hierarchyPath.map(n => n.nodeId), ['root', 'worked', ...Array.from({length:25}, (_,i)=>`deep-${i}`)]);
  assert.equal(c.curriculum.nodeId, 'deep-24'); assert.equal(c.constraints.hierarchyIsNavigationOnly, true);
});
for (const authority of ['SOURCE_GROUNDED_SYNTHESIS', 'MODEL_VISUAL_INTERPRETATION', 'MODEL_INFERENCE']) test(`${authority} and visual descriptions are excluded`, async () => {
  const a = artifact(), node = a.nodes[1], item = structuredClone(node.materials[0]);
  item.authority = authority; item.evidence_kind = { SOURCE_GROUNDED_SYNTHESIS: 'SOURCE_SUMMARY', MODEL_VISUAL_INTERPRETATION: 'VISUAL_READING', MODEL_INFERENCE: 'DEDUCTION' }[authority];
  item.review_required = authority.startsWith('MODEL_'); item.text = 'NON_AUTHORITATIVE_SENTINEL';
  if (authority === 'MODEL_VISUAL_INTERPRETATION') item.visual.status = 'VISUAL_DEPENDENCY';
  node[authority === 'SOURCE_GROUNDED_SYNTHESIS' ? 'source_synthesis' : 'review_inferences'].push(item);
  node.materials[0].visual = { ...node.materials[0].visual, status: 'VISUAL_UNRESOLVED', description: 'NON_AUTHORITATIVE_SENTINEL' };
  const { build, input } = await fixture(rehash(a)); const c = await build(input);
  assert.equal(JSON.stringify(c).includes('NON_AUTHORITATIVE_SENTINEL'), false);
  assert.equal(c.curriculum.materials[0].visualDependency, 'VISUAL_UNRESOLVED'); assert.equal(c.curriculum.authoritativeContent, node.content);
});
test('unanswered task wording and completion flag stay intact', async () => {
  const a = artifact(), n = a.nodes[1]; n.materials[0].role = 'question'; n.materials[0].student_completion = true;
  n.materials[0].text = 'Draw an arrangement in the blank table: |   |   |'; n.content = `[question] ${n.materials[0].text}`;
  const { build, input } = await fixture(rehash(a)); const c = await build(input);
  assert.equal(c.curriculum.authoritativeContent, n.content); assert.equal(c.curriculum.materials[0].studentCompletion, true); assert.equal(c.constraints.preserveUnansweredTasks, true);
});
test('missing or unsupported objective evidence fails without inventing evidence', async () => {
  for (const missing of [true, false]) {
    const { db, build, input } = await fixture(); const a = db.state.curriculumArtifactVersion[0].snapshot;
    if (missing) delete a.objective_evidence; else a.objective_evidence[0][0].page = 999;
    await assert.rejects(build(input));
  }
});
test('same selection is deterministic and ignores current version and timestamps', async () => {
  const { db, build, input } = await fixture(); const first = await build(input);
  db.state.curriculumArtifactIdentity[0].currentVersionId = null;
  db.state.curriculumArtifactImport[0].importedAt = new Date('2030-01-01T00:00:00Z');
  db.state.curriculumArtifactVersion[0].reviewRevision += 1;
  assert.equal(JSON.stringify(await build(input)), JSON.stringify(first));
  assert.equal('difficulty' in first, false); assert.equal('learnerState' in first, false);
});
test('returned structures are deeply frozen and detached from database objects', async () => {
  const { db, build, input } = await fixture(); const c = await build(input), before = structuredClone(db.state);
  const pending = [c]; while (pending.length) { const x = pending.pop(); if (x && typeof x === 'object') { assert.equal(Object.isFrozen(x), true); pending.push(...Object.values(x)); } }
  assert.throws(() => { c.curriculum.authoritativeContent = 'changed'; }, TypeError);
  assert.throws(() => { c.curriculum.materials[0].sourceRefs[0].page = 999; }, TypeError);
  assert.throws(() => c.curriculum.hierarchyPath.push({}), TypeError);
  assert.deepEqual(db.state, before);
  db.state.curriculumArtifactVersion[0].snapshot.nodes[1].materials[0].text = 'external change';
  assert.notEqual(c.curriculum.materials[0].text, 'external change');
});
test('building context performs zero data writes and uses one protected transaction', async () => {
  const { db, build, input } = await fixture(); const before = structuredClone(db.state);
  db.hook = (_name, operation) => { if (!operation.startsWith('find')) throw new Error('Write forbidden'); };
  await build(input); assert.deepEqual(db.state, before);
  assert.equal(db.trace.filter(t => t.operation === 'transaction').length, 1);
  assert.equal(db.trace[0].options.isolationLevel, 'Serializable');
  assert.ok(db.trace.filter(t => t.operation === 'lock').every(t => /^SELECT .* FOR UPDATE$/.test(t.sql)));
  assert.equal(db.trace.filter(t => !['transaction', 'lock', 'findMany', 'findUnique'].includes(t.operation)).length, 0);
});

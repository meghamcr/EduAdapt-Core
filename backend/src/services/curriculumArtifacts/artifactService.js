const { isDeepStrictEqual: equal } = require('node:util');
const { prepareArtifactStorage, prepareReviewTransition } = require('./artifactStorage');
const { fingerprint } = require('../curriculumIngestion/curriculumIdentity');
const IMPORTER_FINGERPRINT = fingerprint({ contract: 'approved-additive-materialization-v1' });
class ArtifactServiceError extends Error {
  constructor(code, details = undefined) { super(code); this.name = 'ArtifactServiceError'; this.code = code; this.details = details; }
}
const fail = (code, details) => { throw new ArtifactServiceError(code, details); };
const matches = (row, expected) => row && Object.entries(expected).every(([k, v]) => equal(row[k], v));
function orderedNodes(nodes) {
  const children = new Map();
  for (const n of nodes) { const key = n.parent_id || ''; if (!children.has(key)) children.set(key, []); children.get(key).push(n); }
  for (const group of children.values()) group.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const result = [], pending = [...(children.get('') || [])].reverse();
  while (pending.length) { const node = pending.pop(); result.push(node); pending.push(...(children.get(node.id) || []).slice().reverse()); }
  if (result.length !== nodes.length) fail('INVALID_HIERARCHY');
  return result;
}
// All dependencies are supplied. Importing this module never connects to a database.
function createArtifactService(db, { dbNull, now = () => new Date() } = {}) {
  const transaction = (fn, readOnly = false) => db.$transaction(fn, { isolationLevel: readOnly ? 'RepeatableRead' : 'Serializable', timeout: 30000 });
  const lock = (tx, id) => tx.$queryRaw`SELECT "id" FROM "CurriculumArtifactVersion" WHERE "id" = ${id} FOR UPDATE`;
  async function checked(tx, id) {
    const version = await tx.curriculumArtifactVersion.findUnique({ where: { id } });
    if (!version) fail('VERSION_NOT_FOUND');
    const prepared = prepareArtifactStorage(version.snapshot, { generatedBy: version.generatedBy });
    for (const [key, value] of Object.entries(prepared.version)) {
      if (['reviewStatus', 'reviewRevision'].includes(key)) continue;
      if (!equal(version[key], value)) fail('VERSION_INTEGRITY_CONFLICT', { field: key });
    }
    const identity = await tx.curriculumArtifactIdentity.findUnique({ where: { id: version.identityId } });
    if (!matches(identity, prepared.identity)) fail('IDENTITY_INTEGRITY_CONFLICT');
    return { version, identity };
  }
  async function persist(artifact, { generatedBy = null, selectCurrent = false } = {}) {
    const p = prepareArtifactStorage(artifact, { generatedBy });
    return transaction(async tx => {
      let identity = await tx.curriculumArtifactIdentity.findUnique({ where: { id: p.identity.id } });
      if (!identity) identity = await tx.curriculumArtifactIdentity.create({ data: p.identity });
      if (!matches(identity, p.identity)) fail('IDENTITY_INTEGRITY_CONFLICT');
      let version = await tx.curriculumArtifactVersion.findUnique({ where: { id: p.version.id } });
      const reused = Boolean(version);
      if (version) {
        // Original generating actor is immutable; replay caller does not replace it.
        await checked(tx, version.id);
        if (!equal(version.snapshot, p.version.snapshot)) fail('VERSION_INTEGRITY_CONFLICT');
      } else {
        const data = { ...p.version };
        if (data.authoritativeNodes === null) {
          if (dbNull === undefined) fail('DB_NULL_ADAPTER_REQUIRED');
          data.authoritativeNodes = dbNull;
        }
        version = await tx.curriculumArtifactVersion.create({ data });
      }
      // New scopes remain unselected unless explicitly requested. Selection is not approval.
      if (selectCurrent) await tx.curriculumArtifactIdentity.update({ where: { id: identity.id }, data: { currentVersionId: version.id } });
      return { versionId: version.id, identityId: identity.id, reused, reviewStatus: version.reviewStatus, selectedCurrent: selectCurrent };
    });
  }
  async function review(id, toStatus, { expectedRevision, reviewerReference = null, notes = null } = {}) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail('EXPECTED_REVISION_REQUIRED');
    if (['APPROVED', 'REJECTED'].includes(toStatus) && (typeof reviewerReference !== 'string' || !reviewerReference.trim())) fail('REVIEWER_REQUIRED');
    return transaction(async tx => {
      await lock(tx, id);
      const { version } = await checked(tx, id);
      if (version.reviewRevision !== expectedRevision) fail('STALE_REVIEW');
      const transition = prepareReviewTransition(version, toStatus, { reviewerReference, notes, reviewedAt: now() });
      const updated = await tx.curriculumArtifactVersion.updateMany({ where: transition.expected, data: transition.update });
      if (updated.count !== 1) fail('STALE_REVIEW');
      const event = await tx.curriculumArtifactReview.create({ data: transition.event });
      return { versionId: id, ...transition.update, event };
    });
  }
  async function planInTransaction(tx, id) {
    const result = { versionId: id, allowed: false, conflicts: [], nodesToCreate: [], nodesMatching: [], nodeMapping: {}, importHistory: [] };
    let stored;
    try { stored = await checked(tx, id); } catch (error) {
      if (error.code === 'VERSION_NOT_FOUND') { result.conflicts.push(error.code); return result; }
      throw error;
    }
    const { version, identity } = stored, a = version.snapshot;
    result.identity = identity; result.reviewStatus = version.reviewStatus; result.reviewRevision = version.reviewRevision;
    result.provenance = { artifactChecksum: version.artifactChecksum, sourceFingerprint: version.sourceFingerprint, contentFingerprint: version.contentFingerprint };
    if (version.reviewStatus !== 'APPROVED') result.conflicts.push('NOT_APPROVED');
    if (version.authorityVersion !== 2 || !version.authoritativeNodes) result.conflicts.push('AUTHORITY_V2_REQUIRED');
    result.book = { id: a.book_id, board: a.board, grade: String(a.grade), subject: a.subject, title: a.book, edition: a.edition || null };
    result.chapter = { id: a.chapter_id, bookId: a.book_id, chapterNumber: a.chapter_number, title: a.chapter, learningObjectives: a.learning_objectives };
    const content = new Map((version.authoritativeNodes || []).map(n => [n.id, n.content]));
    result.nodes = orderedNodes(a.nodes).map(n => ({ id: n.id, chapterId: a.chapter_id, parentId: n.parent_id || null, title: n.title, type: n.type, description: n.description || null, content: content.get(n.id), orderIndex: n.order }));
    result.nodeMapping = Object.fromEntries(result.nodes.map(n => [n.id, n.id]));
    const books = await tx.curriculumBook.findMany({ where: { OR: [{ id: a.book_id }, { board: a.board, grade: String(a.grade), subject: a.subject, title: a.book }] } });
    if (books.some(b => !matches(b, result.book))) result.conflicts.push('BOOK_IDENTITY_OR_EDITION_CONFLICT');
    result.createBook = books.length === 0;
    const chapters = await tx.curriculumChapter.findMany({ where: { OR: [{ id: a.chapter_id }, { bookId: a.book_id, chapterNumber: a.chapter_number }] } });
    if (chapters.some(c => !matches(c, result.chapter))) result.conflicts.push('CHAPTER_CONFLICT');
    result.createChapter = chapters.length === 0;
    const history = await tx.curriculumArtifactImport.findMany({ where: { OR: [{ chapterId: a.chapter_id }, { versionId: id }] } });
    history.sort((a, b) => { const x = `${a.versionId}\0${a.chapterId}`, y = `${b.versionId}\0${b.chapterId}`; return x < y ? -1 : x > y ? 1 : 0; });
    result.importHistory = history;
    if (history.some(h => h.versionId !== id || h.chapterId !== a.chapter_id)) result.conflicts.push('DIFFERENT_VERSION_OR_TARGET_IMPORT');
    const existingImport = history.find(h => h.versionId === id && h.chapterId === a.chapter_id);
    // Exact-looking legacy content is not proof of artifact provenance. Never adopt it implicitly.
    if (chapters.length && !existingImport) result.conflicts.push('LEGACY_CHAPTER_REQUIRES_SEPARATE_RECONCILIATION');
    if (existingImport && !equal(existingImport.nodeMapping, result.nodeMapping)) result.conflicts.push('IMPORT_MAPPING_CONFLICT');
    const existing = await tx.curriculumNode.findMany({ where: { OR: [{ chapterId: a.chapter_id }, { id: { in: result.nodes.map(n => n.id) } }] } });
    const expected = new Map(result.nodes.map(n => [n.id, n]));
    for (const node of existing) if (!expected.has(node.id) || !matches(node, expected.get(node.id))) result.conflicts.push('NODE_CONFLICT');
    const byId = new Map(existing.map(n => [n.id, n]));
    for (const node of result.nodes) {
      if (matches(byId.get(node.id), node)) result.nodesMatching.push(node.id);
      else if (!byId.has(node.id)) result.nodesToCreate.push(node);
    }
    if (existingImport && (result.createBook || result.createChapter || result.nodesToCreate.length)) result.conflicts.push('IMPORTED_STATE_DRIFT');
    result.alreadyImported = Boolean(existingImport);
    result.conflicts = [...new Set(result.conflicts)].sort();
    result.allowed = result.conflicts.length === 0;
    return result;
  }
  const dryRun = id => transaction(tx => planInTransaction(tx, id), true);
  async function importVersion(id, { importedBy = null } = {}) {
    if (importedBy !== null && (typeof importedBy !== 'string' || !importedBy.trim())) fail('INVALID_IMPORT_ACTOR');
    return transaction(async tx => {
      await lock(tx, id); // Same lock as review: cannot race a supersession decision.
      const plan = await planInTransaction(tx, id);
      if (!plan.allowed) fail('IMPORT_BLOCKED', { conflicts: plan.conflicts });
      if (plan.alreadyImported) return { versionId: id, chapterId: plan.chapter.id, reused: true, nodeMapping: plan.nodeMapping };
      if (plan.createBook) await tx.curriculumBook.create({ data: plan.book });
      if (plan.createChapter) await tx.curriculumChapter.create({ data: plan.chapter });
      for (const node of plan.nodesToCreate) await tx.curriculumNode.create({ data: node });
      // Verify full rows, not just counts, before recording success or committing.
      const book = await tx.curriculumBook.findUnique({ where: { id: plan.book.id } });
      const chapter = await tx.curriculumChapter.findUnique({ where: { id: plan.chapter.id } });
      const nodes = await tx.curriculumNode.findMany({ where: { chapterId: plan.chapter.id } });
      if (!matches(book, plan.book) || !matches(chapter, plan.chapter) || nodes.length !== plan.nodes.length || plan.nodes.some(n => !matches(nodes.find(row => row.id === n.id), n))) fail('MATERIALIZATION_VERIFICATION_FAILED');
      await tx.curriculumArtifactImport.create({ data: { versionId: id, chapterId: plan.chapter.id, importedBy, importedAt: now(), importerFingerprint: IMPORTER_FINGERPRINT, nodeMapping: plan.nodeMapping } });
      return { versionId: id, chapterId: plan.chapter.id, reused: false, nodeMapping: plan.nodeMapping };
    });
  }
  async function gameGroundingInTransaction(tx, versionId, nodeId) {
    if (versionId === null || versionId === undefined) return { historical: true, versionId: null };
    await lock(tx, versionId);
    const plan = await planInTransaction(tx, versionId);
    if (!plan.allowed || !plan.alreadyImported) fail('GAME_GROUNDING_BLOCKED');
    if (!Object.values(plan.nodeMapping).includes(nodeId)) fail('GAME_NODE_OUTSIDE_MAPPING');
    return { historical: false, versionId, chapterId: plan.chapter.id, curriculumNodeId: nodeId };
  }
  return { persist, review, dryRun, importVersion,
    inspect: id => transaction(async tx => { const stored = await checked(tx, id); return { ...stored, reviews: await tx.curriculumArtifactReview.findMany({ where: { versionId: id }, orderBy: { revision: 'asc' } }) }; }, true),
    validateGameGrounding: (id, nodeId) => transaction(tx => gameGroundingInTransaction(tx, id, nodeId)),
    // Future writers MUST call this inside the same serializable transaction as GameSpec.create.
    gameGroundingInTransaction };
}
module.exports = { createArtifactService, ArtifactServiceError, IMPORTER_FINGERPRINT };

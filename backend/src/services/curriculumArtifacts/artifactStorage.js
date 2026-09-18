// Pure storage preparation. No Prisma client, environment loading, I/O or importer.
const { fingerprint, contentFingerprint } = require('../curriculumIngestion/curriculumIdentity');
const { validateCurriculum } = require('../curriculumIngestion/curriculumValidator');
const { renderMaterials } = require('../curriculumIngestion/sourceFidelity');

const REVIEW_STATES = Object.freeze(['UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED']);
const TRANSITIONS = Object.freeze({
  UNREVIEWED: ['IN_REVIEW', 'REJECTED', 'SUPERSEDED'],
  IN_REVIEW: ['APPROVED', 'REJECTED', 'SUPERSEDED'],
  APPROVED: ['SUPERSEDED'], REJECTED: ['IN_REVIEW', 'SUPERSEDED'], SUPERSEDED: []
});
function fail(message) {
  const error = new Error(message);
  error.code = 'CURRICULUM_ARTIFACT_INVALID';
  throw error;
}
function optionalString(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim()) fail(`Invalid ${field}.`);
  return value;
}
function checksum(value, field) {
  const result = optionalString(value, field);
  if (result !== null && !/^[a-f0-9]{64}$/.test(result)) fail(`Invalid ${field}.`);
  return result;
}
function jsonClone(value) {
  // This boundary accepts parsed JSON only. Never silently drop non-JSON fields.
  function check(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) return item.forEach(check);
    if (item && Object.getPrototypeOf(item) === Object.prototype) return Object.values(item).forEach(check);
    fail('Artifact must contain only JSON values.');
  }
  try { check(value); return JSON.parse(JSON.stringify(value)); }
  catch (error) { if (error.code === 'CURRICULUM_ARTIFACT_INVALID') throw error; fail('Artifact must be finite JSON.'); }
}
function prepareArtifactStorage(input, { generatedBy = null } = {}) {
  const snapshot = jsonClone(input);
  const validation = validateCurriculum(snapshot);
  if (!validation.valid) fail(`Artifact validation failed: ${validation.errors.join('; ')}`);
  const a = snapshot, m = a._ingestion ?? {};
  if (typeof m !== 'object' || Array.isArray(m)) fail('Invalid ingestion metadata.');
  const edition = a.edition ?? '';
  if (typeof edition !== 'string') fail('Invalid edition.');
  // No titles, chapter number, generation timestamp or normalization in identity.
  // Empty edition is an explicitly unspecified edition, not a guessed edition.
  const scope = { board: a.board, grade: String(a.grade), subject: a.subject,
    bookKey: a.book_id, editionKey: edition, chapterKey: a.chapter_id };
  const identity = { id: `artifact-scope-v1-${fingerprint(scope)}`, ...scope };
  if (m.identity) {
    const expected = { board: a.board, grade: String(a.grade), subject: a.subject,
      bookId: a.book_id, book: a.book, edition, chapterId: a.chapter_id, chapterNumber: a.chapter_number };
    if (fingerprint(expected) !== fingerprint(m.identity)) fail('Ingestion identity disagrees with artifact.');
  }
  const contentHash = contentFingerprint(a);
  if (m.contentFingerprint !== undefined && m.contentFingerprint !== contentHash) fail('Content fingerprint mismatch.');
  const artifactChecksum = fingerprint(a); // Canonical parsed JSON, not raw file bytes.
  const modern = a.source_context?.authorityVersion === 2;
  let generatedAt = null;
  if (m.generatedAt !== undefined) {
    if (typeof m.generatedAt !== 'string' || !Number.isFinite(Date.parse(m.generatedAt))) fail('Invalid generatedAt.');
    generatedAt = new Date(m.generatedAt);
  }
  return { identity, version: {
    id: `artifact-v1-${artifactChecksum}`, identityId: identity.id, artifactChecksum,
    sourceFingerprint: checksum(m.sourceFingerprint, 'sourceFingerprint'), contentFingerprint: contentHash,
    configurationFingerprint: checksum(m.configurationFingerprint, 'configurationFingerprint'),
    implementationFingerprint: checksum(m.implementationFingerprint, 'implementationFingerprint'),
    model: optionalString(m.model, 'model'), generatedAt, generatedBy: optionalString(generatedBy, 'generatedBy'),
    authorityVersion: a.source_context?.authorityVersion ?? null,
    snapshot,
    authoritativeNodes: modern ? a.nodes.map(node => ({ id: node.id, parentId: node.parent_id || null,
      orderIndex: node.order, content: renderMaterials(node.materials) })) : null,
    sourceProvenance: { registry: a.source_context ?? null, sources: m.sources ?? null },
    objectives: a.learning_objectives.map((text, index) => ({ text, evidence: a.objective_evidence?.[index] ?? null })),
    // Never trust a file's claimed approval. Snapshot preserves that original claim.
    reviewStatus: 'UNREVIEWED', reviewRevision: 0
  }, validation };
}
function prepareReviewTransition(version, toStatus, { reviewerReference = null, notes = null, reviewedAt } = {}) {
  if (!TRANSITIONS[version.reviewStatus]?.includes(toStatus)) fail('Invalid review transition.');
  if (!Number.isSafeInteger(version.reviewRevision) || version.reviewRevision < 0) fail('Invalid review revision.');
  if (!(reviewedAt instanceof Date) || !Number.isFinite(reviewedAt.getTime())) fail('Explicit reviewedAt required.');
  reviewerReference = optionalString(reviewerReference, 'reviewerReference');
  if (toStatus === 'APPROVED' && (!reviewerReference || version.authorityVersion !== 2 || !version.authoritativeNodes)) {
    fail('Approval requires an identified reviewer and authority-v2 projection.');
  }
  return { expected: { id: version.id, reviewStatus: version.reviewStatus, reviewRevision: version.reviewRevision },
    update: { reviewStatus: toStatus, reviewRevision: version.reviewRevision + 1 },
    event: { versionId: version.id, revision: version.reviewRevision + 1, fromStatus: version.reviewStatus,
      toStatus, reviewerReference, reviewedAt, notes: optionalString(notes, 'notes') } };
}
function compareVersions(left, right) {
  const sameIdentity = left.identityId === right.identityId;
  return { sameIdentity, sameArtifact: sameIdentity && left.artifactChecksum === right.artifactChecksum,
    sameContent: sameIdentity && left.contentFingerprint === right.contentFingerprint,
    sameSource: sameIdentity && left.sourceFingerprint !== null && left.sourceFingerprint === right.sourceFingerprint };
}
module.exports = { REVIEW_STATES, prepareArtifactStorage, prepareReviewTransition, compareVersions };

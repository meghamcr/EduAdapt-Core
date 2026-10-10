const { isDeepStrictEqual: equal } = require('node:util');
const { curriculum } = require('../../curriculumIngestion/fixtures/helpers');
const { contentFingerprint } = require('../../../src/services/curriculumIngestion/curriculumIdentity');
const { renderMaterials } = require('../../../src/services/curriculumIngestion/sourceFidelity');
function artifact() {
  const a = curriculum();
  const refs = [{ sourceId: 'synthetic-source', page: 1 }];
  a.source_context = { version: 1, authorityVersion: 2, mode: 'pdf', documents: [{ sourceId: 'synthetic-source', sha256: 'a'.repeat(64), pages: [1] }] };
  a.objective_evidence = [refs];
  for (const n of a.nodes) {
    n.materials = [{ authority: 'EXPLICIT_SOURCE_CONTENT', evidence_kind: 'SOURCE_TEXT', role: 'explanation', text: n.content, source_refs: refs, student_completion: false, review_required: false, visual: { status: 'NOT_APPLICABLE', description: '', authority: 'MODEL_VISUAL_INTERPRETATION', review_required: true } }];
    n.source_synthesis = []; n.review_inferences = []; n.content = renderMaterials(n.materials);
  }
  a._ingestion = { model: 'synthetic-model', reviewStatus: 'UNREVIEWED', generatedAt: '2026-01-01T00:00:00Z', sourceFingerprint: 'b'.repeat(64), sources: [{ pdfPath: 'synthetic.pdf', sha256: 'a'.repeat(64), selectedPages: [1] }] };
  return rehash(a);
}
function rehash(a) { a._ingestion.contentFingerprint = contentFingerprint(a); return a; }
const { database } = require('../../../src/development/inMemoryStore');
module.exports = { artifact, rehash, database };

const { createArtifactService, ArtifactServiceError } = require('../curriculumArtifacts/artifactService');
const issuedContexts = new WeakSet();
function requireGenerationContext(context) {
  if (!issuedContexts.has(context)) invalid('ISSUED_GENERATION_CONTEXT_REQUIRED');
}

function invalid(code) { throw new ArtifactServiceError(code); }
function validateSelection(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) invalid('GENERATION_SELECTION_REQUIRED');
  const keys = ['curriculumArtifactVersionId', 'curriculumNodeId'];
  if (Object.keys(selection).some(key => !keys.includes(key))) invalid('UNSUPPORTED_GENERATION_INPUT');
  for (const key of keys) {
    if (!Object.hasOwn(selection, key) || typeof selection[key] !== 'string' || !selection[key].trim() || selection[key] !== selection[key].trim()) {
      invalid(key === keys[0] ? 'ARTIFACT_VERSION_ID_REQUIRED' : 'CURRICULUM_NODE_ID_REQUIRED');
    }
  }
}
const sourceRefs = refs => refs.map(ref => ({ sourceId: ref.sourceId, page: ref.page }));
function detachedFrozen(value) {
  const copy = structuredClone(value), pending = [copy];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== 'object' || Object.isFrozen(item)) continue;
    pending.push(...Object.values(item));
    Object.freeze(item);
  }
  return copy;
}

// Inject a trusted Prisma-compatible client. No environment loading or client creation.
// This is the only public constructor; there is no node-only or raw-JSON bypass.
function createGenerationContextService(db) {
  const artifacts = createArtifactService(db);
  async function buildInTransaction(tx, selection) {
    validateSelection(selection); // Reject null BEFORE the historical compatibility helper.
    const { curriculumArtifactVersionId: versionId, curriculumNodeId: mappedNodeId } = selection;
      // Reuse all Phase 2C integrity, approval, import, mapping and drift checks.
      // This performs a parameterized SELECT FOR UPDATE, not a data write.
      const grounded = await artifacts.gameGroundingInTransaction(tx, versionId, mappedNodeId);
      const version = await tx.curriculumArtifactVersion.findUnique({ where: { id: versionId } });
      const imports = await tx.curriculumArtifactImport.findMany({ where: { versionId, chapterId: grounded.chapterId } });
      if (imports.length !== 1) invalid('GENERATION_IMPORT_MAPPING_INVALID');
      const sourceIds = Object.keys(imports[0].nodeMapping).filter(id => imports[0].nodeMapping[id] === mappedNodeId);
      if (sourceIds.length !== 1) invalid('GENERATION_IMPORT_MAPPING_INVALID');
      const nodeId = sourceIds[0], snapshot = version.snapshot;
      const nodes = new Map(snapshot.nodes.map(node => [node.id, node]));
      const selected = nodes.get(nodeId);
      const projection = version.authoritativeNodes.find(node => node.id === nodeId);
      if (!selected || !projection) invalid('GENERATION_NODE_INVALID');
      const hierarchyPath = [], visited = new Set();
      let cursor = selected;
      while (cursor) {
        if (visited.has(cursor.id)) invalid('GENERATION_HIERARCHY_INVALID');
        visited.add(cursor.id);
        hierarchyPath.push({ nodeId: cursor.id, title: cursor.title, type: cursor.type, orderIndex: cursor.order });
        if (!cursor.parent_id) break;
        cursor = nodes.get(cursor.parent_id);
        if (!cursor) invalid('GENERATION_HIERARCHY_INVALID');
      }
      hierarchyPath.reverse();
      const context = detachedFrozen({
        contextVersion: 1,
        curriculum: {
          artifactVersionId: version.id, nodeId, mappedNodeId,
          board: snapshot.board, grade: String(snapshot.grade), subject: snapshot.subject,
          book: { id: snapshot.book_id, title: snapshot.book }, edition: snapshot.edition ?? null,
          chapter: { id: snapshot.chapter_id, mappedChapterId: grounded.chapterId, number: snapshot.chapter_number, title: snapshot.chapter },
          hierarchyPath,
          // Chapter objectives are context, NOT a claim of selected-node applicability.
          objectiveScope: 'CHAPTER',
          learningObjectives: snapshot.learning_objectives.map((text, index) => ({ index, text, sourceRefs: sourceRefs(snapshot.objective_evidence[index]) })),
          authoritativeContent: projection.content,
          materials: selected.materials.map(item => ({
            authority: 'EXPLICIT_SOURCE_CONTENT', evidenceKind: item.evidence_kind,
            role: item.role, text: item.text, sourceRefs: sourceRefs(item.source_refs),
            studentCompletion: item.student_completion,
            // Preserve dependency flags, never model-generated visual descriptions.
            visualDependency: item.visual.status
          }))
        },
        grounding: {
          reviewStatus: 'APPROVED', imported: true, artifactChecksum: version.artifactChecksum,
          sourceFingerprint: version.sourceFingerprint, contentFingerprint: version.contentFingerprint,
          sourceRegistry: snapshot.source_context.documents.map(doc => ({ sourceId: doc.sourceId, sha256: doc.sha256, pages: doc.pages }))
        },
        constraints: {
          academicScopeLocked: true, allowAcademicInference: false,
          contentScope: 'SELECTED_NODE_ONLY', hierarchyIsNavigationOnly: true,
          chapterObjectivesImplyNodeApplicability: false, allowPrerequisiteInference: false,
          preserveUnansweredTasks: true
        }
      });
      issuedContexts.add(context);
      return context;
  }
  async function build(selection) {
    validateSelection(selection);
    return db.$transaction(tx => buildInTransaction(tx, selection), { isolationLevel: 'Serializable', timeout: 30000 });
  }
  // Persistence supplies its own serializable transaction, sharing the exact
  // Phase 3B projection and Phase 2C authority checks with ordinary builds.
  return Object.freeze({ build, buildInTransaction });
}
module.exports = { createGenerationContextService, requireGenerationContext };

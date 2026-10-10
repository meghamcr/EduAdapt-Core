const { isDevelopmentVersion, sourceEvidenceFor } = require('../../development/developmentWorkspace');
'use strict';
const { buildChapterLevels, levelCurriculumPackage } = require('../curriculumLevels/levelCurriculum');
const { createGenerationContextService } = require('../gameGeneration/generationContext');
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const { fields, id } = require('../gameplay/gameplayEvents');
const issued = new WeakSet();
const fail = code => { throw Object.assign(new Error(code), { code }); };
function requireLevelContext(context) { if (!issued.has(context)) fail('ISSUED_LEVEL_CONTEXT_REQUIRED'); }

// Builds from the immutable server snapshot, never a client-uploaded level or
// local development package. Existing approval/import/drift checks stay in force.
function createLevelContextService(db) {
  const contexts = createGenerationContextService(db);
  async function load(tx, versionId) {
    const version = await tx.curriculumArtifactVersion.findUnique({ where: { id: versionId } });
    if (!version || (version.reviewStatus !== 'APPROVED' && !isDevelopmentVersion(tx, version))) fail('APPROVED_CURRICULUM_REQUIRED');
    const imports = await tx.curriculumArtifactImport.findMany({ where: { versionId } });
    if (imports.length !== 1) fail('IMPORTED_CURRICULUM_REQUIRED');
    const mapping = imports[0].nodeMapping;
    const chapter = buildChapterLevels(version.snapshot, {sourceEvidence:sourceEvidenceFor(tx, version)});
    if (chapter.artifactVersionId !== versionId || chapter.artifactChecksum !== version.artifactChecksum) fail('LEVEL_VERSION_MISMATCH');
    return { chapter, mapping, sourceReviewStatus:version.reviewStatus };
  }
  async function list(versionId) {
    id(versionId);
    return db.$transaction(async tx => {
      const { chapter, mapping, sourceReviewStatus } = await load(tx, versionId);
      const first = Object.values(mapping)[0];
      await contexts.buildInTransaction(tx, { curriculumArtifactVersionId: versionId, curriculumNodeId: first });
      return freeze({ artifactVersionId: versionId, sourceReviewStatus, levelReviewStatus: 'UNREVIEWED',
        levels: chapter.levels.map(l => ({ levelId: l.levelId, sequence: l.sequence, title: l.title, sourceSpan: l.sourceSpan })),
        warnings: chapter.reviewWarnings });
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }
  async function build(selection) {
    fields(selection, ['curriculumArtifactVersionId', 'levelId']);
    const versionId = id(selection.curriculumArtifactVersionId), levelId = id(selection.levelId);
    return db.$transaction(async tx => {
      const { chapter, mapping, sourceReviewStatus } = await load(tx, versionId);
      const packaged = levelCurriculumPackage(chapter, levelId);
      const nodeIds = [...new Set(packaged.level.learnerMaterialRefs.map(ref => packaged.materials[ref].nodeId))].sort();
      if (!nodeIds.length) fail('NO_LEARNER_MATERIAL');
      const selected = {};
      for (const nodeId of nodeIds) selected[nodeId] = await contexts.buildInTransaction(tx, {
        curriculumArtifactVersionId: versionId, curriculumNodeId: mapping[nodeId]
      });
      const result = freeze({ packaged, contexts: selected, sourceReviewStatus });
      issued.add(result); return result;
    }, { isolationLevel: 'Serializable', timeout: 30000 });
  }
  return Object.freeze({ list, build });
}
module.exports = { createLevelContextService, requireLevelContext };

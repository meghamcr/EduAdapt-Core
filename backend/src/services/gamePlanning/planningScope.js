'use strict';
const { isDeepStrictEqual: equal } = require('node:util');
const { fingerprint } = require('../curriculumIngestion/curriculumIdentity');
const { buildChapterLevels } = require('../curriculumLevels/levelCurriculum');
const { copyJson } = require('../gameGeneration/gameValidation');
const { VERSION, CAPABILITIES } = require('./plannerContract');
const fail = () => { throw new Error('PLANNING_SCOPE_INVALID'); };
function validatePlanningScope(context, input) {
  const scope = copyJson(input, 32000), c = context.curriculum;
  const keys = ['version', 'capabilitiesVersion', 'artifactVersionId', 'artifactChecksum', 'levelId', 'sequenceFingerprint', 'language', 'mechanic', 'purpose', 'nodeId', 'materialRefs', 'materialIndexes', ...(scope.mechanic === 'CONSTRUCTION' ? ['construction'] : [])];
  if (Object.keys(scope).length !== keys.length || keys.some(k => !Object.hasOwn(scope, k)) ||
      scope.version !== VERSION || scope.capabilitiesVersion !== CAPABILITIES.version ||
      scope.artifactVersionId !== c.artifactVersionId || scope.artifactChecksum !== context.grounding.artifactChecksum ||
      scope.nodeId !== c.nodeId || !CAPABILITIES.languages.includes(scope.language) ||
      !CAPABILITIES.supported.some(cap => cap.mechanic === scope.mechanic && cap.purposes.includes(scope.purpose)) ||
      !/^level-v1-[a-f0-9]{64}$/.test(scope.levelId) || !/^[a-f0-9]{64}$/.test(scope.sequenceFingerprint) ||
      !Array.isArray(scope.materialIndexes) || !scope.materialIndexes.length || scope.materialIndexes.length > 16 ||
      new Set(scope.materialIndexes).size !== scope.materialIndexes.length ||
      scope.materialIndexes.some(i => !Number.isSafeInteger(i) || !c.materials[i]) ||
      !equal(scope.materialRefs, scope.materialIndexes.map(i => `material-v1-${fingerprint([c.artifactVersionId, c.nodeId, i])}`))) fail();
  if(scope.mechanic==='CONSTRUCTION'){
    const material=c.materials[scope.materialIndexes[0]];
    if(scope.materialIndexes.length!==1 || !require('../educationalVisuals/construction').validateVisual(scope.construction,{...material,materialRef:scope.materialRefs[0]}).valid) fail();
  }
  return scope;
}
function validateScopeAgainstArtifact(snapshot, scope, sourceEvidence) {
  const chapter = buildChapterLevels(snapshot, {sourceEvidence}), level = chapter.levels.find(l => l.levelId === scope.levelId);
  if (!level || chapter.artifactVersionId !== scope.artifactVersionId || chapter.artifactChecksum !== scope.artifactChecksum ||
      chapter.sequenceFingerprint !== scope.sequenceFingerprint || scope.materialRefs.some(ref => !level.learnerMaterialRefs.includes(ref))) fail();
}
module.exports = { validatePlanningScope, validateScopeAgainstArtifact };

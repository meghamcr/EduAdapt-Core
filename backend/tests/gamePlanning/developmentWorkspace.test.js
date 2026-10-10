'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const {artifact, database} = require('../curriculumArtifacts/fixtures/serviceFixture');
const {createDevelopmentWorkspace, isDevelopmentContext} = require('../../src/development/developmentWorkspace');
const {createArtifactService} = require('../../src/services/curriculumArtifacts/artifactService');
const {createLevelContextService} = require('../../src/services/gamePlanning/levelContext');
const {buildChapterLevels} = require('../../src/services/curriculumLevels/levelCurriculum');
const {decideAdaptiveLearning} = require('../../src/services/adaptiveLearning/adaptiveDecision');
const {normalizeLearnerState} = require('../../src/services/adaptiveLearning/learnerStateProvider');
const {normalizePrerequisites} = require('../../src/services/adaptiveLearning/prerequisitePolicy');
function entry() {
  const a = artifact(), units = [], materials = [];
  for (const n of a.nodes) n.materials.forEach((m,i) => {
    const line = units.length+1, id = `synthetic-source:p1:l${line}`;
    units.push({id,sourceId:'synthetic-source',page:1,line,text:m.text});
    materials.push({nodeId:n.id,materialIndex:i,unitIds:[id]});
  });
  const sourceEvidence = {documents:a.source_context.documents.map(({sourceId,sha256})=>({sourceId,sha256})),units,materials};
  return {artifact:a,sourceEvidence,package:buildChapterLevels(a,{sourceEvidence})};
}
test('isolated development preserves UNREVIEWED source and exact saved level identity without review records', async () => {
  const e=entry(), before=structuredClone(e);
  const w=await createDevelopmentWorkspace({authorization:'LOCAL_UNREVIEWED_CURRICULUM',entries:[e]});
  assert.deepEqual(e,before); assert.deepEqual(w.chapters[0],e.package);
  assert.equal(w.db.state.curriculumArtifactReview.length,0);
  assert.ok(w.db.state.curriculumArtifactVersion.every(v=>v.reviewStatus==='UNREVIEWED' && v.snapshot._ingestion.reviewStatus==='UNREVIEWED'));
  const service=createLevelContextService(w.db), chapter=w.chapters[0];
  const c=await service.build({curriculumArtifactVersionId:chapter.artifactVersionId,levelId:chapter.levels[0].levelId});
  assert.equal(c.sourceReviewStatus,'UNREVIEWED');
  for(const context of Object.values(c.contexts)) {
    assert.equal(isDevelopmentContext(context),true); assert.equal(isDevelopmentContext(structuredClone(context)),false);
    const scope={learnerId:'local-learner',artifactVersionId:context.curriculum.artifactVersionId,nodeId:context.curriculum.nodeId};
    const decision=decideAdaptiveLearning({context,learnerState:normalizeLearnerState(scope),prerequisites:normalizePrerequisites({...scope,requirements:[]})});
    assert.equal(decision.instructionalDecision.difficulty,'EASY');
  }
  await assert.rejects(createArtifactService(w.db).review(chapter.artifactVersionId,'IN_REVIEW',{expectedRevision:0}),{code:'DEVELOPMENT_REVIEW_FORBIDDEN'});
});
test('copied development rows cannot authorize a production adapter', async () => {
  const w=await createDevelopmentWorkspace({authorization:'LOCAL_UNREVIEWED_CURRICULUM',entries:[entry()]});
  const ordinary=database({includeGameplay:true}); ordinary.state=structuredClone(w.db.state);
  await assert.rejects(createLevelContextService(ordinary).list(w.chapters[0].artifactVersionId),{code:'APPROVED_CURRICULUM_REQUIRED'});
  assert.equal((await createArtifactService(ordinary).dryRun(w.chapters[0].artifactVersionId)).allowed,false);
});
test('development requires explicit authorization and exact saved package and source lines', async () => {
  await assert.rejects(createDevelopmentWorkspace({entries:[entry()]}),/EXPLICIT_DEVELOPMENT/);
  const e=structuredClone(entry()); e.package.levels[0].title='Changed';
  await assert.rejects(createDevelopmentWorkspace({authorization:'LOCAL_UNREVIEWED_CURRICULUM',entries:[e]}),/SAVED_LEVEL_PACKAGE_MISMATCH/);
  const altered=entry(); altered.sourceEvidence.units[0].text+=' invented';
  await assert.rejects(createDevelopmentWorkspace({authorization:'LOCAL_UNREVIEWED_CURRICULUM',entries:[altered]}),/SOURCE_RECONSTRUCTION_MISMATCH/);
});
test('development authority expires on status or artifact drift', async () => {
  const w=await createDevelopmentWorkspace({authorization:'LOCAL_UNREVIEWED_CURRICULUM',entries:[entry()]});
  w.db.state.curriculumArtifactVersion[0].snapshot.nodes[0].title='Drift';
  await assert.rejects(createLevelContextService(w.db).list(w.chapters[0].artifactVersionId),{code:'APPROVED_CURRICULUM_REQUIRED'});
});

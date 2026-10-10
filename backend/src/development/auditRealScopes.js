'use strict';
// Read-only curriculum inspection plus local report output. Never calls a provider.
const fs=require('node:fs/promises'),path=require('node:path');
const {loadManifest}=require('./localRuntime');
const {createDevelopmentWorkspace}=require('./developmentWorkspace');
const {createLevelContextService}=require('../services/gamePlanning/levelContext');
const {buildPlanningRequest,validatePlan}=require('../services/gamePlanning/gamePlanner');
const {normalizeLearnerState}=require('../services/adaptiveLearning/learnerStateProvider');
const {normalizePrerequisites}=require('../services/adaptiveLearning/prerequisitePolicy');
const {decideAdaptiveLearning}=require('../services/adaptiveLearning/adaptiveDecision');
const {fingerprint}=require('../services/curriculumIngestion/curriculumIdentity');
const {atomicJson}=require('../services/curriculumIngestion/ingestCurriculum');
async function auditRealScopes(manifestPath,cacheDirectory,outputPath) {
  const {config,entries}=await loadManifest(manifestPath);
  const workspace=await createDevelopmentWorkspace({authorization:config.authorization,entries});
  const service=createLevelContextService(workspace.db),cases=[];
  for(const [index,chapter] of workspace.chapters.entries())for(const sequence of config.artifacts[index].sequences){
    const level=chapter.levels.find(l=>l.sequence===sequence),levelContext=await service.build({curriculumArtifactVersionId:chapter.artifactVersionId,levelId:level.levelId});
    const decisions=Object.fromEntries(Object.entries(levelContext.contexts).map(([nodeId,context])=>{
      const scope={learnerId:'development-learner',artifactVersionId:chapter.artifactVersionId,nodeId};
      return [nodeId,decideAdaptiveLearning({context,learnerState:normalizeLearnerState(scope),prerequisites:normalizePrerequisites({...scope,requirements:[]})})];
    }));
    const request=buildPlanningRequest({levelContext,decisions,language:'en'});
    const cache=await fs.readFile(path.join(cacheDirectory,`plan-${fingerprint(request)}.json`),'utf8').then(JSON.parse).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    const validation=cache?.status==='RECEIVED'?validatePlan(cache.candidate,request):null;
    cases.push({chapter:chapter.chapterTitle,sequence,levelId:level.levelId,title:level.title,sourceReviewStatus:levelContext.sourceReviewStatus,
      scopeMatchesSavedPackage:true,materials:level.materialRefs.length,teacherOnly:level.materialRefs.filter(id=>chapter.materials[id].role==='teacher_note').length,
      eligibleRecallMaterials:request.materials.filter(m=>m.supportedForRecall).length,unresolvedVisualMaterials:request.materials.filter(m=>m.visualStatus!=='NOT_APPLICABLE').length,
      sourceUnitCount:level.materialRefs.reduce((n,id)=>n+chapter.materials[id].sourceUnits.length,0),
      aiPlanStatus:validation?.valid?'VALIDATED':cache?.status || 'NOT_ATTEMPTED',providerHttpStatus:cache?.httpStatus,
      plan:validation?.valid?JSON.parse(cache.candidate):null,validatedGameSpecs:0,playable:false,gameplayStatus:'NOT_EXECUTED',masteryClaim:false});
  }
  const report={usage:'DEVELOPMENT_ONLY',generatedAt:new Date().toISOString(),providerCalls:0,genuinelyPlayableLevels:0,cases,
    remainingLevels:workspace.chapters.flatMap(c=>c.levels.filter(l=>!cases.some(x=>x.levelId===l.levelId)).map(l=>({chapter:c.chapterTitle,sequence:l.sequence,title:l.title,status:'NOT_EXECUTED'})))};
  await atomicJson(outputPath,report);return report;
}
if(require.main===module)auditRealScopes(...process.argv.slice(2)).then(r=>console.log(JSON.stringify({genuinelyPlayableLevels:r.genuinelyPlayableLevels,cases:r.cases.map(({chapter,sequence,aiPlanStatus,providerHttpStatus})=>({chapter,sequence,aiPlanStatus,providerHttpStatus}))}))).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={auditRealScopes};

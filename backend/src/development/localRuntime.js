'use strict';
const fs=require('node:fs/promises'), path=require('node:path'), {randomBytes}=require('node:crypto');
const {createDevelopmentWorkspace}=require('./developmentWorkspace');
const {createRuntimeHttpServer}=require('../http/runtimeApi');
const {createProviderCache}=require('./providerCache');
const {fingerprint}=require('../services/curriculumIngestion/curriculumIdentity');
const {atomicJson}=require('../services/curriculumIngestion/ingestCurriculum');
async function loadManifest(file) {
  const config=JSON.parse(await fs.readFile(file)), base=path.dirname(path.resolve(file));
  const read=p=>fs.readFile(path.resolve(base,p),'utf8').then(JSON.parse);
  if(config.authorization!=='LOCAL_UNREVIEWED_CURRICULUM' || !Array.isArray(config.artifacts)) throw Error('INVALID_DEVELOPMENT_MANIFEST');
  const entries=await Promise.all(config.artifacts.map(async e=>({artifact:await read(e.artifactPath),sourceEvidence:await read(e.evidencePath),package:await read(e.packagePath)})));
  return {config,entries};
}
async function createLocalRuntime({manifestPath,cacheDirectory,maxCalls=0,plannerProvider,gameProvider,localProviders=false}) {
  const {config,entries}=await loadManifest(manifestPath);
  const workspace=await createDevelopmentWorkspace({authorization:config.authorization,entries});
  const {db,chapters}=workspace, token=randomBytes(32).toString('hex'), learnerId='development-learner';
  const cache=localProviders ? {plannerProvider,provider:gameProvider,calls:()=>0} : createProviderCache({directory:cacheDirectory,maxCalls,plannerProvider,gameProvider});
  const allowed=new Map(chapters.map(c=>[c.artifactVersionId,new Set(c.levels.map(l=>l.levelId))]));
  const server=createRuntimeHttpServer({db,
    resolveActor:async ({bearerToken})=>bearerToken===token ? {learnerId,role:'STUDENT'} : null,
    authorizeExecution:async ({learnerId:actor,gameSpecId,specificationChecksum})=>{
      const row=db.state.gameSpec.find(g=>g.id===gameSpecId);
      return actor===learnerId && row && allowed.has(row.curriculumArtifactVersionId) && fingerprint(row.spec.game)===specificationChecksum ? {reference:'ISOLATED_DEVELOPMENT_ONLY'} : null;
    },
    learning:{...cache,maxRepairs:0,
      authorizeLevel:async s=>s.learnerId===learnerId && allowed.has(s.curriculumArtifactVersionId) && (!s.levelId || allowed.get(s.curriculumArtifactVersionId).has(s.levelId)) ? {reference:'ISOLATED_DEVELOPMENT_ONLY'} : null,
      authorizeLearning:async s=>s.learnerId===learnerId && db.state.curriculumArtifactImport.some(i=>i.versionId===s.curriculumArtifactVersionId && Object.values(i.nodeMapping).includes(s.curriculumNodeId)),
      // No prerequisite relationships have been reviewed for these development scopes.
      // This isolates software execution; it does not establish production progression.
      loadPrerequisites:async()=>[]}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const endpoint=`http://127.0.0.1:${server.address().port}`;
  const scopes=config.artifacts.flatMap((entry,i)=>(entry.sequences || chapters[i].levels.map(l=>l.sequence)).map(sequence=>{
    const level=chapters[i].levels.find(l=>l.sequence===sequence); if(!level)throw Error('LEVEL_SEQUENCE_NOT_FOUND');
    return {endpoint,versionId:chapters[i].artifactVersionId,levelId:level.levelId,title:chapters[i].chapterTitle+' — '+level.title,sequence};
  }));
  return {server,db,token,endpoint,scopes,chapters,calls:cache.calls,close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
async function main() {
  const [manifestPath,outputDirectory,mode,callLimit='6']=process.argv.slice(2);
  if(!/^[0-6]$/.test(callLimit)) throw Error('INVALID_CALL_LIMIT');
  if(!manifestPath || !outputDirectory || !['offline','generate'].includes(mode)) throw Error('Usage: localRuntime.js manifest.json output-directory offline|generate');
  let plannerProvider,gameProvider;
  if(mode==='generate') {
    require('dotenv').config({path:path.resolve(__dirname,'../../.env'),quiet:true});
    plannerProvider=require('../services/gamePlanning/geminiPlannerProvider').createGeminiPlannerProvider();
    gameProvider=require('../services/gameGeneration/geminiGameProvider').createGeminiGameProvider();
  }
  const runtime=await createLocalRuntime({manifestPath,cacheDirectory:path.join(outputDirectory,'provider-cache'),maxCalls:mode==='generate'?Number(callLimit):0,plannerProvider,gameProvider});
  await atomicJson(path.join(outputDirectory,'connection.json'),{usage:'DEVELOPMENT_ONLY',token:runtime.token,endpoints:runtime.scopes});
  console.log(JSON.stringify({event:'LOCAL_RUNTIME_READY',endpoint:runtime.endpoint,scopes:runtime.scopes.length,usage:'DEVELOPMENT_ONLY'}));
  const post=async (route,body)=>{
    const r=await fetch(runtime.endpoint+route,{method:'POST',headers:{authorization:`Bearer ${runtime.token}`,'content-type':'application/json'},body:JSON.stringify(body)});
    return {httpStatus:r.status,body:await r.json()};
  };
  const results=[];
  for(const scope of runtime.scopes) {
    const plan=await post('/api/learning/plans',{curriculumArtifactVersionId:scope.versionId,levelId:scope.levelId,language:'en'});
    const row={...scope,plan};
    if(plan.httpStatus===200 && plan.body.games.length) row.launch=await post('/api/learning/launch',{planId:plan.body.planId,gameId:plan.body.games[0].id,creationKey:`initial-${fingerprint(scope).slice(0,24)}`,runtimeVersion:'eduadapt-runtime-v1'});
    results.push(row); await atomicJson(path.join(outputDirectory,'preparation.json'),{providerCalls:runtime.calls(),results});
    await atomicJson(path.join(outputDirectory,'game-storage.json'),runtime.db.state.gameSpec);
    await atomicJson(path.join(outputDirectory,'grounding-manifests.json'),runtime.db.state.gameSpec.map(row=>
      require('./groundingManifest').groundingManifest(row.spec,runtime.chapters.find(c=>c.artifactVersionId===row.curriculumArtifactVersionId))));
    console.log(JSON.stringify({event:'SCOPE_PREPARED',title:scope.title,planStatus:plan.httpStatus,plan:plan.body.status,launchStatus:row.launch?.httpStatus,providerCalls:runtime.calls()}));
  }
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>runtime.close().then(()=>process.exit(0)));
}
if(require.main===module)main().catch(()=>{console.error('LOCAL_RUNTIME_FAILED');process.exitCode=1;});
module.exports={createLocalRuntime,loadManifest};

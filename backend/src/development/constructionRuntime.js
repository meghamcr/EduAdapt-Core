'use strict';
// Explicit fixture runtime after a recorded provider failure. Never advertises AI
// generation or full level completion. Uses real UNREVIEWED materials in isolation.
const fs=require('node:fs/promises'),path=require('node:path');
const {createLocalRuntime,loadManifest}=require('./localRuntime');
const {compileGame}=require('../services/educationalVisuals/compileGame');
const {validateVisual}=require('../services/educationalVisuals/construction');
const {fingerprint}=require('../services/curriculumIngestion/curriculumIdentity');
const {atomicJson}=require('../services/curriculumIngestion/ingestCurriculum');
async function start(manifestPath,selectionPath,oldCache,output){
 const selection=JSON.parse(await fs.readFile(selectionPath)),{entries}=await loadManifest(manifestPath);
 const chapter=entries.map(e=>e.package).find(p=>p.artifactVersionId===selection.artifactVersionId),material=chapter.materials[selection.materialRef];
 let original;
 for(const f of await fs.readdir(oldCache))if(f.startsWith('plan-')){const row=JSON.parse(await fs.readFile(path.join(oldCache,f)));if(row.status==='RECEIVED'){const p=typeof row.candidate==='string'?JSON.parse(row.candidate):row.candidate;if(p.games.some(g=>g.materialRefs.some(r=>chapter.materials[r])))original=p;}}
 if(!original)throw Error('SAVED_PLAN_REQUIRED');
 let visual,origin;
 try{visual=JSON.parse(await fs.readFile(path.join(output,'visual-spec.json')));origin='AI_VISUAL_PLAN_DETERMINISTIC_COMPILER';}
 catch(e){if(e.code!=='ENOENT')throw e;origin='DEVELOPMENT_FIXTURE_NOT_AI_GENERATED';
 visual={version:'block-model-v1',origin:'GENERATED',originalExerciseResolved:false,materialRef:selection.materialRef,sourceText:material.text,columns:8,rows:7,
 pieces:[{id:'base',width:6,height:1,depth:1},{id:'left',width:3,height:1,depth:1},{id:'right',width:3,height:1,depth:1},{id:'top',width:4,height:1,depth:1}],
 target:[{id:'base',x:0,y:0,rotation:0},{id:'left',x:1,y:1,rotation:1},{id:'right',x:4,y:1,rotation:1},{id:'top',x:1,y:4,rotation:0}],assessment:'MATCH_GENERATED_REFERENCE'};
 await atomicJson(path.join(output,'development-fixture-visual.json'),{generationStatus:origin,spec:visual});}
 if(!validateVisual(visual,material).valid)throw Error('VISUAL_INVALID');
 const plannerProvider={planStructuredGame:async request=>{
 if(request.levelId!==selection.levelId)throw Error('PROVIDER_BLOCKED_NO_PLAN');
 const plan={...structuredClone(original),requestFingerprint:request.requestFingerprint};
 plan.games.unshift({id:'generated-construction',materialRefs:[visual.materialRef],mechanic:'CONSTRUCTION',purpose:'MATCH_GENERATED_REFERENCE',construction:visual});
 plan.deferred=plan.deferred.filter(d=>d.materialRef!==visual.materialRef);return plan;}};
 const runtime=await createLocalRuntime({manifestPath,cacheDirectory:path.join(output,'compiled-cache'),plannerProvider,gameProvider:{generateStructuredGame:async r=>compileGame(r)},localProviders:true});
 const persist=async()=>{
 await atomicJson(path.join(output,'game-storage.json'),runtime.db.state.gameSpec);
 await atomicJson(path.join(output,'session-storage.json'),{sessions:runtime.db.state.gameplayEvidenceSession,evidence:runtime.db.state.gameplayEvidenceEvent,mastery:runtime.db.state.curriculumNodeMastery});
 };
 await atomicJson(path.join(output,'connection.json'),{usage:'DEVELOPMENT_ONLY',generationStatus:origin,token:runtime.token,endpoints:runtime.scopes});
 await atomicJson(path.join(output,'runtime-status.json'),{generationStatus:origin,originalPlanFingerprint:fingerprint(original),visualFingerprint:fingerprint(visual),providerCalls:0,levelCompletion:false});
 console.log(JSON.stringify({status:'READY',endpoint:runtime.endpoint,generationStatus:origin}));
 const timer=setInterval(()=>persist().catch(()=>{}),2000);timer.unref();
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>persist().then(()=>runtime.close()).then(()=>process.exit(0)));
 return runtime;
}
if(require.main===module)start(...process.argv.slice(2)).catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
module.exports={start};

'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {atomicJson}=require('../services/curriculumIngestion/ingestCurriculum');
async function main(){
 const output=process.argv[2],connection=JSON.parse(await fs.readFile(path.join(output,'connection.json'))),scope=connection.endpoints[0];
 const post=async(route,body)=>{const response=await fetch(scope.endpoint+route,{method:'POST',headers:{authorization:'Bearer '+connection.token,'content-type':'application/json'},body:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error('HTTP_'+response.status+'_'+JSON.stringify(value));return value;};
 const plan=await post('/api/learning/plans',{curriculumArtifactVersionId:scope.versionId,levelId:scope.levelId,language:'en'});
 const launch={planId:plan.planId,gameId:plan.games.find(g=>g.mechanic==='CONSTRUCTION').id,creationKey:'construction-proof-'+randomUUID(),runtimeVersion:'eduadapt-runtime-v1'};
 const runtime=await post('/api/learning/launch',launch);
 const reused=await post('/api/learning/launch',launch);if(reused.sessionId!==runtime.sessionId)throw Error('REUSE_FAILED');
 const events=[];const send=async event=>{const payload={runtimeVersion:'eduadapt-runtime-v1',event:{eventId:randomUUID(),...event}};const result=await post('/api/runtime/sessions/'+runtime.sessionId+'/events',payload);events.push({event:payload.event,result});return result;};
 await send({type:'GAME_STARTED'});
 for(const phase of runtime.phases){await send({type:phase.type==='REMEDIATION'?'REMEDIATION_STARTED':'PHASE_STARTED',phaseId:phase.id});for(const c of runtime.challenges.filter(c=>c.phaseId===phase.id)){
 await send({type:'CHALLENGE_PRESENTED',challengeId:c.id});const wrong=structuredClone(c.construction.target);wrong[1].rotation=0;
 if((await send({type:'ANSWER_SUBMITTED',challengeId:c.id,response:wrong})).correctness!==false)throw Error('WRONG_ACCEPTED');
 const restored=await post('/api/runtime/sessions/'+runtime.sessionId+'/restore',{runtimeVersion:'eduadapt-runtime-v1'});
 if(JSON.stringify(restored.progress.placements)!==JSON.stringify(wrong))throw Error('RESTORE_LAYOUT_FAILED');
 if(c.hint)await send({type:'HINT_REQUESTED',challengeId:c.id});
 const answer=await send({type:'ANSWER_SUBMITTED',challengeId:c.id,response:c.construction.target});if(answer.correctness!==true)throw Error('CORRECT_REJECTED');
 const repeat=await post('/api/runtime/sessions/'+runtime.sessionId+'/events',{runtimeVersion:'eduadapt-runtime-v1',event:events.at(-1).event});if(repeat.sequence!==answer.sequence)throw Error('DUPLICATE_REPLAY_FAILED');
 }}
 const final=await send({type:'GAME_COMPLETED'});if(final.progress.status!=='COMPLETED')throw Error('NOT_COMPLETE');
 await atomicJson(path.join(output,'http-construction-proof.json'),{generationStatus:connection.generationStatus,proofType:'AUTOMATED_HTTP_NOT_HUMAN_GAMEPLAY',plan,runtime,events,completion:final.progress.status,fullLevelComplete:false});
 console.log(JSON.stringify({status:'PASS',events:events.length,completion:final.progress.status,fullLevelComplete:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});

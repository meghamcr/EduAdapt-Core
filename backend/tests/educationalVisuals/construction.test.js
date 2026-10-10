'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('../gamePlanning/fixtures/plannerFixture');
const {buildPlanningRequest,createGamePlanner,selectPlannedGame,validatePlan}=require('../../src/services/gamePlanning/gamePlanner');
const {createGameGenerator}=require('../../src/services/gameGeneration/gameGenerator');
const {compileGame}=require('../../src/services/educationalVisuals/compileGame');
const {validateVisual,scoreConstruction}=require('../../src/services/educationalVisuals/construction');
const {initialState,applyEvent}=require('../../src/services/gameplay/gameplayState');
const {parseEvent}=require('../../src/services/gameplay/gameplayEvents');
const {deriveMastery}=require('../../src/services/gameplay/learningEvidence');
function visual(m){return {version:'block-model-v1',origin:'GENERATED',originalExerciseResolved:false,materialRef:m.materialRef,sourceText:m.text,columns:8,rows:7,
 pieces:[{id:'base',width:6,height:1,depth:1},{id:'left',width:3,height:1,depth:1},{id:'right',width:3,height:1,depth:1},{id:'top',width:4,height:1,depth:1}],target:[{id:'base',x:0,y:0,rotation:0},{id:'left',x:1,y:1,rotation:1},{id:'right',x:4,y:1,rotation:1},{id:'top',x:1,y:4,rotation:0}],assessment:'MATCH_GENERATED_REFERENCE'};}
function planned(request){const m=request.materials.find(m=>m.role==='activity');return {planVersion:request.planVersion,requestFingerprint:request.requestFingerprint,status:'READY',games:[{id:'build',materialRefs:[m.materialRef],mechanic:'CONSTRUCTION',purpose:'MATCH_GENERATED_REFERENCE',construction:visual(m)}],deferred:request.materials.filter(n=>n!==m).map(n=>({materialRef:n.materialRef,reason:n.visualStatus!=='NOT_APPLICABLE'?'VISUAL_DEPENDENCY':n.studentCompletion?'UNANSWERED_TASK':'NOT_SELECTED',requiredCapability:'NONE'}))};}
test('geometry rejects overlap, floating blocks, missing pieces and unsupported provenance',()=>{
 const m={materialRef:'material_fixture',text:'Build a model using blocks.',sourceRefs:[{sourceId:'source',page:1}],role:'activity'},v=visual(m);
 assert.equal(validateVisual(v,m).valid,true);assert.equal(scoreConstruction(v,v.target),true);
 for(const mutate of [s=>s.target[1].x=0,s=>s.target[3].y=6,s=>s.target.pop(),s=>s.sourceText='invented',s=>s.originalExerciseResolved=true,s=>s.pieces[0].id=s.pieces[1].id,s=>s.pieces[0].width=0,s=>s.target[3].x=7]){const bad=structuredClone(v);mutate(bad);assert.equal(validateVisual(bad,m).valid,false);}
 const wrong=structuredClone(v.target);wrong[1].rotation=0;assert.equal(scoreConstruction(v,wrong),false);
 assert.equal(scoreConstruction(v,[]),false);assert.equal(scoreConstruction(v,'answer'),false);
});
test('issued plan -> generator validates construction without turning an unanswered source into a textbook answer',async()=>{
 const f=await fixture(),input={levelContext:f.levelContext,decisions:f.decisions()};const request=buildPlanningRequest(input),plan=planned(request);
 assert.equal(validatePlan(plan,request).valid,true);
 const service=createGamePlanner({planStructuredGame:planned}),result=await service.plan(input);
 const scope=selectPlannedGame(result,'build',f.levelContext,input.decisions);
 const generator=createGameGenerator({generateStructuredGame:compileGame},{maxRepairs:0});
 const generated=await generator.generate({context:f.levelContext.contexts[scope.nodeId],decision:input.decisions[scope.nodeId],planning:scope});
 assert.equal(generated.ok,true,JSON.stringify(generated));const game=generated.package.game;
 let state=initialState(),time=0;const send=event=>{const e=parseEvent({eventId:'evt_'+time,...event});const result=applyEvent(game,state,e,++time);state=result.state;return result;};
 send({type:'GAME_STARTED'});
 for(const p of game.phases){send({type:'PHASE_STARTED',phaseId:p.id});if(p.id==='practice'){
 const c=game.challenges[0];send({type:'CHALLENGE_PRESENTED',challengeId:c.id});
 assert.throws(()=>send({type:'CHALLENGE_SKIPPED',challengeId:c.id}),/CONSTRUCTION_REQUIRED/);
 const wrong=structuredClone(c.construction.target);wrong[1].rotation=0;
 assert.equal(send({type:'ANSWER_SUBMITTED',challengeId:c.id,response:wrong}).correctness,false);assert.deepEqual(state.active.placements,wrong);
 send({type:'HINT_REQUESTED',challengeId:c.id});
 assert.equal(send({type:'ANSWER_SUBMITTED',challengeId:c.id,response:c.construction.target}).correctness,true);
 }}send({type:'GAME_COMPLETED'});assert.equal(state.status,'COMPLETED');assert.equal(state.resolved[0].attempts,2);assert.equal(state.resolved[0].hintsUsed,1);
 const forged=structuredClone(plan);forged.games[0].construction.materialRef='outside_scope';assert.equal(validatePlan(forged,request).valid,false);
});
test('generated model success does not establish source recall or curriculum mastery',()=>{
 const obs=Array.from({length:5},(_,i)=>({correctness:true,completion:true,attempts:1,hintsUsed:0,mistakes:0,provenance:{evidenceKind:'GENERATED_REFERENCE_CONSTRUCTION',taskFingerprint:String(i),sessionId:String(i)}}));
 assert.deepEqual(deriveMastery(obs),{status:'UNKNOWN',sampleSize:0,policyVersion:'source-recall-mastery-v1'});
});
module.exports={visual,planned};

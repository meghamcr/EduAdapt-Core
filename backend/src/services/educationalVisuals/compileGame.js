'use strict';
const {EVENTS}=require('../gameGeneration/gameContract');
// Pure structural compiler. The visual semantics come from the validated plan;
// recall spans preserve saved decisions without new academic questions.
function compileGame(request){
  const {academicGrounding:a,instructionalPolicy:p}=request;
  const phaseType=a.mode==='REMEDIATION'?'REMEDIATION':p.guidanceLevel==='STEP_BY_STEP'?'GUIDED_PRACTICE':'CORE_GAMEPLAY';
  const challenges=a.evidence.map((e,i)=>{
    const construction=request.planning?.construction;
    const tokens=[...e.text.matchAll(/\S+/gu)].filter(m=>m[0].length<=120);
    if(!construction&&tokens.length<2)throw Error('NO_SOURCE_SPAN');
    const token=tokens.find(t=>/^[A-Za-z]{3,}[.,]?$/u.test(t[0]))||tokens[0];
    const type=request.planning?.mechanic||'CLOZE';
    const options=type==='MCQ_CLOZE'?[...new Set([token[0],...tokens.map(t=>t[0])])].slice(0,4):[];
    return {id:'challenge_'+i,type,phaseId:'practice',...(construction?{construction}:{}),
      prompt:{template:construction?'BUILD_MODEL':'SOURCE_CLOZE',evidenceId:e.id,start:construction?0:token.index,end:construction?1:token.index+token[0].length},
      groundingRefs:[e.id],learningObjectiveRefs:[],correctAnswer:construction?'SERVER_GEOMETRY':token[0],options,
      feedback:{correct:'MATCHED_SOURCE',incorrect:'REVISIT_SOURCE',evidenceId:e.id},
      hint:p.hintsAllowed?{template:'REREAD_SOURCE',evidenceId:e.id}:null,difficulty:p.difficulty,telemetryKey:'challenge_'+i};
  });
  return {contractVersion:'source-game-v1',gameId:request.gameId,specVersion:1,
    metadata:{title:'Discovery Trail',fiction:{setting:'STAR_LIBRARY',character:'ROBOT_COMPANION',narrative:'COLLECT_STARS',dialogue:'LET_US_EXPLORE'}},
    grounding:a.target,academicMode:a.mode,instructionalPolicy:p,learningObjectiveRefs:[],
    claims:a.evidence.map(e=>({evidenceId:e.id,text:e.text})),
    phases:[{id:'intro',type:'INTRO',instruction:'WELCOME',teachingRefs:[]},{id:'learn',type:'TEACH',instruction:'READ_SOURCE',teachingRefs:a.evidence.map(e=>e.id)},
      {id:'practice',type:phaseType,instruction:p.guidanceLevel==='STEP_BY_STEP'?'TRY_WITH_SUPPORT':'COMPLETE_CHALLENGES',teachingRefs:[]},{id:'complete',type:'COMPLETE',instruction:'CELEBRATE',teachingRefs:[]}],
    challenges,completion:{type:'ALL_CHALLENGES',challengeIds:challenges.map(c=>c.id)},reward:{type:'CELEBRATION',quantity:1},visuals:{theme:'PIXEL',assets:[]},
    telemetry:{events:EVENTS,binding:{gameId:request.gameId,specVersion:1,artifactVersionId:a.target.artifactVersionId,nodeId:a.target.nodeId,difficulty:p.difficulty,learningObjectiveRefs:[]},challengeKeys:challenges.map(c=>c.id)}};
}
module.exports={compileGame};

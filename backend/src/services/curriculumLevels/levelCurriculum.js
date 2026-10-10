'use strict';
const {buildInstructionalSequence,compare,fail}=require('./instructionalSequence');
const {buildNotes,interactionCandidates}=require('./notesBuilder');
const {fingerprint}=require('../curriculumIngestion/curriculumIdentity');
const {freeze}=require('../adaptiveLearning/learnerStateProvider');
const {LEVEL_PROGRESSION}=require('./levelProgression');
const POLICY=Object.freeze({version:'source-level-v1',transitionWindowPages:3,minimumTopicSpanPages:2});
const domain=m=>m.hierarchyPath[1]?.nodeId??m.nodeId;
const span=ms=>[...new Map(ms.flatMap(m=>m.sourceRefs).map(r=>[`${r.sourceId}:${r.page}`,r])).values()];
function buildChapterLevels(artifact,options={}){
  if(Object.keys(options).some(k=>!['sourceEvidence','transitionWindowPages','minimumTopicSpanPages'].includes(k)))fail('UNKNOWN_LEVEL_OPTION');
  const policy={...POLICY,...Object.fromEntries(['transitionWindowPages','minimumTopicSpanPages'].filter(k=>options[k]!==undefined).map(k=>[k,options[k]]))};
  for(const k of ['transitionWindowPages','minimumTopicSpanPages'])if(!Number.isSafeInteger(policy[k])||policy[k]<1)fail('INVALID_LEVEL_POLICY');
  const sequence=buildInstructionalSequence(artifact,options),all=sequence.materials;
  const learner=all.filter(m=>m.role!=='teacher_note'),support=all.filter(m=>m.role==='teacher_note');
  const docRank=new Map(sequence.sourceRegistry.map((d,i)=>[d.sourceId,i]));
  const position=(point,end=false)=>[docRank.get(point.sourceId),point.page,point.line??(end?Number.MAX_SAFE_INTEGER:0)];
  const groups=[];
  for(const m of learner){
    let g=groups.at(-1),reason='CHAPTER_START',holdCode=null;
    if(g){
      const prev=g.items.at(-1),first=g.items[0],start=m.sourceOrder.start;
      const sameNode=prev.nodeId===m.nodeId,sameTopic=domain(prev)===domain(m);
      const family=prev.nodeId===m.parentNodeId||m.nodeId===prev.parentNodeId;
      const sourceChange=start.sourceId!==prev.sourceOrder.end.sourceId;
      const gap=start.page-prev.sourceOrder.end.page;
      const groupSpan=Math.max(...g.items.map(x=>x.sourceOrder.end.page))-first.sourceOrder.start.page+1;
      const explicitReview=['review','assessment'].includes(m.nodeType)||(m.nodeType==='exercise'&&m.hierarchyPath.length===2);
      const overlaps=g.items.some(x=>compare(position(start),position(x.sourceOrder.end,true))<=0);
      if(overlaps){reason=null;holdCode='OVERLAPPING_SOURCE_SPAN';}
      else if(!sameNode && explicitReview && prev.nodeId!==m.nodeId)reason='REVIEW_SECTION';
      else if(!sameNode&&!family&&(sourceChange||gap>1))reason='SOURCE_DISCONTINUITY';
      else if(!sameNode&&!family&&!sameTopic&&groupSpan>=policy.minimumTopicSpanPages)reason='INSTRUCTIONAL_TOPIC_TRANSITION';
      else if(!sameNode&&!family&&sameTopic&&start.page-first.sourceOrder.start.page>=policy.transitionWindowPages&&!['exercise','question'].includes(m.role))reason='CONTINUOUS_TOPIC_NEW_INSTRUCTIONAL_GROUP';
      else {reason=null;holdCode=family?'DIRECT_HIERARCHY_CONTINUATION':!sameTopic?'SHORT_ADJACENT_INTRODUCTION':null;}
    }
    if(!g||reason){g={items:[],support:[],boundaryReason:reason,groupingEvidence:[]};groups.push(g);}
    const prev=g.items.at(-1);
    g.groupingEvidence.push({materialRef:m.materialId,previousMaterialRef:prev?.materialId??null,codes:prev?[...(holdCode?[holdCode]:[]),...(prev.nodeId===m.nodeId?['SAME_NODE']:[]),...(domain(prev)===domain(m)?['SHARED_HIERARCHY_BRANCH']:[]),...(m.sourceOrder.start.sourceId===prev.sourceOrder.end.sourceId&&m.sourceOrder.start.page<=prev.sourceOrder.end.page+1?['SOURCE_CONTINUITY']:['NONCONTIGUOUS_SOURCE']),...(['activity','exercise','worked_example','question'].includes(m.role)?['ASSOCIATED_'+m.role.toUpperCase()]:[])]:[reason]});
    g.items.push(m);
  }
  // A small trailing activity in the same branch is continuation, not a new
  // level merely because the page window was reached. Preserve explicit reviews.
  for(let i=groups.length-1;i>0;i--){const g=groups[i],prev=groups[i-1];
    if(g.items.length===1&&g.boundaryReason==='CONTINUOUS_TOPIC_NEW_INSTRUCTIONAL_GROUP'&&domain(g.items[0])===domain(prev.items.at(-1))){
      prev.items.push(...g.items);prev.groupingEvidence.push(...g.groupingEvidence.map(e=>({...e,codes:['TRAILING_RELATED_ACTIVITY']})));groups.splice(i,1);
    }
  }
  // Teacher/appendix material cannot create spurious learner levels. Keep every
  // occurrence, attached by node/ancestor relation before nearest source position.
  if(!groups.length)groups.push({items:[],support:[],boundaryReason:'SUPPORT_ONLY',groupingEvidence:[]});
  for(const m of support){
    let candidates=groups.filter(g=>g.items.some(x=>x.nodeId===m.nodeId));let code='SAME_NODE_SUPPORT';
    if(!candidates.length){candidates=groups.filter(g=>g.items.some(x=>domain(x)===domain(m)));code='SHARED_BRANCH_SUPPORT';}
    if(!candidates.length){candidates=groups;code='NEAREST_SOURCE_SUPPORT_REQUIRES_REVIEW';}
    const distance=g=>g.items.length?Math.min(...g.items.map(x=>x.sourceOrder.start.sourceId===m.sourceOrder.start.sourceId?Math.abs(x.sourceOrder.start.page-m.sourceOrder.start.page):Number.MAX_SAFE_INTEGER)):0;
    const g=[...candidates].sort((a,b)=>distance(a)-distance(b))[0];g.support.push(m);g.groupingEvidence.push({materialRef:m.materialId,previousMaterialRef:null,codes:[code]});
  }
  const catalog=Object.fromEntries(all.map(m=>{const {orderingKey,...entry}=m;return[m.materialId,entry];}));
  const levels=groups.map((g,index)=>{
    const members=[...g.items,...g.support],memberSet=new Set(members.map(m=>m.materialId));
    const materialRefs=sequence.orderedMaterialRefs.filter(id=>memberSet.has(id));
    const learnerRefs=g.items.map(m=>m.materialId),pages=span(g.items),first=g.items.find(m=>m.hierarchyPath.length>1)||g.items[0]||g.support[0];
    const levelId=`level-v1-${fingerprint({artifactVersionId:sequence.artifactVersionId,sequenceFingerprint:sequence.sequenceFingerprint,policy,materialRefs})}`;
    const sourceSpan=docsSpan(sequence.sourceRegistry,pages);
    const objectiveCandidates=sequence.objectives.filter(o=>o.sourceRefs.some(r=>pages.some(p=>r.sourceId===p.sourceId&&r.page===p.page))).map(o=>({objectiveId:o.objectiveId,reason:'SOURCE_PAGE_OVERLAP_ONLY',applicability:'REQUIRES_REVIEW'}));
    const teacherMaterials=g.support.map(m=>({materialRef:m.materialId,classification:'PRESENTATION_REVIEW_REQUIRED',audience:'TEACHER_PENDING_REVIEW',studentVisible:false}));
    const presentationReview=members.filter(m=>m.role==='teacher_note'||m.visualStatus!=='NOT_APPLICABLE'||m.sourceOrder.precision!=='SOURCE_LINE').map(m=>({materialRef:m.materialId,codes:[...(m.role==='teacher_note'?['TEACHER_AUDIENCE_UNRESOLVED']:[]),...(m.visualStatus!=='NOT_APPLICABLE'?['VISUAL_DEFERRED']:[]),...(!m.sourceUnits.length?['LINE_ORDER_UNAVAILABLE']:[])]}));
    const candidates=interactionCandidates(g.items).map(c=>{
      const target=catalog[c.materialRef],ancestors=new Set((target.hierarchyPath.length>1?target.hierarchyPath.slice(1):target.hierarchyPath).map(p=>p.nodeId));
      const eligible=learner.filter(m=>m.materialId!==target.materialId&&!m.studentCompletion&&['explanation','concept','definition','story_context','worked_example','observation'].includes(m.role)&&compare(position(m.sourceOrder.start),position(target.sourceOrder.start))<=0);
      let context=eligible.filter(m=>ancestors.has(m.nodeId));let relationship='SAME_NODE_OR_ANCESTOR';
      if(!context.length){context=eligible.filter(m=>domain(m)===domain(target)).slice(-1);relationship='PRECEDING_SHARED_BRANCH_CONTEXT';}
      return {...c,contextMaterialRefs:context.map(m=>m.materialId),associationEvidence:relationship};
    });
    const contextMaterialRefs=[...new Set(candidates.flatMap(c=>c.contextMaterialRefs).filter(id=>!memberSet.has(id)))];
    return {levelId,sequence:index+1,title:first?.nodeTitle??sequence.chapterTitle,boundaryReason:g.boundaryReason,groupingEvidence:g.groupingEvidence,
      materialRefs,learnerMaterialRefs:learnerRefs,nodeRefs:[...new Set(members.map(m=>m.nodeId))],sourceSpan,supportSourceSpan:docsSpan(sequence.sourceRegistry,span(g.support)),
      objectiveCandidates,notes:buildNotes(g.items),examplesContextRefs:g.items.filter(m=>['story_context','worked_example'].includes(m.role)).map(m=>m.materialId),
      interactionCandidates:candidates,contextMaterialRefs,exerciseQuestionRefs:g.items.filter(m=>['exercise','question'].includes(m.role)).map(m=>m.materialId),
      activityRefs:g.items.filter(m=>m.role==='activity').map(m=>m.materialId),teacherMaterials,
      visualDependencies:members.filter(m=>m.visualStatus!=='NOT_APPLICABLE').map(m=>({materialRef:m.materialId,sourceRefs:m.sourceRefs,status:m.visualStatus,textRef:m.materialId,presentation:'DEFERRED',modelDescriptionIncluded:false})),presentationReview};
  });
  const assigned=levels.flatMap(l=>l.materialRefs);if(assigned.length!==all.length||new Set(assigned).size!==all.length)fail('MATERIAL_PARTITION_FAILED');
  const anomalies=[];
  for(let i=0;i<learner.length;i++){const m=learner[i];if(learner.slice(i+1).some(n=>compare(position(n.sourceOrder.start),position(m.sourceOrder.end,true))<0))anomalies.push({code:'OVERLAPPING_MATERIAL_SPAN_REVIEW',materialRef:m.materialId});}
  for(const l of levels)if(l.sourceSpan.some(s=>s.lastPage-s.firstPage+1>policy.transitionWindowPages*2))anomalies.push({code:'WIDE_LEVEL_SOURCE_SPAN_REVIEW',levelId:l.levelId});
  if(levels.length===1&&learner.length>12)anomalies.push({code:'LARGE_SINGLE_LEVEL_REVIEW'});
  for(const l of levels){if(l.learnerMaterialRefs.length<=1)anomalies.push({code:'SMALL_LEVEL_REVIEW',levelId:l.levelId});}
  const nodeLevels=new Map();for(const l of levels)for(const id of l.learnerMaterialRefs){const n=catalog[id].nodeId;const set=nodeLevels.get(n)||new Set();set.add(l.levelId);nodeLevels.set(n,set);}
  for(const [nodeId,ids] of nodeLevels)if(ids.size>1)anomalies.push({code:'NODE_SPANS_LEVELS_REVIEW',nodeId,levelIds:[...ids]});
  return freeze({packageVersion:1,policy,sequenceFingerprint:sequence.sequenceFingerprint,artifactVersionId:sequence.artifactVersionId,artifactChecksum:sequence.artifactChecksum,chapterIdentity:sequence.chapterIdentity,chapterTitle:sequence.chapterTitle,
    reviewStatus:'UNREVIEWED',inputReviewStatus:sequence.inputReviewStatus,usage:'DEVELOPMENT_ONLY',productionEligible:false,
    objectives:sequence.objectives,sourceRegistry:sequence.sourceRegistry,orderedMaterialRefs:sequence.orderedMaterialRefs,materials:catalog,levels,
    progression:LEVEL_PROGRESSION,excludedNonAuthoritative:sequence.excludedNonAuthoritative,reviewWarnings:[...sequence.warnings,...anomalies],
    deferredSourcePages:sequence.sourceRegistry.flatMap(d=>(d.furnitureOnlyPages||[]).map(page=>({sourceId:d.sourceId,page,status:'VISUAL_UNRESOLVED',reason:'FURNITURE_ONLY_TEXT_EXTRACTION'})))});
}
function docsSpan(docs,refs){return docs.flatMap(d=>{const pages=refs.filter(r=>r.sourceId===d.sourceId).map(r=>r.page);return pages.length?[{sourceId:d.sourceId,firstPage:Math.min(...pages),lastPage:Math.max(...pages),pages:[...new Set(pages)].sort((a,b)=>a-b)}]:[];});}
function levelCurriculumPackage(chapter,levelId){
  const level=chapter.levels.find(l=>l.levelId===levelId);if(!level)fail('LEVEL_NOT_FOUND');
  return freeze({packageVersion:chapter.packageVersion,policy:chapter.policy,sequenceFingerprint:chapter.sequenceFingerprint,artifactVersionId:chapter.artifactVersionId,artifactChecksum:chapter.artifactChecksum,
    chapterIdentity:chapter.chapterIdentity,chapterTitle:chapter.chapterTitle,reviewStatus:'UNREVIEWED',usage:'DEVELOPMENT_ONLY',productionEligible:false,
    level,objectives:chapter.objectives,sourceRegistry:chapter.sourceRegistry,deferredSourcePages:chapter.deferredSourcePages,
    progression:LEVEL_PROGRESSION,materials:Object.fromEntries([...level.materialRefs,...level.contextMaterialRefs].map(id=>[id,chapter.materials[id]])),reviewWarnings:chapter.reviewWarnings});
}
module.exports={buildChapterLevels,levelCurriculumPackage,POLICY};

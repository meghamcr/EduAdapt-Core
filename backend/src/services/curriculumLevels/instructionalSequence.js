'use strict';
const { prepareArtifactStorage } = require('../curriculumArtifacts/artifactStorage');
const { fingerprint } = require('../curriculumIngestion/curriculumIdentity');
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const fail = code => { const e = new Error(code); e.code = code; throw e; };
const compare = (a,b) => { for(let i=0;i<Math.max(a.length,b.length);i++){ if(a[i]!==b[i])return (a[i]??-1)<(b[i]??-1)?-1:1; }return 0; };

// Optional evidence is a local, independently verified extraction/anchor sidecar.
// Never infer line positions by finding the first occurrence of repeated wording.
function buildInstructionalSequence(artifact, { sourceEvidence } = {}) {
  const { identity, version } = prepareArtifactStorage(artifact);
  const a=version.snapshot;
  if(a.source_context?.authorityVersion!==2)fail('SOURCE_AUTHORITY_V2_REQUIRED');
  const docs=a.source_context.documents, docIndex=new Map(docs.map((d,i)=>[d.sourceId,i]));
  const nodes=new Map(a.nodes.map(n=>[n.id,n]));
  const paths=new Map();
  for(const node of a.nodes){const path=[];let n=node;while(n){path.unshift({nodeId:n.id,title:n.title,type:n.type,order:n.order});n=nodes.get(n.parent_id);}paths.set(node.id,path);}
  const anchors=new Map();
  if(sourceEvidence!==undefined){
    if(!sourceEvidence || !Array.isArray(sourceEvidence.documents)||!Array.isArray(sourceEvidence.units)||!Array.isArray(sourceEvidence.materials))fail('INVALID_SOURCE_EVIDENCE');
    if(fingerprint(sourceEvidence.documents)!==fingerprint(docs.map(d=>({sourceId:d.sourceId,sha256:d.sha256}))))fail('SOURCE_EVIDENCE_DOCUMENT_MISMATCH');
    const units=new Map();
    for(const u of sourceEvidence.units){
      const d=docs.find(d=>d.sourceId===u.sourceId);
      if(!d||!d.pages.includes(u.page)||!Number.isSafeInteger(u.line)||u.line<1||typeof u.text!=='string'||!u.text.trim()||units.has(u.id)||u.id!==`${u.sourceId}:p${u.page}:l${u.line}`)fail('INVALID_SOURCE_UNIT');
      units.set(u.id,u);
    }
    for(const entry of sourceEvidence.materials){
      const key=`${entry.nodeId}:${entry.materialIndex}`,m=nodes.get(entry.nodeId)?.materials[entry.materialIndex];
      if(!m||!Number.isSafeInteger(entry.materialIndex)||anchors.has(key)||!Array.isArray(entry.unitIds)||!entry.unitIds.length||new Set(entry.unitIds).size!==entry.unitIds.length)fail('INVALID_MATERIAL_ANCHORS');
      const selected=entry.unitIds.map(id=>units.get(id));if(selected.some(u=>!u))fail('INVALID_MATERIAL_ANCHORS');
      selected.sort((x,y)=>compare([docIndex.get(x.sourceId),x.page,x.line],[docIndex.get(y.sourceId),y.page,y.line]));
      const refs=[...new Map(selected.map(u=>[`${u.sourceId}:${u.page}`,{sourceId:u.sourceId,page:u.page}])).values()];
      if(selected.map(u=>u.text).join('\n')!==m.text||fingerprint(refs)!==fingerprint(m.source_refs))fail('SOURCE_RECONSTRUCTION_MISMATCH');
      anchors.set(key,selected.map(({id,sourceId,page,line})=>({id,sourceId,page,line})));
    }
  }
  const materials=[],excluded=[];
  for(const n of a.nodes){
    const path=paths.get(n.id);
    n.materials.forEach((m,index)=>{
      const units=anchors.get(`${n.id}:${index}`)||[];
      const refs=structuredClone(m.source_refs).sort((x,y)=>compare([docIndex.get(x.sourceId),x.page],[docIndex.get(y.sourceId),y.page]));
      const start=units[0]||{...refs[0],line:null},end=units.at(-1)||{...refs.at(-1),line:null};
      const materialId=`material-v1-${fingerprint([version.id,n.id,index])}`;
      materials.push({materialId,artifactVersionId:version.id,nodeId:n.id,materialIndex:index,nodeTitle:n.title,nodeType:n.type,parentNodeId:n.parent_id||null,hierarchyPath:path,
        role:m.role,authority:m.authority,evidenceKind:m.evidence_kind,text:m.text,studentCompletion:m.student_completion,
        sourceRefs:refs,sourceUnits:units,sourceOrder:{start,end,precision:units.length?'SOURCE_LINE':'PAGE_WITH_HIERARCHY_TIEBREAK'},visualStatus:m.visual.status,
        orderingKey:[docIndex.get(start.sourceId),start.page,start.line??0,path.map(p=>`${String(p.order).padStart(16,'0')}:${p.nodeId}`).join('/'),index]});
    });
    for(const field of ['source_synthesis','review_inferences'])n[field].forEach((m,index)=>excluded.push({nodeId:n.id,field,index,authority:m.authority,reason:'NOT_AUTHORITATIVE_SOURCE_TEXT'}));
  }
  materials.sort((x,y)=>compare(x.orderingKey,y.orderingKey));
  const warnings=[];
  if(materials.some(m=>!m.sourceUnits.length))warnings.push({code:'LINE_ORDER_UNAVAILABLE',requiresReview:true});
  // Page overlap alone is not evidence of objective applicability.
  const objectives=version.objectives.map((o,index)=>({objectiveId:`objective-v1-${fingerprint([version.id,index])}`,index,text:o.text,sourceRefs:o.evidence,scope:'CHAPTER',levelApplicability:'UNVERIFIED'}));
  const sequenceFingerprint=fingerprint({artifactVersionId:version.id,orderedMaterials:materials.map(m=>({materialId:m.materialId,sourceUnits:m.sourceUnits,sourceOrder:m.sourceOrder}))});
  return freeze({sequenceVersion:1,sequenceFingerprint,artifactVersionId:version.id,artifactChecksum:version.artifactChecksum,chapterIdentity:identity,chapterTitle:a.chapter,
    inputReviewStatus:a._ingestion?.reviewStatus??'UNREVIEWED',usage:'DEVELOPMENT_ONLY',sourceRegistry:structuredClone(docs),objectives,
    materials,orderedMaterialRefs:materials.map(m=>m.materialId),excludedNonAuthoritative:excluded,warnings});
}
module.exports={buildInstructionalSequence,compare,fail};

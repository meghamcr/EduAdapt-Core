'use strict';
// Generated reference models have independent geometric answers. They never
// supply an answer to an unresolved textbook picture or open reflection.
const {fingerprint}=require('../curriculumIngestion/curriculumIdentity');
const VERSION='block-model-v1';
const integer=(minimum,maximum)=>({type:'integer',minimum,maximum});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const id={type:'string',pattern:'^[a-zA-Z0-9_-]+$',minLength:1,maxLength:40};
const pose=object({id,x:integer(0,11),y:integer(0,11),rotation:integer(0,1)});
const schema=object({version:{type:'string',enum:[VERSION]},origin:{type:'string',enum:['GENERATED']},
  originalExerciseResolved:{type:'boolean',enum:[false]},
  materialRef:{type:'string',minLength:1,maxLength:160},
  sourceText:{type:'string',minLength:1,maxLength:12000},
  columns:integer(4,12),rows:integer(4,12),
  pieces:{type:'array',minItems:2,maxItems:8,items:object({id,width:integer(1,6),height:integer(1,6),depth:integer(1,4)})},
  target:{type:'array',minItems:2,maxItems:8,items:pose},
  assessment:{type:'string',enum:['MATCH_GENERATED_REFERENCE']}});
function cells(spec,placements){
  if(!Array.isArray(placements)||placements.length!==spec.pieces.length)throw Error('PLACEMENT_COUNT');
  const seen=new Set(),occupied=new Set();
  for(const p of placements){
    if(!p||Object.keys(p).sort().join(',')!=='id,rotation,x,y'||!Number.isInteger(p.x)||!Number.isInteger(p.y)||![0,1].includes(p.rotation)||seen.has(p.id))throw Error('PLACEMENT_INVALID');
    const piece=spec.pieces.find(b=>b.id===p.id);if(!piece)throw Error('PIECE_UNKNOWN');seen.add(p.id);
    const w=p.rotation?piece.height:piece.width,h=p.rotation?piece.width:piece.height;
    if(p.x<0||p.y<0||p.x+w>spec.columns||p.y+h>spec.rows)throw Error('PLACEMENT_BOUNDS');
    for(let x=p.x;x<p.x+w;x++)for(let y=p.y;y<p.y+h;y++){
      const key=x+','+y;if(occupied.has(key))throw Error('PLACEMENT_OVERLAP');occupied.add(key);
    }
  }
  return occupied;
}
function validateVisual(spec,material){
  const {checkSchema,copyJson}=require('../gameGeneration/gameValidation');
  try{
    spec=copyJson(spec,18000);
    if(checkSchema(spec,schema).length)throw Error('VISUAL_SCHEMA');
    if(!material||spec.materialRef!==(material.materialRef||material.materialId)||spec.sourceText!==material.text||material.role==='teacher_note'||!material.sourceRefs?.length)throw Error('VISUAL_SOURCE');
    if(new Set(spec.pieces.map(p=>p.id)).size!==spec.pieces.length)throw Error('PIECE_DUPLICATE');
    const occupied=cells(spec,spec.target);
    for(const p of spec.target){
      const b=spec.pieces.find(b=>b.id===p.id),w=p.rotation?b.height:b.width;
      if(p.y>0&&!(occupied.has(p.x+','+(p.y-1)) && occupied.has((p.x+w-1)+','+(p.y-1))))throw Error('UNSUPPORTED_BLOCK');
    }
    return {valid:true,id:'visual_'+fingerprint(spec)};
  }catch(error){return {valid:false,code:error.message};}
}
function scoreConstruction(spec,response){
  try{cells(spec,response);}catch{return false;}
  return response.every(p=>{const b=spec.pieces.find(b=>b.id===p.id),t=spec.target.find(t=>t.id===p.id);
    return p.x===t.x&&p.y===t.y&&(b.width===b.height||p.rotation===t.rotation);});
}
function detectRequirements(chapter,level){
  return level.learnerMaterialRefs.map(ref=>chapter.materials[ref]).filter(m=>m.visualStatus!=='NOT_APPLICABLE').map(m=>({
    curriculumVersion:chapter.artifactVersionId,chapter:chapter.chapterTitle,levelId:level.levelId,
    materialRef:m.materialRef||m.materialId,sourceRefs:m.sourceRefs,sourceText:m.text,
    objective:{basis:'EXACT_SOURCE_INSTRUCTION',text:m.text},
    visualType:'SEMANTIC_PLANNING_REQUIRED',requiredObjects:[],requiredRelationships:[],
    interaction:'UNDETERMINED',academicConstraints:['NO_UNKNOWN_PICTURE_ANSWERS','NO_CROSS_LEVEL_CONTENT'],
    verification:'INDEPENDENT_GEOMETRY_REQUIRED',origin:'UNRESOLVED',originalExerciseResolved:false
  }));
}
module.exports={VERSION,schema,validateVisual,scoreConstruction,cells,detectRequirements};

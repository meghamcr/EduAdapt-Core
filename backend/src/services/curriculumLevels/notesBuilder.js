'use strict';
const NOTE_SECTIONS=Object.freeze({story_context:'CONTEXT',explanation:'EXPLANATION',definition:'KEY_IDEAS',concept:'KEY_IDEAS',worked_example:'WORKED_EXAMPLES',observation:'OBSERVATIONS',source_provided_answer:'SOURCE_PROVIDED_ANSWERS',table:'SOURCE_TABLES'});
const INTERACTIONS=new Set(['activity','exercise','question','investigation','visual_dependent_task','story_context','observation']);
function buildNotes(materials){
  const sections=[];
  for(const m of materials){
    const kind=NOTE_SECTIONS[m.role];
    if(!kind||m.studentCompletion)continue;
    // Contiguous sections retain instructional order. Never merge distant examples.
    let section=sections.at(-1);if(section?.kind!==kind){section={kind,materialRefs:[]};sections.push(section);}section.materialRefs.push(m.materialId);
  }
  return sections;
}
function interactionCandidates(materials){return materials.filter(m=>m.role!=='teacher_note'&&(m.studentCompletion||INTERACTIONS.has(m.role))).map(m=>({materialRef:m.materialId,pedagogicalRole:m.role,studentCompletion:m.studentCompletion,mechanic:null,requiresPlanningReview:true}));}
module.exports={buildNotes,interactionCandidates};

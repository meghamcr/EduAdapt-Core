const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceTextUnits,resolveSourceText}=require('../../src/services/curriculumIngestion/textAuthority');
const {buildSourceContext}=require('../../src/services/curriculumIngestion/sourceContext');
const {parseCurriculum}=require('../../src/services/curriculumIngestion/curriculumParser');
const {validateCurriculum}=require('../../src/services/curriculumIngestion/curriculumValidator');
const {identity,modelOutput,response}=require('./fixtures/helpers');
const text='Observe the figures.\n(a) Which can roll? ___\n(b) Use 12 sticks. Explain your choice.\nFigure A: Triangular prism.\n  12 / 3 = 4\nNote for teachers: preserve the open investigation.';
async function setup(){
 const context=await buildSourceContext([{sha256:'c'.repeat(64)}],[{pages:[{page:4,text}],pageCount:4}],'text');
 const input={...identity,sourceContext:context,extractedText:text,model:'fixture',apiKey:'TEST_ONLY'};
 const wire=modelOutput(input);
 wire.nodes[0].materials[0].source_unit_ids=[context.textUnits[0].id];
 wire.nodes[1].materials[0]={...wire.nodes[1].materials[0],role:'activity',student_completion:true,source_unit_ids:context.textUnits.slice(1).map(u=>u.id)};
 return{input,wire,context};
}
test('source units preserve line text, indentation, labels and independent document/page identity',()=>{
 const units=sourceTextUnits([{sourceId:'one',pages:[{page:4,text}]},{sourceId:'two',pages:[{page:4,text:'Different text'}]}]);
 assert.equal(new Set(units.map(u=>u.id)).size,units.length);
 assert.equal(units[4].text,'  12 / 3 = 4');
 assert.equal(units.at(-1).sourceId,'two');
});
test('model-written answers and visual descriptions cannot replace selected authoritative source text',async()=>{
 const {input,wire,context}=await setup();
 wire.nodes[1].materials[0].text='The picture contains 12 cubes. The answer is 99. Nets A map to solids 1.';
 wire.nodes[1].materials[0].source_refs=[{sourceId:'wrong',page:999}];
 const a=await parseCurriculum(input,{fetchImpl:async()=>response(wire)});
 assert.equal(a.nodes.length,2);
 assert.equal(a.nodes[1].materials[0].text,context.textUnits.slice(1).map(u=>u.text).join('\n'));
 assert.equal(a.nodes[1].content.includes('99'),false);
 assert.equal(a.nodes[1].content.includes('12 cubes'),false);
 assert.deepEqual(a.nodes[1].materials[0].source_refs,[{sourceId:'source-1',page:4}]);
 assert.equal(a.nodes[1].materials[0].source_unit_ids,undefined);
 assert.equal(validateCurriculum(a).valid,true);
});
test('invalid, missing or duplicate source anchors fail closed rather than falling back to generated prose',async()=>{
 for(const ids of [undefined,[],['missing'],[4],['source-1:p4:l1','source-1:p4:l1']]){
  const {input,wire}=await setup();wire.nodes[1].materials[0].source_unit_ids=ids;
  await assert.rejects(parseCurriculum(input,{fetchImpl:async()=>response(wire)}),{code:'OUTPUT_SOURCE_ANCHOR_INVALID'});
 }
});
test('anchor selection preserves source order, blank questions, all subparts and numerical examples',async()=>{
 const {input,wire,context}=await setup();wire.nodes[1].materials[0].source_unit_ids=context.textUnits.map(u=>u.id).reverse();
 const a=await parseCurriculum(input,{fetchImpl:async()=>response(wire)});
 assert.equal(a.nodes[1].materials[0].text,text);
 assert.equal(a.nodes[1].materials[0].student_completion,true);
 assert.equal(a.nodes[1].parent_id,a.nodes[0].id);
});
test('non-authoritative interpretations cannot use anchors to promote their text',async()=>{
 const {input,wire}=await setup();
 wire.nodes[1].materials.push({...wire.nodes[1].materials[0],authority:'MODEL_VISUAL_INTERPRETATION',evidence_kind:'VISUAL_READING',text:'A diagnostic visual guess.',visual:{status:'VISUAL_UNRESOLVED',description:''}});
 const a=await parseCurriculum(input,{fetchImpl:async()=>response(wire)});
 assert.equal(a.nodes[1].content.includes('diagnostic'),false);
 assert.equal(a.nodes[1].review_inferences[0].text,'A diagnostic visual guess.');
 assert.equal(a.nodes[1].review_inferences[0].source_unit_ids,undefined);
 assert.equal(validateCurriculum(a).valid,true);
});
test('anchoring never repairs a conflicting authority/evidence declaration',()=>{
 assert.throws(()=>resolveSourceText([{authority:'EXPLICIT_SOURCE_CONTENT',evidence_kind:'VISUAL_READING'}],[]),{code:'OUTPUT_INVALID'});
});
test('identical printed lines have distinct stable occurrence IDs across repeated extraction',()=>{
 const docs=[{sourceId:'source-1',pages:[{page:8,text:'Heading\nRepeat.\n\nRepeat.'}]}];
 const first=sourceTextUnits(docs),second=sourceTextUnits(structuredClone(docs));
 assert.deepEqual(first,second);
 assert.equal(first[1].text,first[2].text);
 assert.notEqual(first[1].id,first[2].id);
 assert.equal(first[2].id,'source-1:p8:l4');
});
test('source-backed parent, synthesized overview and linked passage/question retain distinct authority and hierarchy',async()=>{
 const {input,wire,context}=await setup();
 wire.nodes[0].materials.push({...wire.nodes[0].materials[0],authority:'SOURCE_GROUNDED_SYNTHESIS',evidence_kind:'SOURCE_SUMMARY',text:'A short source-grounded organizational overview.',source_unit_ids:[]});
 wire.nodes[1].materials[0].role='story_context';
 wire.nodes.push({...wire.nodes[1],temp_id:'follow-up',parent_temp_id:wire.nodes[1].temp_id,type:'question',title:'Respond to the passage',order:1,materials:[{...wire.nodes[1].materials[0],role:'question',source_unit_ids:[context.textUnits[1].id]}]});
 let diagnostics;
 const a=await parseCurriculum(input,{fetchImpl:async()=>response(wire),onDiagnostics:d=>{diagnostics=d;}});
 assert.equal(a.nodes[0].content.includes('organizational overview'),false);
 assert.equal(a.nodes[0].source_synthesis.length,1);
 assert.equal(a.nodes[1].materials[0].role,'story_context');
 assert.equal(a.nodes[2].parent_id,a.nodes[1].id);
 assert.equal(a.nodes[2].materials[0].text,'(a) Which can roll? ___');
 assert.equal(validateCurriculum(a).stats.maximumDepth,2);
 assert.deepEqual(diagnostics.sourceText,{availableUnits:6,selectedUnits:6,unselectedUnits:0,repeatedSelections:1});
});
test('invalid anchor diagnostics identify failure without echoing untrusted IDs or generated prose',async()=>{
 const {input,wire}=await setup();wire.nodes[1].materials[0].source_unit_ids=['UNTRUSTED_PRIVATE_SENTINEL'];
 await assert.rejects(parseCurriculum(input,{fetchImpl:async()=>response(wire)}),error=>{
  assert.equal(error.code,'OUTPUT_SOURCE_ANCHOR_INVALID');
  assert.deepEqual(error.details,['Material 1: unregistered anchors.']);
  assert.equal(JSON.stringify(error).includes('UNTRUSTED_PRIVATE_SENTINEL'),false);
  return true;
 });
});

test('locally recognized furniture-only text pages may defer visuals without invented materials',async()=>{
 const {input,wire}=await setup();
 input.sourceContext.documents[0].pages.push({page:5,text:'Page 17\nReprinted 2024–25'});
 const a=await parseCurriculum(input,{fetchImpl:async()=>response(wire)});
 assert.deepEqual(a.source_context.documents[0].furnitureOnlyPages,[5]);
 assert.equal(validateCurriculum(a).valid,true);
 assert.ok(validateCurriculum(a).warnings.some(w=>w.includes('Source page source-1:5')));
 delete a.source_context.documents[0].furnitureOnlyPages;
 assert.ok(validateCurriculum(a).errors.some(e=>e.includes('source-1:5 is not represented')));
});
test('instructional lines, unknown furniture, empty and bare numeric pages remain required',async()=>{
 for(const text of ['Reprint 2024-25\nHow many groups?', '17', '', 'Publication detail', 'Reprint 2024-25\n12 + 3 = ___']){
  const {input,wire}=await setup();
  input.sourceContext.documents[0].pages.push({page:5,text});
  await assert.rejects(parseCurriculum(input,{fetchImpl:async()=>response(wire)}),e=>e.code==='OUTPUT_INVALID'&&e.details.some(d=>d.includes('source-1:5 is not represented')));
 }
});
test('furniture exemptions cannot remove provenance references or bypass PDF coverage',async()=>{
 const {input,wire}=await setup();
 const a=await parseCurriculum(input,{fetchImpl:async()=>response(wire)});
 for(const invalid of [null,'4',[999],[4,4]]){
  const copy=structuredClone(a);copy.source_context.documents[0].furnitureOnlyPages=invalid;
  if(invalid===null) continue; // Optional legacy field is treated as absent.
  assert.equal(validateCurriculum(copy).valid,false);
 }
 a.source_context.mode='pdf';a.source_context.documents[0].furnitureOnlyPages=[4];
 assert.equal(validateCurriculum(a).valid,false);
});

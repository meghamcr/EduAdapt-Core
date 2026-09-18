const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCurriculum } = require('../../src/services/curriculumIngestion/curriculumParser');
const { validateCurriculum } = require('../../src/services/curriculumIngestion/curriculumValidator');
const { curriculumResponseSchema } = require('../../src/services/curriculumIngestion/curriculumResponseSchema');
const { renderMaterials } = require('../../src/services/curriculumIngestion/sourceFidelity');
const { identity, modelOutput, response } = require('./fixtures/helpers');
const input = { ...identity, model: 'synthetic', apiKey: 'TEST_ONLY', extractedText: 'Read the figure and explain your classification.', sourceContext: { mode: 'text', version: 1, documents: [{ sourceId: 'source-1', sha256: 'a'.repeat(64), pages: [{ page: 7, text: 'Read the figure and explain your classification.' }] }] } };
async function generate(change = () => {}) {
 const wire = modelOutput(input); change(wire);
 return parseCurriculum(input, { fetchImpl: async () => response(wire) });
}
function item(wire, props) { return { ...wire.nodes[1].materials[0], ...props }; }
test('direct text and grounded synthesis have distinct storage, evidence and content', async () => {
 const a = await generate(w => w.nodes[1].materials.push(item(w, { authority: 'SOURCE_GROUNDED_SYNTHESIS', evidence_kind: 'SOURCE_SUMMARY', text: 'A synthetic overview of source activities.' })));
 assert.equal(a.source_context.authorityVersion, 2);
 assert.equal(a.nodes[1].materials[0].authority, 'EXPLICIT_SOURCE_CONTENT');
 assert.equal(a.nodes[1].source_synthesis[0].authority, 'SOURCE_GROUNDED_SYNTHESIS');
 assert.deepEqual(a.nodes[1].source_synthesis[0].source_refs, [{sourceId:'source-1',page:7}]);
 assert.equal(a.nodes[1].content.includes('synthetic overview'), false);
 assert.equal(validateCurriculum(a).valid, true);
});
test('visual readings and nonvisual deductions are quarantined and review required', async () => {
 const a = await generate(w => w.nodes[1].materials.push(
  item(w, {authority:'MODEL_VISUAL_INTERPRETATION',evidence_kind:'VISUAL_READING',text:'The upper region appears blue.',visual:{status:'VISUAL_DEPENDENCY',description:''}}),
  item(w, {authority:'MODEL_INFERENCE',evidence_kind:'DEDUCTION',text:'An inferred answer is seven.'})));
 assert.equal(a.nodes[1].review_inferences.length,2);
 assert.ok(a.nodes[1].review_inferences.every(m=>m.review_required));
 assert.equal(a.nodes[1].content.includes('blue'),false);assert.equal(a.nodes[1].content.includes('seven'),false);
 assert.equal(renderMaterials(a.nodes[1].review_inferences),'');
});
for (const [name, role, text] of [
 ['visual question','question','Which pictured object belongs here? ___'],
 ['blank table','table','Complete the table.\n| Sample | Observation |\n| A | ___ |'],
 ['visual classification','activity','Sort the pictured items and explain your rule.'],
 ['net validity','exercise','Which of these nets will form the given solid?'],
 ['visual answer options','visual_dependent_task','Choose one of the pictured options.']
]) test(`${name} stays open without reconstructing the source visual`,async()=>{
 const a=await generate(w=>{w.nodes[1].materials=[item(w,{role,text,student_completion:true,visual:{status:'VISUAL_DEPENDENCY',description:''}})];});
 const m=a.nodes[1].materials[0];assert.equal(m.text,text);assert.equal(m.role,role);assert.equal(m.student_completion,true);
 assert.equal(m.visual.status,'VISUAL_DEPENDENCY');assert.equal(m.visual.description,'');
 assert.deepEqual(m.source_refs,[{sourceId:'source-1',page:7}]);assert.deepEqual(a.objective_evidence,[[{sourceId:'source-1',page:7}]]);
 assert.equal(a.source_context.documents[0].sha256,'a'.repeat(64));assert.equal(a.nodes[1].parent_id,a.nodes[0].id);
 assert.equal(a.nodes[1].content,`[${role}] ${text}`);assert.equal(validateCurriculum(a).valid,true);
});
test('visual descriptions cannot inherit source authority or enter content',async()=>{
 const a=await generate(w=>{w.nodes[1].materials[0].visual={status:'VISUAL_DEPENDENCY',description:'Model description of an option: pointed object.'};});
 const m=a.nodes[1].materials[0];assert.equal(m.visual.authority,'MODEL_VISUAL_INTERPRETATION');assert.equal(m.visual.review_required,true);
 assert.equal(a.nodes[1].content.includes('pointed object'),false);
 m.visual.authority='EXPLICIT_SOURCE_CONTENT';assert.equal(validateCurriculum(a).valid,false);
});
test('contradictory authority, missing evidence and answer-bearing synthesis fail closed',async()=>{
 for(const props of [
  {authority:'EXPLICIT_SOURCE_CONTENT',evidence_kind:'VISUAL_READING'},
  {authority:'EXPLICIT_SOURCE_CONTENT',evidence_kind:'DEDUCTION'},
  {authority:'EXPLICIT_SOURCE_CONTENT',evidence_kind:'SOURCE_SUMMARY'},
  {evidence_kind:undefined},
  {authority:'SOURCE_GROUNDED_SYNTHESIS',evidence_kind:'SOURCE_SUMMARY',source_refs:[]},
  {authority:'SOURCE_GROUNDED_SYNTHESIS',evidence_kind:'SOURCE_SUMMARY',role:'exercise',student_completion:true},
  {authority:'SOURCE_GROUNDED_SYNTHESIS',evidence_kind:'SOURCE_SUMMARY',role:'source_provided_answer'},
  {authority:'MODEL_VISUAL_INTERPRETATION',evidence_kind:'VISUAL_READING',visual:{status:'NOT_APPLICABLE',description:''}}
 ]) await assert.rejects(generate(w=>w.nodes[1].materials.push(item(w,props))),{code:'OUTPUT_INVALID'});
 const a=await generate();a.nodes[1].content+=' Model answer.';assert.equal(validateCurriculum(a).valid,false);
});
test('quarantine cannot be bypassed by moving interpretations to source materials',async()=>{
 const a=await generate(w=>w.nodes[1].materials.push(item(w,{authority:'MODEL_INFERENCE',evidence_kind:'DEDUCTION',text:'Synthetic answer.'})));
 a.nodes[1].materials.push(a.nodes[1].review_inferences.pop());assert.equal(validateCurriculum(a).valid,false);
});
test('native schema exposes four authorities and derivation kinds; old artifacts remain readable',async()=>{
 const props=curriculumResponseSchema().properties.nodes.items.properties.materials.items;
 assert.equal(props.properties.authority.enum.length,4);assert.ok(props.required.includes('evidence_kind'));
 const a=await generate();delete a.source_context.authorityVersion;
 for(const n of a.nodes){delete n.source_synthesis;for(const m of n.materials){delete m.evidence_kind;delete m.review_required;delete m.visual.authority;delete m.visual.review_required;}}
 assert.equal(validateCurriculum(a).valid,true);
});

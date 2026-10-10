const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCurriculum } = require('../../src/services/curriculumIngestion/curriculumParser');
const { validateCurriculum } = require('../../src/services/curriculumIngestion/curriculumValidator');
const { identity, modelOutput, response } = require('./fixtures/helpers');
const excerpts = {
  explanation: 'Compare the materials and describe what you observe.',
  worked_example: 'Worked example: 15 counters shared into 3 equal groups gives 5 counters per group. Check: 3 × 5 = 15.',
  activity: 'Build a model using 8 sticks. Compare it with your partner. Explain how you chose the pieces.',
  exercise: 'Observe the figures. (a) Which can roll? (b) Which can slide? (c) Explain your choice. Do not fill the blanks yet: ___.',
  teacher_note: 'Allow learners to test different arrangements and discuss their observations.',
  caption: 'Figure A: Triangular prism.'
};
const input = { ...identity, grade: 'Third cycle', model: 'fixture', apiKey: 'TEST_ONLY',
  extractedText: Object.values(excerpts).join('\n'), sourceContext: { version: 1, mode: 'text', mediaParts: [], documents: [{ sourceId: 'source-1', sha256: 'b'.repeat(64), pages: [{ page: 9, text: Object.values(excerpts).join('\n') }] }] } };
async function generate(items, inspect = () => {}) {
  const wire = modelOutput(input);
  const base = wire.nodes[0].materials[0];
  wire.nodes[0].materials = [{ ...base, text: excerpts.explanation }];
  wire.nodes[1].type = 'concept';
  wire.nodes[1].materials = items.map(item => ({ ...base, ...item }));
  return parseCurriculum(input, { fetchImpl: async (_, options) => { inspect(JSON.parse(options.body)); return response(wire); } });
}
test('source examples, activities, teacher notes, numerical givens and exercise subparts survive text ingestion', async () => {
  const items = ['worked_example', 'activity', 'exercise', 'teacher_note'].map(role => ({ role, text: excerpts[role], student_completion: ['activity', 'exercise'].includes(role) }));
  const a = await generate(items);
  for (const item of items) assert.ok(a.nodes[1].content.includes(item.text));
  assert.equal(a.nodes[1].materials[2].student_completion, true);
  assert.ok(!a.nodes[1].content.includes('The answer is'));
  assert.equal(validateCurriculum(a).valid, true);
});
for (const status of ['VISUAL_DEPENDENCY', 'VISUAL_UNRESOLVED']) test(`${status} preserves an unanswered textual task and remains nonfatal`, async () => {
  const a = await generate([{ role: 'exercise', text: excerpts.exercise, student_completion: true, visual: { status, description: '' } }]);
  const v = validateCurriculum(a);
  assert.equal(v.valid, true); assert.deepEqual(v.errors, []);
  assert.ok(v.warnings.some(w => w.startsWith(status)));
  assert.equal(a.nodes[1].content, `[exercise] ${excerpts.exercise}`);
  assert.deepEqual(a.nodes[1].materials[0].source_refs, [{ sourceId: 'source-1', page: 9 }]);
});
test('printed captions stay authoritative while diagnostic visual readings stay outside content', async () => {
  const a = await generate([
    { role: 'explanation', text: excerpts.caption },
    { role: 'observation', text: 'The pictured object appears blue.', authority: 'MODEL_VISUAL_INTERPRETATION', evidence_kind: 'VISUAL_READING', visual: { status: 'VISUAL_DEPENDENCY', description: '' } }
  ]);
  assert.ok(a.nodes[1].content.includes(excerpts.caption));
  assert.equal(a.nodes[1].content.includes('blue'), false);
  assert.equal(a.nodes[1].review_inferences[0].review_required, true);
  assert.equal(validateCurriculum(a).valid, true);
});
test('visual readings cannot be declared explicit or synthesized authority', async () => {
  for (const authority of ['EXPLICIT_SOURCE_CONTENT', 'SOURCE_GROUNDED_SYNTHESIS']) {
    await assert.rejects(generate([{ role: 'explanation', text: 'There appear to be 12 pictured blocks.', authority, evidence_kind: 'VISUAL_READING', visual: { status: 'VISUAL_DEPENDENCY', description: '' } }]), { code: 'OUTPUT_INVALID' });
  }
});
test('text-mode request retains page text, defers visuals, and binds arbitrary configured identity', async () => {
  await generate([{ role: 'activity', text: excerpts.activity, student_completion: true }], body => {
    const parts = body.contents[0].parts;
    assert.equal(parts.some(p => p.inlineData), false);
    assert.ok(parts[0].text.includes(excerpts.exercise));
    assert.match(parts[0].text, /Exact visual reconstruction is NOT required/);
    assert.deepEqual(body.generationConfig.responseJsonSchema.properties.grade.enum, ['Third cycle']);
    assert.deepEqual(body.generationConfig.responseJsonSchema.properties.book_id.enum, [identity.bookId]);
  });
});

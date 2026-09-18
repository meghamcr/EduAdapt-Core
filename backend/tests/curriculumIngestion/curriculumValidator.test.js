const test = require("node:test");
const assert = require("node:assert/strict");
const { validateCurriculum } = require("../../src/services/curriculumIngestion/curriculumValidator");
const { curriculum } = require("./fixtures/helpers");

test("accepts grade labels and integers without a prescribed range", () => {
  for (const grade of ["Foundation", "Year thirteen", "大学", 0, 13, 100]) assert.equal(validateCurriculum(curriculum({ grade })).valid, true);
});
test("malformed JSON types return structural errors without throwing", () => {
  const badValues = [null, [], 42, false, {}, { board: [] }];
  for (const value of badValues) {
    const result = validateCurriculum(value);
    assert.equal(result.valid, false); assert.ok(result.stats);
  }
  for (const field of ["board", "subject", "book_id", "book", "chapter_id", "chapter", "grade", "chapter_number"]) {
    for (const value of [null, {}, [], true]) assert.equal(validateCurriculum(curriculum({ [field]: value })).valid, false);
  }
  for (const field of ["id", "title", "type", "content", "description", "parent_id", "order"]) {
    for (const value of [null, {}, [], true]) {
      const input = curriculum(); input.nodes[1][field] = value;
      assert.equal(validateCurriculum(input).valid, false);
    }
  }
});
test("requires integer chapter and sibling order values", () => {
  for (const order of [1.5, 0, -1, "1", Number.MAX_SAFE_INTEGER + 1]) {
    const input = curriculum(); input.nodes[1].order = order;
    assert.equal(validateCurriculum(input).valid, false);
  }
  assert.equal(validateCurriculum(curriculum({ chapter_number: 1.5 })).valid, false);
});
test("rejects duplicate IDs, orphan parents, self-parenting, cycles and extra roots", () => {
  for (const mutate of [
    input => { input.nodes[1].id = "root"; },
    input => { input.nodes[1].parent_id = "missing"; },
    input => { input.nodes[1].parent_id = "worked"; },
    input => { input.nodes[0].parent_id = "worked"; },
    input => { input.nodes[1].parent_id = ""; },
    input => { input.nodes[0].type = "topic"; }
  ]) { const input = curriculum(); mutate(input); assert.equal(validateCurriculum(input).valid, false); }
});
test("quality warnings stay separate from structural errors", () => {
  const input = curriculum(); input.nodes[1].content = input.nodes[0].content;
  input.nodes.push({ ...input.nodes[1], id: "another" });
  const result = validateCurriculum(input);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(w => w.includes("Identical substantial content")));
  assert.ok(result.warnings.some(w => w.includes("Duplicate sibling order")));
  const short = curriculum(); short.nodes[1].content = "A short fact.";
  assert.equal(validateCurriculum(short).valid, true);
  assert.ok(validateCurriculum(short).warnings.length);
});
test("objectives are never silently coerced; absent objectives are review warnings", () => {
  assert.equal(validateCurriculum(curriculum({ learning_objectives: [{}] })).valid, false);
  const empty = validateCurriculum(curriculum({ learning_objectives: [] }));
  assert.equal(empty.valid, true); assert.ok(empty.warnings.some(w => w.includes("objectives")));
});
test("arbitrary deep hierarchy is traversed without recursive stack calls", () => {
  const input = curriculum(); input.nodes = [input.nodes[0]];
  for (let i = 1; i < 1500; i++) input.nodes.push({ ...input.nodes[0], id: `n${i}`, parent_id: i === 1 ? "root" : `n${i - 1}`, type: "concept", title: `Concept ${i}` });
  const result = validateCurriculum(input);
  assert.equal(result.valid, true); assert.equal(result.stats.maximumDepth, 1499);
});

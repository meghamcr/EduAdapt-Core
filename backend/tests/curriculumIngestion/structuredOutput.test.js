const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { parseCurriculum } = require("../../src/services/curriculumIngestion/curriculumParser");
const { curriculumResponseSchema } = require("../../src/services/curriculumIngestion/curriculumResponseSchema");
const { runIngestion } = require("../../src/services/curriculumIngestion/ingestCurriculum");
const { identity, modelOutput, workspace } = require("./fixtures/helpers");
const input = { ...identity, extractedText: "Synthetic question: Which grouping would you choose?", model: "fixture-model", apiKey: "PRIVATE_TEST_SENTINEL" };
function provider(text, finishReason = "STOP", extra = {}) {
  return { ok: true, status: 200, headers: { get: () => "application/json; charset=utf-8" }, text: async () => JSON.stringify({
    candidates: [{ finishReason, content: { parts: [{ text: typeof text === "string" ? text : JSON.stringify(text) }] } }],
    usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 456, totalTokenCount: 579, thoughtsTokenCount: 10 }, ...extra
  }) };
}
const parse = (text, finishReason, extra) => parseCurriculum(input, { fetchImpl: async () => provider(text, finishReason, extra) });
test("native JSON schema uses supported bounded wire structure without recursive schema or fixed hierarchy", async () => {
  let body;
  const a = await parseCurriculum(input, { fetchImpl: async (_, opts) => { body = JSON.parse(opts.body); return provider(modelOutput()); } });
  assert.equal(a.nodes.length, 2); const c = body.generationConfig;
  assert.equal(c.responseMimeType, "application/json"); assert.deepEqual(c.responseJsonSchema, curriculumResponseSchema(false));
  const schema = curriculumResponseSchema(true); assert.ok(schema.required.includes("objective_evidence"));
  const node = schema.properties.nodes.items; assert.ok(node.required.includes("materials")); assert.equal(node.properties.content, undefined);
  assert.equal(JSON.stringify(schema).includes("$ref"), false); assert.ok(JSON.stringify(schema).length < 6000);
});
test("balanced Markdown wrapper is removed without modifying strings or educational content", async () => {
  const output = modelOutput(); output.nodes[1].content = 'Preserve literal braces { }, quotes "x", and code ``` as source text.';
  const a = await parse('```json\n'+JSON.stringify(output)+'\n```'); assert.equal(a.nodes[1].content, output.nodes[1].content);
});
test("prose wrappers, trailing prose, unmatched fences and malformed syntax are rejected without repair", async () => {
  for (const text of ['Here is the curriculum:\n'+JSON.stringify(modelOutput()), JSON.stringify(modelOutput())+'\nExplanation', '```json\n'+JSON.stringify(modelOutput()), '{"nodes": [}', '{"text":"unterminated']) {
    await assert.rejects(parse(text), e => e.code === "OUTPUT_JSON_INVALID" && e.diagnostics.stage === "curriculum_json");
  }
});
test("provider truncation retains finish reason and usage; never accepted even with syntactically valid JSON", async () => {
  for (const text of [modelOutput(), '{"nodes": [']) await assert.rejects(parse(text, "MAX_TOKENS"), e => {
    assert.equal(e.code, "OUTPUT_TRUNCATED"); assert.equal(e.diagnostics.finishReason, "MAX_TOKENS");
    assert.equal(e.diagnostics.usage.candidatesTokenCount, 456); assert.equal(e.diagnostics.httpStatus, 200); return true;
  });
});
test("STOP plus unterminated JSON records syntax evidence without falsely claiming provider truncation", async () => {
  await assert.rejects(parse('{"nodes":['), e => {
    assert.equal(e.code, "OUTPUT_JSON_INVALID"); assert.equal(e.diagnostics.finishReason, "STOP");
    assert.equal(e.diagnostics.jsonFailureKind, "UNEXPECTED_END_OR_UNTERMINATED_STRING"); return true;
  });
});
test("missing top-level structures are rejected after JSON syntax stage", async () => {
  for (const output of [{}, [], { ...modelOutput(), nodes: undefined }, { ...modelOutput(), learning_objectives: undefined }]) {
    await assert.rejects(parse(output), e => e.diagnostics.stage === "curriculum_contract" && e.code !== "OUTPUT_JSON_INVALID");
  }
});
test("incomplete finish reasons and missing candidates are rejected with safe metadata", async () => {
  await assert.rejects(parse(modelOutput(), "SAFETY"), e => e.code === "OUTPUT_INCOMPLETE" && e.diagnostics.finishReason === "SAFETY");
  await assert.rejects(parse(modelOutput(), "STOP", { candidates: [] }), e => e.code === "OUTPUT_INCOMPLETE" && e.diagnostics.candidatePresent === false);
});
test("metadata excludes unknown provider labels, extra usage fields and sensitive parse excerpts", async () => {
  await assert.rejects(parse(input.apiKey, "STOP", { usageMetadata: { promptTokenCount: 8, candidatesTokenCount: input.apiKey, arbitrary: input.apiKey } }), e => {
    const serialized = JSON.stringify(e); assert.equal(serialized.includes(input.apiKey), false);
    assert.deepEqual(e.diagnostics.usage, { promptTokenCount: 8 }); assert.equal(e.diagnostics.returnedTextCharacters, input.apiKey.length); return true;
  });
  await assert.rejects(parse(modelOutput(), input.apiKey), e => e.diagnostics.finishReason === "UNKNOWN" && !JSON.stringify(e).includes(input.apiKey));
});
test("valid output retains success diagnostics without changing curriculum fields", async () => {
  let d;
  await parseCurriculum(input, { onDiagnostics: value => { d = value; }, fetchImpl: async () => provider(modelOutput()) });
  assert.equal(d.stage, "complete"); assert.equal(d.responseMimeType, "application/json");
  assert.equal(d.candidateTextPresent, true); assert.equal(d.structuredSchemaRequested, true); assert.ok(d.requestBytes > 0);
});
test("source/inference materials and visual/page provenance survive schema-constrained parsing", async () => {
  const sourceContext = { version: 1, mode: "pdf", documents: [{ sourceId: "source-1", sha256: "a".repeat(64), pages: [{ page: 7, text: "Compare the figures; explain your choice." }] }], mediaParts: [] };
  const options = { ...input, sourceContext }; const output = modelOutput(options);
  output.nodes[1].materials[0].visual = { status: "VISUAL_UNRESOLVED", description: "Companion cards not provided." };
  output.nodes[1].materials.push({ ...output.nodes[1].materials[0], authority: "MODEL_INFERENCE", evidence_kind: "DEDUCTION", text: "A separate conjecture." });
  const a = await parseCurriculum(options, { fetchImpl: async () => provider(output) });
  assert.equal(a.nodes[1].review_inferences[0].text, "A separate conjecture.");
  assert.equal(a.nodes[1].content.includes("conjecture"), false); assert.equal(a.nodes[1].materials[0].source_refs[0].page, 7);
  assert.equal(a.nodes[1].materials[0].visual.status, "VISUAL_UNRESOLVED"); assert.equal(a.objective_evidence[0][0].page, 7);
});
test("malformed JSON and invalid curriculum never write artifacts; safe diagnostics reach summary", async t => {
  for (const schemaInvalid of [false, true]) {
    const f = await workspace(t); const events = [];
    const summary = await runIngestion(f.configPath, {}, { log: e => events.push(e), parseCurriculum: (args, opts) => {
      const output = modelOutput(args); output.nodes[1].parent_temp_id = "missing";
      return parseCurriculum({ ...args, apiKey: input.apiKey }, { ...opts, fetchImpl: async () => provider(schemaInvalid ? output : '{"nodes":[') });
    } });
    assert.equal(summary.failed, 1); await assert.rejects(fs.access(f.outputPath), { code: "ENOENT" });
    assert.equal(summary.results[0].error.code, schemaInvalid ? "OUTPUT_INVALID" : "OUTPUT_JSON_INVALID");
    assert.equal(summary.results[0].error.diagnostics.httpStatus, 200);
    const saved = await fs.readFile(require("node:path").join(f.directory, "output/ingestion-summary.json"), "utf8");
    assert.equal(saved.includes(input.apiKey), false); assert.equal(JSON.stringify(events).includes(input.apiKey), false);
  }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCurriculum, callGemini } = require("../../src/services/curriculumIngestion/curriculumParser");
const { withGeminiRetry, IngestionError } = require("../../src/services/curriculumIngestion/geminiRetry");
const { identity, curriculum, modelOutput, response } = require("./fixtures/helpers");
const input = { ...identity, extractedText: "12 / 3 = 4. Preserve this worked example.", model: "fixture-model", apiKey: "TEST_ONLY_NOT_A_KEY" };

test("model selection and source-preserving prompt; key stays out of URL/body", async () => {
  let request;
  const parsed = await parseCurriculum(input, { fetchImpl: async (url, options) => { request = { url, options }; return response(modelOutput()); } });
  assert.ok(request.url.includes("fixture-model:generateContent"));
  assert.equal(request.url.includes(input.apiKey), false);
  assert.equal(request.options.body.includes(input.apiKey), false);
  assert.equal(request.options.headers["x-goog-api-key"], input.apiKey);
  const prompt = JSON.parse(request.options.body).contents[0].parts[0].text;
  for (const fragment of [input.extractedText, "worked examples", "tables", "DO NOT reduce", "Do NOT turn every paragraph"]) assert.ok(prompt.includes(fragment));
  assert.equal(parsed.nodes[1].content, curriculum().nodes[1].content);
  assert.equal(parsed.nodes[1].parent_id, parsed.nodes[0].id);
});
test("node IDs remain stable across flat-array reorder and temp-ID renaming", async () => {
  const one = await parseCurriculum(input, { fetchImpl: async () => response(modelOutput()) });
  const changed = modelOutput(); changed.nodes.reverse();
  for (const node of changed.nodes) { node.temp_id = `new-${node.temp_id}`; if (node.parent_temp_id) node.parent_temp_id = `new-${node.parent_temp_id}`; }
  const two = await parseCurriculum(input, { fetchImpl: async () => response(changed) });
  assert.deepEqual(one.nodes.map(n => n.id).sort(), two.nodes.map(n => n.id).sort());
});
test("different boards/books/chapters cannot reuse the same node namespace", async () => {
  const ids = new Set();
  for (const change of [{}, { board: "Another Board" }, { bookId: "book-two" }, { chapterId: "chapter-two" }, { grade: "Advanced" }]) {
    const options = { ...input, ...change };
    const result = await parseCurriculum(options, { fetchImpl: async () => response(modelOutput(options)) });
    ids.add(result.nodes[0].id);
  }
  assert.equal(ids.size, 5);
});
test("rejects truncation, missing finish reason, blocked and malformed outputs", async () => {
  for (const reason of ["MAX_TOKENS", "SAFETY", "RECITATION", "FINISH_REASON_UNSPECIFIED"]) {
    await assert.rejects(parseCurriculum(input, { fetchImpl: async () => response(modelOutput(), reason) }), error => ["OUTPUT_TRUNCATED", "OUTPUT_INCOMPLETE"].includes(error.code));
  }
  await assert.rejects(parseCurriculum(input, { fetchImpl: async () => ({ ok: true, text: async () => '{"candidates":[{"content":{"parts":[]}}]}' }) }), { code: "OUTPUT_INCOMPLETE" });
  await assert.rejects(parseCurriculum(input, { fetchImpl: async () => response('{"nodes":[') }), { code: "OUTPUT_JSON_INVALID" });
  await assert.rejects(parseCurriculum(input, { fetchImpl: async () => response({ ...modelOutput(), source_coverage_complete: false }) }), { code: "OUTPUT_INCOMPLETE" });
});
test("rejects identity drift and invalid hierarchy without inventing fields", async () => {
  for (const output of [
    { ...modelOutput(), board: "Wrong board" },
    { ...modelOutput(), nodes: [null] },
    { ...modelOutput(), nodes: [{ ...modelOutput().nodes[0], order: 1.5 }] },
    { ...modelOutput(), nodes: [{ ...modelOutput().nodes[0], content: {} }] }
  ]) await assert.rejects(parseCurriculum(input, { fetchImpl: async () => response(output) }), error => error instanceof IngestionError && !error.retryable);
});
test("HTTP failures are structured and never include raw provider responses", async () => {
  for (const [status, retryable] of [[400, false], [401, false], [404, false], [429, true], [503, true]]) {
    await assert.rejects(callGemini("prompt", { ...input, fetchImpl: async () => ({ ok: false, status, headers: { get: () => "2" }, text: async () => input.apiKey }) }), error => {
      assert.equal(error.status, status); assert.equal(error.retryable, retryable);
      assert.equal(error.retryAfterMs, 2000); assert.equal(JSON.stringify(error).includes(input.apiKey), false); return true;
    });
  }
});
test("timeouts abort requests and expose a retryable code", async () => {
  await assert.rejects(callGemini("prompt", { ...input, timeoutMs: 5, fetchImpl: (_, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("private detail"), { name: "AbortError" })))) }), { code: "API_TIMEOUT", retryable: true });
});
test("bounded retry honors capped retry-after; permanent errors are not retried", async () => {
  let attempts = 0; const delays = [];
  const value = await withGeminiRetry(() => {
    attempts++; if (attempts < 3) throw new IngestionError("API_HTTP", "temporary", { retryable: true, status: 503, retryAfterMs: 999 }); return "done";
  }, { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 10, retryHttpStatuses: [503] }, { sleep: async delay => delays.push(delay) });
  assert.equal(value, "done"); assert.equal(attempts, 3); assert.deepEqual(delays, [10, 10]);
  attempts = 0;
  await assert.rejects(withGeminiRetry(() => { attempts++; throw new IngestionError("OUTPUT_TRUNCATED", "stop"); }, {}, { sleep: async () => {} }), { code: "OUTPUT_TRUNCATED" });
  assert.equal(attempts, 1);
  attempts = 0;
  await assert.rejects(withGeminiRetry(() => { attempts++; throw new IngestionError("API_TIMEOUT", "timeout", { retryable: true }); }, { maxAttempts: 2 }, { sleep: async () => {} }));
  assert.equal(attempts, 2);
});

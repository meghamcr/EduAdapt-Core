const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { extractPdf } = require("../../src/services/curriculumIngestion/pdfExtractor");
const { buildSourceContext } = require("../../src/services/curriculumIngestion/sourceContext");
const { fingerprint } = require("../../src/services/curriculumIngestion/curriculumIdentity");
const { parseCurriculum, callGemini } = require("../../src/services/curriculumIngestion/curriculumParser");
const { validateCurriculum } = require("../../src/services/curriculumIngestion/curriculumValidator");
const { withGeminiRetry, IngestionError } = require("../../src/services/curriculumIngestion/geminiRetry");
const { runIngestion } = require("../../src/services/curriculumIngestion/ingestCurriculum");
const { identity, modelOutput, response, workspace } = require("./fixtures/helpers");
const fixture = path.join(__dirname, "fixtures/source-chapter.pdf");
async function context(pages) {
  const data = await fs.readFile(fixture);
  const extraction = await extractPdf(fixture, { pages: pages || null, minCharacters: 1 });
  return buildSourceContext([{ data, sha256: fingerprint(data) }], [extraction]);
}
async function generate(mutate = () => {}, inspect = () => {}) {
  const sourceContext = await context([1]);
  const input = { ...identity, extractedText: "Question: How many? Fill the table: Count | ___.", sourceContext, model: "fixture", apiKey: "TEST_SECRET" };
  const output = modelOutput(input); mutate(output);
  return parseCurriculum(input, { fetchImpl: async (url, options) => { inspect(JSON.parse(options.body), url); return response(output); } });
}
test("page-aware context preserves document identity and original noninitial page numbers", async () => {
  const c = await context([2]);
  assert.equal(c.documents[0].pages[0].page, 2);
  assert.ok(c.documents[0].pages[0].text);
  assert.deepEqual(JSON.parse(c.mediaParts[0].text).originalPdfPages, [2]);
  assert.equal((await PDFDocument.load(Buffer.from(c.mediaParts[1].inlineData.data, "base64"))).getPageCount(), 1);
});
test("whole PDF bytes stay unchanged; multiple documents have separate page namespaces", async () => {
  const c = await context(); assert.deepEqual(Buffer.from(c.mediaParts[1].inlineData.data, "base64"), await fs.readFile(fixture));
  const data = await fs.readFile(fixture), extracted = await extractPdf(fixture);
  const multi = await buildSourceContext([{ data, sha256: fingerprint(data) }, { data, sha256: fingerprint(data) }], [extracted, extracted]);
  assert.deepEqual(multi.documents.map(d => d.sourceId), ["source-1", "source-2"]);
});
test("REST request contains original PDF and page-aware source contract, never key in body/URL", async () => {
  await generate(() => {}, (body, url) => {
    assert.ok(body.contents[0].parts.some(p => p.inlineData?.mimeType === "application/pdf"));
    const prompt = body.contents[0].parts[0].text;
    assert.match(prompt, /QUESTION -> ANSWER/); assert.match(prompt, /BLANK STUDENT TABLE -> FILLED ANSWER KEY/);
    assert.ok(body.contents[0].parts.some(p => p.text && p.text.includes('"originalPdfPages":[1]'))); assert.match(prompt, /Parent titles must cover ALL/);
    assert.equal(JSON.stringify(body).includes("TEST_SECRET"), false); assert.equal(url.includes("TEST_SECRET"), false);
  });
});
test("questions, blank tables and substantial activity instructions remain tasks without generated answers", async () => {
  const a = await generate(o => { o.nodes[1].materials = [
    { ...o.nodes[1].materials[0], role: "question", student_completion: true, text: "How many counters are shown? ___" },
    { ...o.nodes[1].materials[0], role: "table", student_completion: true, text: "Complete the table.\n| Group | Count |\n| A | ___ |" },
    { ...o.nodes[1].materials[0], role: "activity", student_completion: true, text: "Build a model. Trace it. Compare with your partner. Explain your sorting rule." }
  ]; });
  assert.match(a.nodes[1].content, /\| A \| ___ \|/); assert.match(a.nodes[1].content, /How many counters are shown\? ___/);
  assert.match(a.nodes[1].content, /Explain your sorting rule/); assert.equal(a.nodes[1].materials.length, 3);
});
test("inferences are quarantined, never included in authoritative content", async () => {
  const a = await generate(o => o.nodes[1].materials.push({ ...o.nodes[1].materials[0], authority: "MODEL_INFERENCE", evidence_kind: "DEDUCTION", text: "Hypothetical inferred answer: 999." }));
  assert.equal(a.nodes[1].review_inferences.length, 1); assert.equal(a.nodes[1].content.includes("999"), false);
  assert.ok(validateCurriculum(a).warnings.some(w => w.startsWith("MODEL_INFERENCE")));
});
test("unresolved visual dependencies persist and warn; cannot be silently promoted to resolved fidelity", async () => {
  const a = await generate(o => { o.nodes[1].materials[0].visual = { status: "VISUAL_UNRESOLVED", description: "External shape cards are not supplied." }; });
  assert.ok(validateCurriculum(a).warnings.some(w => w.includes("VISUAL_UNRESOLVED")));
  assert.equal(a.nodes[1].materials[0].visual.status, "VISUAL_UNRESOLVED");
});
test("rejects missing evidence, invalid page, unsupported authority and answer-key completion contradiction", async () => {
  for (const mutate of [o => delete o.objective_evidence, o => o.nodes[0].materials[0].source_refs[0].page = 999,
    o => o.nodes[0].materials[0].authority = "TRUST_ME",
    o => { o.nodes[0].materials[0].role = "source_provided_answer"; o.nodes[0].materials[0].student_completion = true; }]) {
    await assert.rejects(generate(mutate), { code: "OUTPUT_INVALID" });
  }
  const a = await generate(); a.nodes[1].content += " An ungrounded addition.";
  assert.equal(validateCurriculum(a).valid, false);
});
test("fatal HTTP default never retries; explicit transient policy retains status without secrets", async () => {
  let calls = 0;
  await assert.rejects(withGeminiRetry(() => { calls++; throw new IngestionError("API_HTTP", "HTTP 503", { status: 503, retryable: true }); }), { status: 503 });
  assert.equal(calls, 1); const events = []; calls = 0;
  const result = await withGeminiRetry(() => { if (++calls < 2) throw new IngestionError("API_HTTP", "HTTP 503", { status: 503, retryable: true }); return "ok"; },
    { retryHttpStatuses: [503], baseDelayMs: 0 }, { sleep: async () => {}, onRetry: e => events.push(e) });
  assert.equal(result, "ok"); assert.equal(events[0].status, 503);
  for (const retryNetwork of [false, true]) { calls = 0; await assert.rejects(withGeminiRetry(() => { calls++; throw new IngestionError("API_NETWORK", "network", { retryable: true }); }, { retryNetwork, maxAttempts: 2 }, { sleep: async () => {} })); assert.equal(calls, retryNetwork ? 2 : 1); }
});
test("fatal provider error stops remaining runner targets and retains safe diagnostic status", async t => {
  const f = await workspace(t, c => { c.books[0].chapters.push({ chapterId: "later", chapterNumber: 2, pdfPath: "unusual source name.pdf" }); return c; });
  const events = []; let calls = 0;
  const summary = await runIngestion(f.configPath, {}, { log: e => events.push(e), parseCurriculum: async () => { calls++; throw new IngestionError("API_HTTP", "Gemini returned HTTP 403.", { status: 403 }); } });
  assert.equal(calls, 1); assert.equal(summary.notAttempted, 1); assert.equal(summary.results[0].error.status, 403); assert.equal(events[0].httpStatus, 403);
});
test("oversized inline request fails before transport; provider bodies remain secret", async () => {
  await assert.rejects(callGemini("p", { model: "fixture", apiKey: "secret", mediaParts: [{ text: "x".repeat(19 * 1024 * 1024) }], fetchImpl: () => assert.fail("No request") }), { code: "SOURCE_TOO_LARGE" });
  await assert.rejects(callGemini("p", { model: "fixture", apiKey: "secret", fetchImpl: async () => ({ ok: false, status: 401, text: () => assert.fail("Never read raw provider error body") }) }), e => e.status === 401 && !JSON.stringify(e).includes("secret"));
});
test("visual-only PDF pages remain available without default OCR or invented text", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage().drawRectangle({ x: 20, y: 20, width: 40, height: 40 });
  const data = Buffer.from(await pdf.save());
  const x = await extractPdf("synthetic-visual.pdf", { data, allowEmptyText: true });
  assert.equal(x.pages[0].text, ""); assert.ok(x.warnings.some(w => w.code === "EMPTY_PAGES"));
  const c = await buildSourceContext([{ data, sha256: fingerprint(data) }], [x]);
  assert.deepEqual(Buffer.from(c.mediaParts[1].inlineData.data, "base64"), data);
  await assert.rejects(extractPdf("synthetic-visual.pdf", { data }), { code: "PDF_NO_TEXT" });
});
test("missing page coverage is structural failure and malformed fidelity metadata cannot throw", async () => {
  const a = await generate(); a.source_context.documents[0].pages.push(2);
  assert.ok(validateCurriculum(a).errors.some(e => e.includes("not represented")));
  for (const value of [null, [], 4, { version: 1, mode: "pdf", documents: [null] }]) {
    assert.doesNotThrow(() => validateCurriculum({ ...a, source_context: value }));
    assert.equal(validateCurriculum({ ...a, source_context: value }).valid, false);
  }
});
test("malformed material roles cannot throw during content comparison; unknown failures never retry", async () => {
  const a = await generate(); a.nodes[0].materials[0].role = { toString: "invalid" };
  assert.doesNotThrow(() => validateCurriculum(a)); assert.equal(validateCurriculum(a).valid, false);
  let calls = 0;
  try { await withGeminiRetry(() => { calls++; throw null; }); assert.fail("Expected rejection"); }
  catch (error) { assert.equal(error, null); }
  assert.equal(calls, 1);
});

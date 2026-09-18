const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFDocument } = require("pdf-lib");
const { buildSourceContext } = require("../../src/services/curriculumIngestion/sourceContext");
const { extractPdf } = require("../../src/services/curriculumIngestion/pdfExtractor");
const { parseCurriculum } = require("../../src/services/curriculumIngestion/curriculumParser");
const { measureRequestPayload } = require("../../src/services/curriculumIngestion/requestPayload");
const { fingerprint } = require("../../src/services/curriculumIngestion/curriculumIdentity");
const { FIDELITY_INSTRUCTIONS } = require("../../src/services/curriculumIngestion/sourceFidelity");
const { identity, modelOutput, response } = require("./fixtures/helpers");
const fixture = path.join(__dirname, "fixtures/source-chapter.pdf");
async function prepare(selections = [null], mode = "pdf") {
  const data = await fs.readFile(fixture);
  const sources = selections.map(pages => ({ data, pages, sha256: fingerprint(data) }));
  const extractions = await Promise.all(selections.map(pages => extractPdf(fixture, { data, pages, minCharacters: 1 })));
  return { data, extractions, sourceContext: await buildSourceContext(sources, extractions, mode) };
}
async function capture(prepared) {
  let request, calls = 0;
  const input = { ...identity, sourceContext: prepared.sourceContext, extractedText: prepared.extractions.map(e => e.text).join("\n\n"), model: "fixture", apiKey: "LOCAL_SENTINEL" };
  const artifact = await parseCurriculum(input, { fetchImpl: async (_url, options) => { calls++; request = JSON.parse(options.body); return response(modelOutput(input)); } });
  assert.equal(calls, 1); return { request, artifact };
}
test("PDF mode attaches the original PDF once and omits full extracted text from all text parts", async () => {
  const prepared = await prepare(); const { request, artifact } = await capture(prepared);
  const parts = request.contents[0].parts, media = parts.filter(p => p.inlineData);
  assert.equal(media.length, 1); assert.deepEqual(Buffer.from(media[0].inlineData.data, "base64"), prepared.data);
  const modelText = parts.filter(p => p.text).map(p => p.text).join("\n");
  for (const page of prepared.sourceContext.documents[0].pages) assert.equal(modelText.includes(page.text), false);
  assert.ok(prepared.sourceContext.documents[0].pages.every(p => p.text.length > 0));
  assert.ok(modelText.includes(FIDELITY_INSTRUCTIONS)); assert.ok(request.generationConfig.responseJsonSchema);
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(artifact.source_context.documents[0].pages, [1, 2]);
  assert.equal(artifact.source_context.documents[0].sha256, fingerprint(prepared.data));
});
test("compact selected-page map resolves attachment position to original page and excludes other pages", async () => {
  const { request, artifact } = await capture(await prepare([[2]]));
  const parts = request.contents[0].parts;
  assert.deepEqual(JSON.parse(parts[1].text), { sourceId: "source-1", originalPdfPages: [2] });
  assert.equal((await PDFDocument.load(Buffer.from(parts[2].inlineData.data, "base64"))).getPageCount(), 1);
  assert.equal(artifact.nodes[0].materials[0].source_refs[0].page, 2);
  assert.match(parts[0].text, /nth array entry is the original 1-based PDF page of attachment page n/);
});
test("multiple sources keep distinct namespaces and exactly one attachment per configured source", async () => {
  const { request, artifact } = await capture(await prepare([[1], [2]]));
  const parts = request.contents[0].parts;
  assert.equal(parts.filter(p => p.inlineData).length, 2);
  assert.deepEqual([JSON.parse(parts[1].text), JSON.parse(parts[3].text)], [
    { sourceId: "source-1", originalPdfPages: [1] }, { sourceId: "source-2", originalPdfPages: [2] }
  ]);
  assert.deepEqual(artifact.objective_evidence[0], [{ sourceId: "source-1", page: 1 }, { sourceId: "source-2", page: 2 }]);
});
test("text-only mode retains full labelled text once and does not silently discard its only source", async () => {
  const p = await prepare([[1]], "text"), { request } = await capture(p);
  const parts = request.contents[0].parts;
  assert.equal(parts.filter(p => p.inlineData).length, 0);
  const block = JSON.stringify({ mode: "text", documents: p.sourceContext.documents });
  assert.equal(parts[0].text.split(block).length - 1, 1);
});
test("request metrics exactly partition UTF-8 bytes and contain no source, credentials or bodies", async () => {
  const { request } = await capture(await prepare());
  // Include multibyte text and JSON escaping to exercise serialized accounting.
  request.contents[0].parts[0].text += '\nPRIVATE_SOURCE_SENTINEL "café" \\ example';
  const stats = measureRequestPayload(request);
  assert.equal(stats.totalBytes, Buffer.byteLength(JSON.stringify(request)));
  assert.equal(stats.totalBytes, stats.pdfBase64Bytes + stats.promptTextBytes + stats.attachmentMetadataBytes + stats.schemaBytes + stats.envelopeBytes);
  assert.equal(stats.pdfAttachments, 1); assert.ok(Object.values(stats).every(Number.isSafeInteger));
  assert.equal(JSON.stringify(stats).includes("PRIVATE_SOURCE_SENTINEL"), false);
  assert.equal(JSON.stringify(stats).includes("LOCAL_SENTINEL"), false);
});

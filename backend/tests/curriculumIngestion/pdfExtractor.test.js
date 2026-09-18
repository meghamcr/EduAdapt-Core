const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { extractPdf, cleanExtractedText } = require("../../src/services/curriculumIngestion/pdfExtractor");
const { workspace } = require("./fixtures/helpers");
const fixture = path.join(__dirname, "fixtures/source-chapter.pdf");

test("real synthetic PDF preserves worked examples, activities and selected pages", async () => {
  const first = await extractPdf(fixture, { pages: [1], minCharacters: 1 });
  assert.equal(first.pageCount, 2); assert.deepEqual(first.selectedPages, [1]);
  for (const text of ["12 / 3 = 4", "Worked example", "Activity", "Observation", "Table:"]) assert.ok(first.text.includes(text));
  assert.equal(first.text.includes("Measure and compare"), false);
  const all = await extractPdf(fixture, { minCharacters: 1 });
  assert.ok(all.text.includes("Measure and compare")); assert.equal(all.stats.extractedPages, 2);
  assert.ok(all.stats.fileSizeBytes > 0);
});
test("normalization preserves indentation, table spacing and line boundaries", () => {
  assert.equal(cleanExtractedText("Heading\r\n  12 + 3  \r\n  ------\r\nA\tB\u00a0C\u0000\n\n\n\nEnd"), "Heading\n  12 + 3\n  ------\nA\tB C\n\n\nEnd");
  assert.equal(cleanExtractedText("\n\n    12\n  +  3\n  ----\n    15\n"), "    12\n  +  3\n  ----\n    15");
});
test("rejects unavailable/empty/corrupt PDFs and invalid page selections", async t => {
  const { directory } = await workspace(t);
  await assert.rejects(extractPdf(path.join(directory, "absent.pdf")), { code: "PDF_READ_FAILED" });
  await assert.rejects(extractPdf("file.txt"), { code: "PDF_INPUT_INVALID" });
  await assert.rejects(extractPdf(fixture, { data: Buffer.alloc(0) }), { code: "PDF_EMPTY" });
  await assert.rejects(extractPdf(fixture, { data: Buffer.from("not a PDF") }), { code: "PDF_EXTRACTION_FAILED" });
  for (const pages of [[0], [2, 1], [1, 1], []]) await assert.rejects(extractPdf(fixture, { pages }), { code: "PDF_INPUT_INVALID" });
  await assert.rejects(extractPdf(fixture, { pages: [3] }), { code: "PDF_PAGE_RANGE" });
  assert.ok((await extractPdf(fixture, { minCharacters: 100000 })).warnings.some(w => w.code === "LOW_TEXT"));
  assert.ok((await fs.stat(fixture)).size > 0);
});

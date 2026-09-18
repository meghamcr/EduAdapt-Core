const { PDFDocument } = require("pdf-lib");
const { IngestionError } = require("./geminiRetry");

// Keep original PDF bytes for whole documents; copy only approved pages for subsets.
// No OCR, diagram reconstruction, remote file persistence or source-file mutation.
async function buildSourceContext(sources, extractions, mode = "pdf") {
  const documents = [], mediaParts = [];
  if (!["pdf", "text"].includes(mode)) throw new IngestionError("CONFIG_INVALID", "sourceMode must be pdf or text.");
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i], extracted = extractions[i];
    const sourceId = `source-${i + 1}`;
    const pages = extracted.pages;
    if (!Array.isArray(pages) || !pages.length) throw new IngestionError("SOURCE_CONTEXT_INVALID", "Extraction requires page-level text.");
    documents.push({ sourceId, sha256: source.sha256, pages });
    if (mode === "pdf") {
      let bytes = source.data;
      if (pages.length !== extracted.pageCount) {
        const original = await PDFDocument.load(source.data);
        const subset = await PDFDocument.create();
        for (const page of await subset.copyPages(original, pages.map(p => p.page - 1))) subset.addPage(page);
        bytes = Buffer.from(await subset.save());
      }
      if (pages.length > 1000) throw new IngestionError("SOURCE_TOO_LARGE", "A PDF attachment exceeds 1000 pages; select a smaller source range.");
      mediaParts.push({ text: JSON.stringify({ sourceId, originalPdfPages: pages.map(p => p.page) }) },
        { inlineData: { mimeType: "application/pdf", data: bytes.toString("base64") } });
    }
  }
  return { version: 1, mode, documents, mediaParts };
}
module.exports = { buildSourceContext };

const fs = require("node:fs/promises");
const path = require("node:path");
const { PDFParse } = require("pdf-parse");
const { IngestionError } = require("./geminiRetry");

async function extractPdf(pdfPath, { pages = null, minCharacters = 500, data, allowEmptyText = false } = {}) {
  if (typeof pdfPath !== "string" || !pdfPath.trim() || path.extname(pdfPath).toLowerCase() !== ".pdf") {
    throw new IngestionError("PDF_INPUT_INVALID", "A local .pdf path is required.");
  }
  if (pages !== null && (!Array.isArray(pages) || !pages.length || pages.some((page, i) => !Number.isSafeInteger(page) || page < 1 || (i > 0 && page <= pages[i - 1])))) {
    throw new IngestionError("PDF_INPUT_INVALID", "Pages must be increasing unique 1-based integers.");
  }
  if (!Number.isSafeInteger(minCharacters) || minCharacters < 1) throw new IngestionError("PDF_INPUT_INVALID", "minCharacters must be a positive integer.");
  const absolutePath = path.resolve(pdfPath);
  let buffer;
  try { buffer = data === undefined ? await fs.readFile(absolutePath) : data; }
  catch { throw new IngestionError("PDF_READ_FAILED", "Could not read source PDF."); }
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new IngestionError("PDF_EMPTY", "Source PDF must contain bytes.");
  const fileSizeBytes = buffer.length;
  // PDF.js may transfer/detach its input; preserve the runner's source bytes.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const info = await parser.getInfo();
    if (pages && pages.some(page => page > info.total)) throw new IngestionError("PDF_PAGE_RANGE", "Requested page is outside the source PDF.");
    const result = await parser.getText({ ...(pages ? { partial: pages } : {}), pageJoiner: "\n\n" });
    const rawText = typeof result.text === "string" ? result.text : "";
    const text = cleanExtractedText(rawText);
    if (!text && !allowEmptyText) throw new IngestionError("PDF_NO_TEXT", "No readable text was extracted. OCR or a different source is required.");
    const selectedPages = pages || Array.from({ length: info.total }, (_, i) => i + 1);
    const warnings = [];
    if (text.length < minCharacters) warnings.push({ code: "LOW_TEXT", message: `Only ${text.length} characters extracted; inspect the source before proceeding.` });
    const emptyPages = (result.pages || []).filter(page => !cleanExtractedText(page.text)).map(page => page.num);
    if (emptyPages.length) warnings.push({ code: "EMPTY_PAGES", message: `Pages with no extracted text: ${emptyPages.join(", ")}. They may contain scans or illustrations.` });
    return { fileName: path.basename(absolutePath), filePath: absolutePath,
      pageCount: info.total, selectedPages, text, warnings,
      pages: selectedPages.map(page => ({ page, text: cleanExtractedText((result.pages || []).find(item => item.num === page)?.text || "") })),
      stats: { fileSizeBytes, rawCharacters: rawText.length, cleanedCharacters: text.length,
        estimatedWords: countWords(text), paragraphs: countParagraphs(text), extractedPages: selectedPages.length },
      metadata: { title: info.info?.Title || "", author: info.info?.Author || "" } };
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw new IngestionError("PDF_EXTRACTION_FAILED", "Could not extract source PDF; check for corruption, encryption or unsupported content.");
  } finally {
    await parser.destroy();
  }
}

function cleanExtractedText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    // Normalize Windows-style line endings.
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

    // Remove null characters sometimes produced by PDF extraction.
    .replace(/\u0000/g, "")

    // Normalize non-breaking spaces without destroying line structure.
    .replace(/\u00A0/g, " ")

    // Remove trailing spaces on individual lines.
    .split("\n")
    .map(line =>
      line.replace(/[ \t]+$/g, "")
    )
    .join("\n")

    // Avoid huge blocks of meaningless blank lines while preserving
    // paragraph boundaries.
    .replace(/\n{4,}/g, "\n\n\n")

    // Remove boundary blank lines, not the indentation of the first worked line.
    .replace(/^\n+|\n+$/g, "");
}

function countWords(text) {
  if (!text) {
    return 0;
  }

  return text
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function countParagraphs(text) {
  if (!text) {
    return 0;
  }

  return text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)
    .length;
}

module.exports = { extractPdf, cleanExtractedText };

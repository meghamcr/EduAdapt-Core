const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");

async function extractPdf(pdfPath) {
  if (!pdfPath) {
    throw new Error("PDF path is required.");
  }

  const absolutePath = path.resolve(pdfPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `PDF file not found: ${absolutePath}`
    );
  }

  if (
    path.extname(absolutePath).toLowerCase() !== ".pdf"
  ) {
    throw new Error(
      "The supplied file must be a PDF."
    );
  }

  const buffer = fs.readFileSync(absolutePath);

  if (buffer.length === 0) {
    throw new Error(
      `PDF file is empty: ${absolutePath}`
    );
  }

  const parser = new PDFParse({
    data: buffer
  });

  try {
    const result = await parser.getText();

    const rawText =
      typeof result.text === "string"
        ? result.text
        : "";

    const cleanedText =
      cleanExtractedText(rawText);

    if (!cleanedText) {
      throw new Error(
        `No readable text could be extracted from ${path.basename(
          absolutePath
        )}.`
      );
    }

    if (cleanedText.length < 500) {
      console.warn(
        `Warning: Very little text (${cleanedText.length} characters) was extracted from ${path.basename(
          absolutePath
        )}. Verify that this PDF contains machine-readable text.`
      );
    }

    return {
      fileName:
        path.basename(absolutePath),

      filePath:
        absolutePath,

      pageCount:
        Number(result.total) || 0,

      text:
        cleanedText,

      stats: {
        fileSizeBytes:
          buffer.length,

        rawCharacters:
          rawText.length,

        cleanedCharacters:
          cleanedText.length,

        estimatedWords:
          countWords(cleanedText),

        paragraphs:
          countParagraphs(cleanedText)
      },

      metadata: {
        title: "",
        author: "",
        subject: "",
        creator: ""
      }
    };
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

    .trim();
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

module.exports = {
  extractPdf
};
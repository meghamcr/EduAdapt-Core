const fs = require("node:fs/promises");
const path = require("node:path");
const { fingerprint } = require("./curriculumIdentity");
const { IngestionError, validateRetryOptions } = require("./geminiRetry");

function fail(message) { throw new IngestionError("CONFIG_INVALID", message); }
function object(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object.`);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${label} contains unsupported fields.`);
}
function string(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value.trim();
}
function integer(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer in ${min}..${max}.`);
  return value;
}

function normalizeConfig(raw, configPath, env = process.env) {
  object(raw, "Configuration", ["schemaVersion", "outputDirectory", "model", "timeoutMs", "maxOutputTokens", "retry", "extraction", "chapterDelayMs", "books", "sourceMode"]);
  if (raw.schemaVersion !== 1) fail("schemaVersion must be 1.");
  const base = path.dirname(path.resolve(configPath));
  const outputDirectory = path.resolve(base, string(raw.outputDirectory, "outputDirectory"));
  const model = string(raw.model || env.GEMINI_MODEL, "model or GEMINI_MODEL");
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) fail("model must be a Gemini model identifier, not a URL.");
  const sourceMode = raw.sourceMode ?? "pdf";
  if (!["pdf", "text"].includes(sourceMode)) fail("sourceMode must be pdf or text.");
  const timeoutMs = integer(raw.timeoutMs ?? 90000, "timeoutMs", 1, 600000);
  const maxOutputTokens = integer(raw.maxOutputTokens ?? 16384, "maxOutputTokens", 1, 1000000);
  const chapterDelayMs = integer(raw.chapterDelayMs ?? 0, "chapterDelayMs", 0, 300000);
  if (raw.retry !== undefined) object(raw.retry, "retry", ["maxAttempts", "baseDelayMs", "maxDelayMs", "retryNetwork", "retryHttpStatuses", "stopOnHttpError"]);
  const retry = validateRetryOptions(raw.retry);
  const extraction = raw.extraction ?? {};
  object(extraction, "extraction", ["minCharacters", "allowLowText"]);
  const minCharacters = integer(extraction.minCharacters ?? 500, "minCharacters");
  if (extraction.allowLowText !== undefined && typeof extraction.allowLowText !== "boolean") fail("allowLowText must be boolean.");
  if (!Array.isArray(raw.books) || !raw.books.length) fail("books must be a non-empty array.");
  const books = new Set(), chapters = new Set(), outputs = new Set();
  const targets = [];
  for (const book of raw.books) {
    object(book, "book", ["board", "grade", "subject", "bookId", "book", "edition", "chapters"]);
    const identity = {};
    for (const key of ["board", "subject", "bookId", "book"]) identity[key] = string(book[key], key);
    if (!((typeof book.grade === "string" && book.grade.trim()) || (typeof book.grade === "number" && Number.isSafeInteger(book.grade)))) fail("grade must be a non-empty label or safe integer.");
    identity.grade = String(book.grade).trim();
    if (book.edition !== undefined && typeof book.edition !== "string") fail("edition must be a string.");
    identity.edition = book.edition?.trim() || "";
    if (books.has(identity.bookId)) fail("bookId must be unique within the configuration.");
    books.add(identity.bookId);
    if (!Array.isArray(book.chapters) || !book.chapters.length) fail("chapters must be a non-empty array.");
    const numbers = new Set();
    for (const chapter of book.chapters) {
      object(chapter, "chapter", ["chapterId", "chapterNumber", "chapterTitle", "pdfPath", "pages", "sources", "outputFile"]);
      const chapterId = string(chapter.chapterId, "chapterId");
      const chapterNumber = integer(chapter.chapterNumber, "chapterNumber");
      if (chapters.has(chapterId) || numbers.has(chapterNumber)) fail("chapterId must be globally unique; chapterNumber must be unique within its book.");
      chapters.add(chapterId); numbers.add(chapterNumber);
      const chapterTitle = chapter.chapterTitle === undefined ? "" : string(chapter.chapterTitle, "chapterTitle");
      if (chapter.sources !== undefined && (chapter.pdfPath !== undefined || chapter.pages !== undefined)) fail("Use sources OR pdfPath/pages, not both.");
      const sourceList = chapter.sources ?? [{ pdfPath: chapter.pdfPath, pages: chapter.pages }];
      if (!Array.isArray(sourceList) || !sourceList.length) fail("sources must be non-empty.");
      const sources = sourceList.map(source => {
        object(source, "source", ["pdfPath", "pages"]);
        const pdfPath = path.resolve(base, string(source.pdfPath, "pdfPath"));
        if (path.extname(pdfPath).toLowerCase() !== ".pdf") fail("Source must have a .pdf extension.");
        const pages = source.pages ?? null;
        if (pages !== null && (!Array.isArray(pages) || !pages.length || pages.some((page, i) => !Number.isSafeInteger(page) || page < 1 || (i > 0 && page <= pages[i - 1])))) {
          fail("pages must be strictly increasing unique 1-based integers.");
        }
        return { pdfPath, pages };
      });
      const outputFile = chapter.outputFile === undefined ? `chapter-${fingerprint({ ...identity, chapterId })}.json` : string(chapter.outputFile, "outputFile");
      const outputPath = path.resolve(outputDirectory, outputFile);
      const relative = path.relative(outputDirectory, outputPath);
      if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative) || path.extname(outputPath).toLowerCase() !== ".json") fail("outputFile must be a JSON file inside outputDirectory.");
      if (outputs.has(outputPath) || outputPath === path.join(outputDirectory, "ingestion-summary.json")) fail("Duplicate or reserved outputFile.");
      outputs.add(outputPath);
      targets.push({ ...identity, chapterId, chapterNumber, chapterTitle, sources, outputPath });
    }
  }
  return { schemaVersion: 1, sourceMode, configPath: path.resolve(configPath), outputDirectory, model, timeoutMs, maxOutputTokens,
    retry, extraction: { minCharacters, allowLowText: extraction.allowLowText ?? false }, chapterDelayMs, targets };
}

async function loadConfig(configPath, env) {
  let raw;
  try { raw = JSON.parse(await fs.readFile(configPath, "utf8")); }
  catch { fail("Could not read configuration JSON."); }
  return normalizeConfig(raw, configPath, env);
}

module.exports = { loadConfig, normalizeConfig };

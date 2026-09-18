const { buildSourceContext } = require("./sourceContext");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { loadConfig } = require("./ingestionConfig");
const { extractPdf } = require("./pdfExtractor");
const { parseCurriculum } = require("./curriculumParser");
const { validateCurriculum } = require("./curriculumValidator");
const { IngestionError, withGeminiRetry } = require("./geminiRetry");
const { ARTIFACT_VERSION, IDENTITY_STRATEGY, fingerprint, chapterIdentity, contentFingerprint, canResume } = require("./curriculumIdentity");

// All writes in this module are local artifacts. There is deliberately no
// importer, Prisma client or database dependency in this dependency graph.
async function atomicJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, filePath);
  } finally {
    await handle?.close();
    await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

async function physicalPath(filePath) {
  try { return await fs.realpath(filePath); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(filePath);
    if (parent === filePath) throw error;
    return path.join(await physicalPath(parent), path.basename(filePath));
  }
}

async function preflight(config, checkSources) {
  const protectedPaths = new Set([await fs.realpath(config.configPath)]);
  for (const target of config.targets) {
    for (const source of target.sources) {
      let stat;
      try { stat = await fs.stat(source.pdfPath); }
      catch {
        if (checkSources) throw new IngestionError("SOURCE_UNAVAILABLE", "A configured source PDF does not exist or is unreadable.");
        continue;
      }
      if (checkSources && (!stat.isFile() || !stat.size)) throw new IngestionError("SOURCE_INVALID", "Sources must be non-empty regular PDF files.");
      protectedPaths.add(await fs.realpath(source.pdfPath));
    }
  }
  const root = await physicalPath(config.outputDirectory);
  const paths = new Set();
  for (const output of [...config.targets.map(target => target.outputPath), path.join(config.outputDirectory, "ingestion-summary.json")]) {
    const actual = await physicalPath(output);
    const relative = path.relative(root, actual);
    const stat = await fs.lstat(output).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new IngestionError("OUTPUT_UNSAFE", "An output destination is not a regular file.");
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || protectedPaths.has(actual) || paths.has(actual)) {
      throw new IngestionError("OUTPUT_UNSAFE", "Output aliases a source/configuration, another output, or escapes outputDirectory.");
    }
    paths.add(actual);
  }
}

async function implementationFingerprint() {
  const names = ["curriculumParser.js", "curriculumValidator.js", "curriculumIdentity.js", "pdfExtractor.js", "ingestionConfig.js", "ingestCurriculum.js", "geminiRetry.js", "sourceContext.js", "sourceFidelity.js", "curriculumResponseSchema.js", "providerDiagnostics.js", "geminiRequest.js"];
  const files = await Promise.all(names.map(async name => ({ name, sha256: fingerprint(await fs.readFile(path.join(__dirname, name))) })));
  const packagePath = path.resolve(__dirname, "../../../package-lock.json");
  return fingerprint({ files, lock: fingerprint(await fs.readFile(packagePath)), node: process.versions.node });
}

async function runIngestion(configPath, {
  chapterIds = [], force = false, resume = true, validateOnly = false
} = {}, dependencies = {}) {
  const config = await loadConfig(configPath, dependencies.env || process.env);
  await preflight(config, validateOnly);
  const requested = new Set(chapterIds);
  if ([...requested].some(id => !config.targets.some(target => target.chapterId === id))) {
    throw new IngestionError("CONFIG_INVALID", "A selected chapter ID does not exist in the configuration.");
  }
  const targets = config.targets.filter(target => !requested.size || requested.has(target.chapterId));
  if (validateOnly) return { valid: true, selectedChapters: targets.length, databaseWrites: false };
  const extract = dependencies.extractPdf || extractPdf;
  const parse = dependencies.parseCurriculum || parseCurriculum;
  const sleep = dependencies.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const log = dependencies.log || (() => {});
  const implementation = await implementationFingerprint();
  const results = [];
  for (const [index, target] of targets.entries()) {
    const result = { identity: chapterIdentity(target), outputPath: target.outputPath, status: "FAILED", attempts: 0, nodeCount: 0, warnings: [] };
    try {
      const sources = [];
      for (const source of target.sources) {
        let data;
        try {
          const stat = await fs.stat(source.pdfPath);
          if (!stat.isFile() || !stat.size) throw new IngestionError("SOURCE_INVALID", "Source PDF must be a non-empty regular file.");
          data = await fs.readFile(source.pdfPath);
        } catch (error) {
          if (error instanceof IngestionError) throw error;
          throw new IngestionError("SOURCE_UNAVAILABLE", "Could not read a configured source PDF.");
        }
        sources.push({ ...source, data, sha256: fingerprint(data) });
      }
      const expected = {
        identity: result.identity,
        sourceFingerprint: fingerprint(sources.map(({ sha256, pages }) => ({ sha256, pages }))),
        configurationFingerprint: fingerprint({ ...target, model: config.model, timeoutMs: config.timeoutMs, maxOutputTokens: config.maxOutputTokens, extraction: config.extraction, sourceMode: config.sourceMode }),
        implementationFingerprint: implementation
      };
      let previous;
      try { previous = JSON.parse(await fs.readFile(target.outputPath, "utf8")); }
      catch (error) { if (error.code && error.code !== "ENOENT") throw error; }
      if (resume && !force && previous && canResume(previous, expected, validateCurriculum)) {
        result.status = "SKIPPED";
        result.nodeCount = previous.nodes.length;
        result.warnings = previous._ingestion.warnings || [];
        result.sources = previous._ingestion.sources;
      } else {
        const extractions = [];
        result.sources = [];
        for (const source of sources) {
          const extracted = await extract(source.pdfPath, { data: source.data, pages: source.pages, minCharacters: config.extraction.minCharacters, allowEmptyText: config.sourceMode === "pdf" });
          result.sources.push({ pdfPath: source.pdfPath, sha256: source.sha256,
            selectedPages: extracted.selectedPages, stats: extracted.stats });
          result.warnings.push(...extracted.warnings);
          if (extracted.warnings.some(warning => ["LOW_TEXT", "EMPTY_PAGES"].includes(warning.code)) && !config.extraction.allowLowText && config.sourceMode !== "pdf") {
            throw new IngestionError("EXTRACTION_REVIEW_REQUIRED", "Extraction quality requires review; inspect source or explicitly allow low-text extraction.");
          }
          extractions.push(extracted);
        }
        const sourceContext = await buildSourceContext(sources, extractions, config.sourceMode);
        const extractedText = extractions.map(extracted => extracted.text).join("\n\n");
        const curriculum = await withGeminiRetry(attempt => {
          result.attempts = attempt;
          return parse({ ...target, extractedText: extractedText || "[No text layer; inspect attached source PDF.]", sourceContext, model: config.model, timeoutMs: config.timeoutMs, maxOutputTokens: config.maxOutputTokens }, { onDiagnostics: diagnostics => { result.provider = diagnostics; } });
        }, config.retry, { sleep, onRetry: event => log({ chapterId: target.chapterId, ...event }) });
        const validation = validateCurriculum(curriculum);
        if (!validation.valid) throw new IngestionError("OUTPUT_INVALID", "Generated curriculum failed structural validation.", { details: validation.errors });
        const actualIdentity = { board: curriculum.board, grade: curriculum.grade, subject: curriculum.subject,
          bookId: curriculum.book_id, book: curriculum.book, edition: curriculum.edition || "",
          chapterId: curriculum.chapter_id, chapterNumber: curriculum.chapter_number };
        if (fingerprint(actualIdentity) !== fingerprint(expected.identity) || (target.chapterTitle && target.chapterTitle !== curriculum.chapter)) {
          throw new IngestionError("OUTPUT_IDENTITY_MISMATCH", "Generated curriculum does not match the configured chapter.");
        }
        result.warnings.push(...validation.warnings.map(message => ({ code: "CURRICULUM_QUALITY", message })));
        curriculum._ingestion = {
          artifactVersion: ARTIFACT_VERSION, identityStrategy: IDENTITY_STRATEGY, ...expected,
          contentFingerprint: contentFingerprint(curriculum), generatedAt: new Date().toISOString(),
          reviewStatus: "UNREVIEWED", model: config.model,
          sources: result.sources,
          warnings: result.warnings, validationStats: validation.stats
        };
        await atomicJson(target.outputPath, curriculum);
        result.nodeCount = curriculum.nodes.length;
        result.status = "SUCCESS";
      }
    } catch (error) {
      result.error = error instanceof IngestionError
        ? { code: error.code, message: error.message, ...(error.status ? { status: error.status } : {}), ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}) }
        : { code: "INGESTION_FAILED", message: "Local ingestion failed; check source/output permissions and runtime configuration." };
    }
    results.push(result);
    log({ chapterId: target.chapterId, status: result.status, error: result.error?.code, ...(result.error?.status ? { httpStatus: result.error.status } : {}) });
    if (result.error?.code === "API_HTTP" && config.retry.stopOnHttpError) break;
    if (index < targets.length - 1 && config.chapterDelayMs) await sleep(config.chapterDelayMs);
  }
  const summary = { generatedAt: new Date().toISOString(), configPath: config.configPath, model: config.model,
    databaseWrites: false, reviewStatus: "UNREVIEWED", total: results.length, selected: targets.length, notAttempted: targets.length - results.length,
    successful: results.filter(result => result.status === "SUCCESS").length,
    skipped: results.filter(result => result.status === "SKIPPED").length,
    failed: results.filter(result => result.status === "FAILED").length, results };
  await atomicJson(path.join(config.outputDirectory, "ingestion-summary.json"), summary);
  return summary;
}

function parseArguments(args) {
  const options = { chapterIds: [] };
  let configPath;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (["--config", "--chapter"].includes(argument)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new IngestionError("CLI_INVALID", "A CLI option is missing its value.");
      if (argument === "--config") configPath = value;
      else options.chapterIds.push(value);
    } else if (argument === "--force") options.force = true;
    else if (argument === "--resume") options.resume = true;
    else if (argument === "--no-resume") options.resume = false;
    else if (argument === "--validate-only") options.validateOnly = true;
    else if (argument === "--help") return { help: true };
    else throw new IngestionError("CLI_INVALID", "Unknown CLI option.");
  }
  if (!configPath) throw new IngestionError("CLI_INVALID", "--config is required.");
  return { configPath, options };
}

if (require.main === module) {
  (async () => {
    const args = parseArguments(process.argv.slice(2));
    if (args.help) {
      console.log("Usage: npm run ingest:curriculum -- --config <file.json> [--chapter <chapterId>] [--resume|--no-resume] [--force] [--validate-only]");
      return;
    }
    require("dotenv").config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });
    const summary = await runIngestion(args.configPath, args.options, { log: event => console.log(JSON.stringify(event)) });
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed) process.exitCode = 1;
  })().catch(error => {
    console.error(error instanceof IngestionError ? `${error.code}: ${error.message}` : "INGESTION_FAILED: Check local configuration and file permissions.");
    process.exitCode = 1;
  });
}

module.exports = { runIngestion, atomicJson, parseArguments };

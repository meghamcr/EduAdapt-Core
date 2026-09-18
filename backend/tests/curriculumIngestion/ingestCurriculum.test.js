const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runIngestion, atomicJson, parseArguments } = require("../../src/services/curriculumIngestion/ingestCurriculum");
const { normalizeConfig } = require("../../src/services/curriculumIngestion/ingestionConfig");
const { parseCurriculum } = require("../../src/services/curriculumIngestion/curriculumParser");
const { IngestionError } = require("../../src/services/curriculumIngestion/geminiRetry");
const { workspace, modelOutput, response } = require("./fixtures/helpers");

function dependencies(onParse = () => {}) {
  return { sleep: async () => {}, parseCurriculum: async options => {
    onParse(options);
    return parseCurriculum({ ...options, apiKey: "TEST_ONLY_NOT_A_KEY" }, { fetchImpl: async () => response(modelOutput(options)) });
  } };
}
async function read(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
async function write(file, value) { return fs.writeFile(file, JSON.stringify(value)); }

test("real PDF → stubbed Gemini → validated atomic artifact → identity-aware resume", async t => {
  const files = await workspace(t);
  let calls = 0;
  const deps = dependencies(() => calls++);
  const first = await runIngestion(files.configPath, {}, deps);
  assert.equal(first.successful, 1); assert.equal(first.failed, 0);
  const artifact = await read(files.outputPath);
  assert.equal(artifact._ingestion.reviewStatus, "UNREVIEWED");
  assert.equal(artifact._ingestion.sources[0].selectedPages[0], 1);
  assert.equal(artifact._ingestion.sources[0].sha256.length, 64);
  assert.ok(artifact.nodes[0].id.startsWith("curriculum-v1-"));
  assert.equal((await runIngestion(files.configPath, {}, deps)).skipped, 1);
  assert.equal(calls, 1);
  assert.equal((await runIngestion(files.configPath, { force: true }, deps)).successful, 1);
  assert.equal(calls, 2);
  assert.equal((await fs.readdir(path.dirname(files.outputPath))).some(name => name.endsWith(".tmp")), false);
});
test("source, model, config, metadata, content or identity drift invalidates resume", async t => {
  const files = await workspace(t); const deps = dependencies();
  await runIngestion(files.configPath, {}, deps);
  await fs.appendFile(path.join(files.directory, "unusual source name.pdf"), "\n% Changed source bytes\n");
  assert.equal((await runIngestion(files.configPath, {}, deps)).successful, 1);
  files.config.model = "fixture-model-new"; await write(files.configPath, files.config);
  assert.equal((await runIngestion(files.configPath, {}, deps)).successful, 1);
  for (const mutate of [
    artifact => { artifact.nodes[1].content = "Edited output"; },
    artifact => { artifact.book_id = "another-book"; },
    artifact => { artifact._ingestion.implementationFingerprint = "stale-parser"; },
    artifact => { artifact._ingestion.identityStrategy = "legacy"; },
    artifact => { delete artifact._ingestion; }
  ]) {
    const artifact = await read(files.outputPath); mutate(artifact); await write(files.outputPath, artifact);
    assert.equal((await runIngestion(files.configPath, {}, deps)).successful, 1);
  }
  await fs.writeFile(files.outputPath, "{broken");
  assert.equal((await runIngestion(files.configPath, {}, deps)).successful, 1);
  files.config.books[0].chapters[0].pages = [2]; await write(files.configPath, files.config);
  assert.equal((await runIngestion(files.configPath, {}, deps)).successful, 1);
});
test("failed forced regeneration preserves previous complete output and records failure", async t => {
  const files = await workspace(t); await runIngestion(files.configPath, {}, dependencies());
  const before = await fs.readFile(files.outputPath);
  const summary = await runIngestion(files.configPath, { force: true }, { parseCurriculum: async () => { throw new IngestionError("OUTPUT_TRUNCATED", "Model output truncated."); } });
  assert.equal(summary.failed, 1); assert.equal(summary.results[0].attempts, 1);
  assert.deepEqual(await fs.readFile(files.outputPath), before);
  assert.equal((await read(path.join(files.directory, "output/ingestion-summary.json"))).failed, 1);
});
test("multiple books with shared chapter numbers, arbitrary grades/subjects and selected chapters", async t => {
  const files = await workspace(t, config => {
    config.books.push({ ...config.books[0], bookId: "another", board: "Another Board", grade: "Year 20", subject: "Local Studies", chapters: [{ chapterId: "other", chapterNumber: 1, pdfPath: "unusual source name.pdf", pages: [2] }] });
    return config;
  });
  const selected = await runIngestion(files.configPath, { chapterIds: ["other"] }, dependencies());
  assert.equal(selected.total, 1); assert.equal(selected.successful, 1);
  const full = await runIngestion(files.configPath, {}, dependencies());
  assert.equal(full.total, 2); assert.equal(full.skipped, 1); assert.equal(full.successful, 1);
  const one = await read(full.results[0].outputPath), two = await read(full.results[1].outputPath);
  assert.notEqual(one.nodes[0].id, two.nodes[0].id);
  await assert.rejects(runIngestion(files.configPath, { chapterIds: ["absent"] }, dependencies()), { code: "CONFIG_INVALID" });
});
test("ordered multi-PDF/page mappings combine source content and provenance", async t => {
  const files = await workspace(t, config => {
    const chapter = config.books[0].chapters[0]; delete chapter.pdfPath; delete chapter.pages;
    chapter.sources = [{ pdfPath: "unusual source name.pdf", pages: [1] }, { pdfPath: "unusual source name.pdf", pages: [2] }];
    return config;
  });
  let text;
  const summary = await runIngestion(files.configPath, {}, dependencies(input => { text = input.extractedText; }));
  assert.equal(summary.successful, 1);
  assert.ok(text.indexOf("Grouping counters") < text.indexOf("Measure and compare"));
  assert.equal((await read(files.outputPath))._ingestion.sources.length, 2);
});
test("quality gate blocks before AI; explicit low-text override preserves warning", async t => {
  const files = await workspace(t); files.config.sourceMode = "text"; files.config.extraction.minCharacters = 100000; await write(files.configPath, files.config);
  let calls = 0; const deps = dependencies(() => calls++);
  const blocked = await runIngestion(files.configPath, {}, deps);
  assert.equal(blocked.failed, 1); assert.equal(calls, 0);
  assert.equal(blocked.results[0].error.code, "EXTRACTION_REVIEW_REQUIRED");
  assert.ok(blocked.results[0].sources[0].stats.cleanedCharacters > 0);
  files.config.extraction.allowLowText = true; await write(files.configPath, files.config);
  const allowed = await runIngestion(files.configPath, {}, deps);
  assert.equal(allowed.successful, 1); assert.ok(allowed.results[0].warnings.some(w => w.code === "LOW_TEXT"));
});
test("runner retries transient errors, continues later chapters, and records attempts", async t => {
  const files = await workspace(t, config => {
    config.retry.retryHttpStatuses = [503]; config.retry.stopOnHttpError = false;
    config.books[0].chapters.push({ chapterId: "second", chapterNumber: 9, pdfPath: "unusual source name.pdf" }); return config;
  });
  let count = 0; const delays = []; const base = dependencies();
  const summary = await runIngestion(files.configPath, {}, { ...base, sleep: async ms => delays.push(ms), parseCurriculum: async input => {
    if (input.chapterId === "groups") { count++; throw new IngestionError("API_HTTP", "temporary", { retryable: true, status: 503 }); }
    return base.parseCurriculum(input);
  } });
  assert.equal(count, 3); assert.deepEqual(delays, [2, 4]);
  assert.equal(summary.failed, 1); assert.equal(summary.successful, 1);
});
test("missing source fails only its chapter; validate-only reports it before writes", async t => {
  const files = await workspace(t, config => {
    config.books[0].chapters.push({ chapterId: "missing", chapterNumber: 2, pdfPath: "absent.pdf" }); return config;
  });
  await assert.rejects(runIngestion(files.configPath, { validateOnly: true }), { code: "SOURCE_UNAVAILABLE" });
  const summary = await runIngestion(files.configPath, {}, dependencies());
  assert.equal(summary.successful, 1); assert.equal(summary.failed, 1);
  assert.equal(summary.results[1].error.code, "SOURCE_UNAVAILABLE");
  assert.equal(summary.results[1].attempts, 0);
});
test("configuration-relative paths and model environment fallback are explicit", async t => {
  const files = await workspace(t); const config = await read(files.configPath);
  delete config.model;
  const resolved = normalizeConfig(config, files.configPath, { GEMINI_MODEL: "fixture-from-env" });
  assert.equal(resolved.model, "fixture-from-env");
  assert.equal(resolved.targets[0].sources[0].pdfPath, path.join(files.directory, "unusual source name.pdf"));
  assert.throws(() => normalizeConfig(config, files.configPath, {}), { code: "CONFIG_INVALID" });
});
test("configuration rejects collisions, escapes, invalid page mappings and unknown fields", async t => {
  const files = await workspace(t); const raw = await read(files.configPath);
  for (const mutate of [
    config => { config.apiKey = "must-not-be-in-config"; },
    config => { config.books[0].chapters[0].outputFile = "../escape.json"; },
    config => { config.books[0].chapters[0].outputFile = "ingestion-summary.json"; },
    config => { config.books[0].chapters[0].pages = [1, 1]; },
    config => { config.books[0].chapters.push({ ...config.books[0].chapters[0] }); },
    config => { config.retry.maxAttempts = 0; },
    config => { config.extraction.allowLowText = "yes"; },
    config => { config.books[0].grade = {}; }
  ]) { const config = structuredClone(raw); mutate(config); assert.throws(() => normalizeConfig(config, files.configPath), { code: "CONFIG_INVALID" }); }
});
test("validate-only is read-only and never generates; output cannot overwrite config", async t => {
  const files = await workspace(t);
  const result = await runIngestion(files.configPath, { validateOnly: true }, { parseCurriculum: () => assert.fail("AI must not run") });
  assert.equal(result.valid, true); await assert.rejects(fs.access(path.join(files.directory, "output")));
  files.config.outputDirectory = "."; files.config.books[0].chapters[0].outputFile = "config.json";
  await write(files.configPath, files.config);
  await assert.rejects(runIngestion(files.configPath, {}, dependencies()), { code: "OUTPUT_UNSAFE" });
});
test("symlinked output directories cannot escape the configured output root", async t => {
  const files = await workspace(t);
  await fs.mkdir(path.join(files.directory, "output")); await fs.mkdir(path.join(files.directory, "outside"));
  await fs.symlink(path.join(files.directory, "outside"), path.join(files.directory, "output/link"));
  files.config.books[0].chapters[0].outputFile = "link/chapter.json"; await write(files.configPath, files.config);
  await assert.rejects(runIngestion(files.configPath, {}, dependencies()), { code: "OUTPUT_UNSAFE" });
});
test("atomic write failure leaves previous destination intact and removes temporary file", async t => {
  const files = await workspace(t); await atomicJson(files.outputPath, { previous: true });
  const invalid = {}; invalid.circular = invalid;
  await assert.rejects(atomicJson(files.outputPath, invalid));
  assert.deepEqual(await read(files.outputPath), { previous: true });
  assert.equal((await fs.readdir(path.dirname(files.outputPath))).some(name => name.endsWith(".tmp")), false);
});
test("CLI options and database dependency isolation", () => {
  assert.deepEqual(parseArguments(["--config", "input.json", "--chapter", "a", "--chapter", "b", "--force"]).options, { chapterIds: ["a", "b"], force: true });
  assert.throws(() => parseArguments(["--import"]), { code: "CLI_INVALID" });
  assert.throws(() => parseArguments(["--config"]), { code: "CLI_INVALID" });
  const runner = path.resolve(__dirname, "../../src/services/curriculumIngestion/ingestCurriculum.js");
  const check = spawnSync(process.execPath, ["-e", `const Module = require('node:module'); const load = Module._load; Module._load = function(id, ...args) { if (/prisma|importCurriculumToDatabase|supabase/i.test(id)) throw new Error('Database module loaded'); return load.call(this, id, ...args); }; require(${JSON.stringify(runner)});`], { encoding: "utf8", env: { ...process.env, DATABASE_URL: "", DIRECT_URL: "", GEMINI_API_KEY: "" } });
  assert.equal(check.status, 0, check.stderr);
});
test("executable CLI validates without writes and fails generation without credentials", async t => {
  const files = await workspace(t);
  const runner = path.resolve(__dirname, "../../src/services/curriculumIngestion/ingestCurriculum.js");
  const options = { encoding: "utf8", env: { ...process.env, GEMINI_API_KEY: "", DATABASE_URL: "", DIRECT_URL: "" } };
  const checked = spawnSync(process.execPath, [runner, "--config", files.configPath, "--validate-only"], options);
  assert.equal(checked.status, 0, checked.stderr);
  assert.ok(checked.stdout.includes('"valid": true'));
  await assert.rejects(fs.access(files.outputPath));
  const failed = spawnSync(process.execPath, [runner, "--config", files.configPath], options);
  assert.equal(failed.status, 1, failed.stderr);
  assert.ok(failed.stdout.includes("CONFIG_INVALID"));
  await assert.rejects(fs.access(files.outputPath));
});

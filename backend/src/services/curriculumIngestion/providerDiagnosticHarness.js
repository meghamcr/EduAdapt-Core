const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { buildGeminiRequest } = require("./geminiRequest");
const { callGemini, parseCurriculum, prepareCurriculumRequest } = require("./curriculumParser");
const { measureRequestPayload } = require("./requestPayload");
const { fingerprint } = require("./curriculumIdentity");
const { IngestionError } = require("./geminiRetry");
const path = require("node:path");

const SIZES = { "size-100kb": 100000, "size-500kb": 500000, "size-1mb": 1000000, "size-2mb": 2000000, "size-4mb": 4000000, "size-6mb": 6000000 };
const PROBES = ["basic", "json", "structured", "pdf", "pdf-structured", ...Object.keys(SIZES), "curriculum"];
const tinySchema = { type: "object", properties: { status: { type: "string" } }, required: ["status"], additionalProperties: false };
const pdfSchema = { type: "object", properties: { shape: { type: "string" }, colour: { type: "string" } }, required: ["shape", "colour"], additionalProperties: false };
const SYNTHETIC_TEXT = "Explanation: We can compare groups by arranging counters. Question: How would you arrange your counters? Activity: Make two arrangements and explain your comparison. Complete this table: Arrangement | Count; A | ___; B | ___. Visual task: Compare your model with a companion picture that is not provided. Learning objective: Compare arrangements and explain your choices.";
function curriculumInput(model) {
  return { board: "Synthetic Board", grade: "Foundation", subject: "Comparisons", bookId: "diagnostic-book", book: "Synthetic Diagnostics", chapterId: "diagnostic-chapter", chapterNumber: 1, chapterTitle: "Comparing arrangements", extractedText: SYNTHETIC_TEXT, model, maxOutputTokens: 4096,
    sourceContext: { version: 1, mode: "text", documents: [{ sourceId: "source-1", sha256: fingerprint(Buffer.from(SYNTHETIC_TEXT)), pages: [{ page: 1, text: SYNTHETIC_TEXT }] }], mediaParts: [] } };
}
async function syntheticPdf(padding = 0) {
  const pdf = await PDFDocument.create();
  pdf.setCreationDate(new Date("2000-01-01T00:00:00Z")); pdf.setModificationDate(new Date("2000-01-01T00:00:00Z"));
  const font = await pdf.embedFont(StandardFonts.Helvetica); const page = pdf.addPage([240, 180]);
  page.drawText("SYNTHETIC DIAGNOSTIC: red square", { x: 12, y: 155, size: 10, font });
  page.drawRectangle({ x: 30, y: 40, width: 70, height: 70, color: rgb(1, 0, 0) });
  // Unreferenced, uncompressed bytes deliberately isolate transport size without
  // adding pages or educational complexity. Not representative of visual load.
  if (padding) pdf.context.register(pdf.context.stream(new Uint8Array(padding)));
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
async function prepareProbe(probe, model = process.env.GEMINI_MODEL) {
  if (!PROBES.includes(probe) || typeof model !== "string" || !/^[a-zA-Z0-9._-]+$/.test(model)) throw new IngestionError("CONFIG_INVALID", "Choose a known probe and configure GEMINI_MODEL.");
  if (probe === "curriculum") {
    const input = curriculumInput(model);
    return { probe, model, request: await prepareCurriculumRequest(input), expectedResponseType: "Validated synthetic curriculum JSON", input };
  }
  const hasPdf = probe === "pdf" || probe === "pdf-structured" || probe in SIZES;
  const mediaParts = [];
  if (hasPdf) mediaParts.push({ inlineData: { mimeType: "application/pdf", data: (await syntheticPdf(SIZES[probe] || 0)).toString("base64") } });
  const prompt = hasPdf ? 'Describe the explicitly labelled shape in the attached synthetic PDF. Return a JSON object with "shape" and "colour".' : 'Return only the tiny JSON object {"status":"ok"}.';
  const responseMimeType = probe === "basic" ? null : "application/json";
  const responseSchema = probe === "structured" ? tinySchema : probe === "pdf-structured" ? pdfSchema : null;
  return { probe, model, request: buildGeminiRequest(prompt, { mediaParts, responseMimeType, responseSchema, maxOutputTokens: 128 }), expectedResponseType: hasPdf ? "JSON {shape, colour}" : "JSON {status: ok}" };
}
function classify(error) {
  const reason = error.diagnostics?.providerReason;
  if (error.code === "API_HTTP") {
    if (["QUOTA_EXCEEDED", "DAILY_LIMIT_EXCEEDED"].includes(reason)) return "PROVIDER_QUOTA";
    if (reason === "RATE_LIMIT_EXCEEDED") return "PROVIDER_RATE_LIMIT";
    if ([401, 403].includes(error.status)) return "PROVIDER_AUTH";
    if (error.status === 404) return "PROVIDER_MODEL_UNAVAILABLE";
    if ([400, 413, 422].includes(error.status)) return "PROVIDER_REQUEST_REJECTED";
    // A bare 429 cannot distinguish quota exhaustion from throttling.
    return "PROVIDER_HTTP";
  }
  if (["OUTPUT_TRUNCATED", "OUTPUT_INCOMPLETE", "OUTPUT_JSON_INVALID", "OUTPUT_SCHEMA_INVALID"].includes(error.code)) return error.code;
  if (["OUTPUT_INVALID", "OUTPUT_IDENTITY_MISMATCH", "OUTPUT_IDENTITY_AMBIGUOUS"].includes(error.code)) return "CURRICULUM_VALIDATION_FAILED";
  if (error.code === "CONFIG_INVALID") return "PROVIDER_CONFIGURATION";
  if (error.code === "API_TIMEOUT") return "PROVIDER_TIMEOUT";
  if (error.code === "API_NETWORK") return "PROVIDER_NETWORK";
  return "PROVIDER_RESPONSE_INVALID";
}
function reportFor(prepared) {
  const metrics = measureRequestPayload(prepared.request);
  const parts = prepared.request.contents[0].parts;
  return { probe: prepared.probe, model: prepared.model, requestMimeType: prepared.request.generationConfig.responseMimeType || "UNSPECIFIED",
    structuredSchemaPresent: !!prepared.request.generationConfig.responseJsonSchema, pdfPresent: metrics.pdfAttachments > 0,
    rawAttachmentBytes: parts.reduce((sum,p) => sum + (p.inlineData ? Buffer.from(p.inlineData.data,"base64").length : 0), 0),
    ...metrics, expectedResponseType: prepared.expectedResponseType, providerExecutionOccurred: false, attempts: 0, artifactWritten: false };
}
async function runProbe(probe, { model = process.env.GEMINI_MODEL, execute = false, apiKey = process.env.GEMINI_API_KEY, fetchImpl = globalThis.fetch } = {}) {
  const prepared = await prepareProbe(probe, model), report = reportFor(prepared);
  if (execute !== true) return report;
  const config = prepared.request.generationConfig, parts = prepared.request.contents[0].parts;
  if (typeof apiKey !== "string" || !apiKey.trim()) return { ...report, error: "PROVIDER_CONFIGURATION", stage: "preflight" };
  const diagnostics = {};
  const transport = async (...args) => { report.providerExecutionOccurred = true; report.attempts++; return fetchImpl(...args); };
  try {
    if (probe === "curriculum") {
      await parseCurriculum({ ...prepared.input, apiKey, timeoutMs: 30000 }, { fetchImpl: transport, onDiagnostics: d => Object.assign(diagnostics, d) });
    } else {
      const text = await callGemini(parts[0].text, { model, apiKey, timeoutMs: 30000, maxOutputTokens: config.maxOutputTokens,
        mediaParts: parts.slice(1), responseMimeType: config.responseMimeType || null, responseSchema: config.responseJsonSchema || null,
        captureErrorEvidence: true, diagnostics, fetchImpl: transport });
      diagnostics.stage = "probe_json";
      let value; try { value = JSON.parse(text); } catch { throw new IngestionError("OUTPUT_JSON_INVALID", "Probe JSON invalid."); }
      diagnostics.stage = "probe_schema";
      const valid = value && typeof value === "object" && !Array.isArray(value) && (report.pdfPresent
        ? Object.keys(value).length === 2 && typeof value.shape === "string" && typeof value.colour === "string" && value.shape.toLowerCase() === "square" && value.colour.toLowerCase() === "red"
        : Object.keys(value).length === 1 && value.status === "ok");
      if (!valid) throw new IngestionError("OUTPUT_SCHEMA_INVALID", "Probe contract invalid.");
    }
    return { ...report, result: "SUCCESS", diagnostics: { ...diagnostics, stage: "complete" } };
  } catch (error) {
    const safe = error instanceof IngestionError ? error : new IngestionError("API_RESPONSE_INVALID", "Probe failed.");
    safe.diagnostics = { ...diagnostics, ...safe.diagnostics };
    return { ...report, result: "FAILED", error: classify(safe), code: safe.code, ...(safe.status ? { httpStatus: safe.status } : {}), diagnostics: safe.diagnostics };
  }
}
function parseArgs(args) {
  const result = { execute: false }; for (let i=0;i<args.length;i++) {
    if (args[i] === "--probe") { if (result.probe) throw new IngestionError("CONFIG_INVALID", "Choose exactly one probe."); result.probe = args[++i]; }
    else if (args[i] === "--execute") result.execute = true;
    else throw new IngestionError("CONFIG_INVALID", "Use --probe <name> and optional --execute.");
  }
  if (!PROBES.includes(result.probe)) throw new IngestionError("CONFIG_INVALID", "A single known probe is required.");
  return result;
}
if (require.main === module) {
  (async()=>{ require("dotenv").config({path:path.resolve(__dirname,"../../../.env"),quiet:true}); const args=parseArgs(process.argv.slice(2)); const result=await runProbe(args.probe,args); console.log(JSON.stringify(result,null,2)); if(result.error)process.exitCode=1; })().catch(()=>{console.error("DIAGNOSTIC_CONFIG_INVALID: Choose a named probe and configure the model.");process.exitCode=1;});
}
module.exports = { PROBES, SIZES, prepareProbe, reportFor, runProbe, classify, parseArgs, syntheticPdf, curriculumInput };

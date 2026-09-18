const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// Fail closed if any test accidentally uses an unstubbed network transport.
globalThis.fetch = async () => { throw new Error("Tests must stub every AI request."); };

const identity = { board: "Example Board", grade: "Foundation", subject: "Quantities", bookId: "book-one", book: "Grouping", edition: "test", chapterId: "groups", chapterNumber: 1 };
function curriculum(overrides = {}) {
  return { board: identity.board, grade: identity.grade, subject: identity.subject,
    book_id: identity.bookId, book: identity.book, edition: identity.edition,
    chapter_id: identity.chapterId, chapter_number: 1, chapter: "Grouping counters",
    learning_objectives: ["Arrange counters in equal groups."],
    nodes: [{ id: "root", parent_id: "", title: "Grouping counters", type: "chapter", description: "Grouping counters", content: "Twelve counters can form three equal groups. Each group contains four counters. Compare different arrangements without changing the total.", order: 1 },
      { id: "worked", parent_id: "root", title: "Worked example", type: "worked_example", description: "Equal groups", content: "12 / 3 = 4. Three groups of four counters contain twelve counters in total. Rearrange the counters to observe that the total stays the same.", order: 1 }], ...overrides };
}
function modelOutput(input = identity, nodes = curriculum().nodes) {
  return { ...curriculum(), board: input.board, grade: String(input.grade), subject: input.subject, book_id: input.bookId, book: input.book, chapter_id: input.chapterId, chapter_number: input.chapterNumber,
    source_coverage_complete: true,
    ...(input.sourceContext ? { objective_evidence: [input.sourceContext.documents.flatMap(doc => doc.pages.map(p => ({ sourceId: doc.sourceId, page: p.page })))] } : {}),
    nodes: nodes.map(({ id, parent_id, ...node }) => ({ temp_id: id, parent_temp_id: parent_id, ...node,
      ...(input.sourceContext ? { materials: [{ role: "explanation", authority: "EXPLICIT_SOURCE_CONTENT", evidence_kind: "SOURCE_TEXT", text: node.content,
        source_refs: input.sourceContext.documents.flatMap(doc => doc.pages.map(p => ({ sourceId: doc.sourceId, page: p.page }))),
        student_completion: false, visual: { status: "NOT_APPLICABLE", description: "" } }] } : {}) })) };
}
function response(output, finishReason = "STOP") {
  return { ok: true, text: async () => JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text: typeof output === "string" ? output : JSON.stringify(output) }] } }] }) };
}
async function workspace(t, modify = config => config) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eduadapt-ingestion-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.copyFile(path.join(__dirname, "source-chapter.pdf"), path.join(directory, "unusual source name.pdf"));
  const { chapterId, chapterNumber, ...book } = identity;
  const config = modify({ schemaVersion: 1, outputDirectory: "output", model: "fixture-model", extraction: { minCharacters: 1 }, retry: { maxAttempts: 3, baseDelayMs: 2, maxDelayMs: 5 },
    books: [{ ...book, chapters: [{ chapterId, chapterNumber, pdfPath: "unusual source name.pdf", pages: [1], outputFile: "chapter.json" }] }] });
  const configPath = path.join(directory, "config.json");
  await fs.writeFile(configPath, JSON.stringify(config));
  return { directory, configPath, config, outputPath: path.join(directory, "output", "chapter.json") };
}
module.exports = { identity, curriculum, modelOutput, response, workspace };

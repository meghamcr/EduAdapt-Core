const { createHash } = require("node:crypto");

const IDENTITY_STRATEGY = "chapter-path-sha256-v1";
const ARTIFACT_VERSION = 1;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return createHash("sha256").update(Buffer.isBuffer(value) ? value : canonicalJson(value)).digest("hex");
}

function chapterIdentity(chapter) {
  return {
    board: chapter.board, grade: String(chapter.grade), subject: chapter.subject,
    bookId: chapter.bookId, book: chapter.book, edition: chapter.edition || "",
    chapterId: chapter.chapterId, chapterNumber: chapter.chapterNumber
  };
}

// Independent of model temp IDs and flat array order. Structural edits can change
// IDs; these are new artifact identities, never a migration of database IDs.
function assignNodeIds(nodes, identity) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const resolved = new Map();
  const scope = fingerprint({ strategy: IDENTITY_STRATEGY, identity });
  for (const node of nodes) {
    const pending = [];
    const visiting = new Set();
    let current = node;
    while (current && !resolved.has(current.id)) {
      if (visiting.has(current.id)) throw new Error("Cannot assign IDs to a cyclic hierarchy.");
      visiting.add(current.id);
      pending.push(current);
      if (current.parent_id && !byId.has(current.parent_id)) throw new Error("Cannot assign IDs with a missing parent.");
      current = byId.get(current.parent_id);
    }
    while (pending.length) {
      const item = pending.pop();
      const parent = item.parent_id ? resolved.get(item.parent_id) : scope;
      resolved.set(item.id, `curriculum-v1-${fingerprint({ parent, type: item.type, title: item.title, order: item.order })}`);
    }
  }
  const ids = [...resolved.values()];
  if (new Set(ids).size !== nodes.length) throw new Error("Ambiguous sibling identity: distinguish title, type or order.");
  return nodes.map(node => ({ ...node, id: resolved.get(node.id), parent_id: node.parent_id ? resolved.get(node.parent_id) : "" }));
}

function contentFingerprint(artifact) {
  const { _ingestion, ...content } = artifact;
  return fingerprint(content);
}

function canResume(artifact, expected, validate) {
  try {
    if (!validate(artifact).valid) return false;
    const metadata = artifact._ingestion;
    if (!metadata || metadata.artifactVersion !== ARTIFACT_VERSION || metadata.identityStrategy !== IDENTITY_STRATEGY) return false;
    if (metadata.contentFingerprint !== contentFingerprint(artifact)) return false;
    if (fingerprint(metadata.identity) !== fingerprint(expected.identity)) return false;
    for (const key of ["sourceFingerprint", "configurationFingerprint", "implementationFingerprint"]) {
      if (metadata[key] !== expected[key]) return false;
    }
    const identity = expected.identity;
    return artifact.board === identity.board && artifact.grade === identity.grade &&
      artifact.subject === identity.subject && artifact.book_id === identity.bookId &&
      artifact.book === identity.book && (artifact.edition || "") === identity.edition &&
      artifact.chapter_id === identity.chapterId && artifact.chapter_number === identity.chapterNumber;
  } catch {
    return false;
  }
}

module.exports = { IDENTITY_STRATEGY, ARTIFACT_VERSION, fingerprint, chapterIdentity, assignNodeIds, contentFingerprint, canResume };

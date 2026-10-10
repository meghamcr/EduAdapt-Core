const { IngestionError } = require("./geminiRetry");

// Source units are wire-only anchors, not curriculum nodes. Preserve line text
// and layout; the model groups lines into meaningful pedagogical materials.
function sourceTextUnits(documents) {
  return documents.flatMap(doc => doc.pages.flatMap(page =>
    page.text.split("\n").flatMap((text, index) => text.trim() ? [{
      id: `${doc.sourceId}:p${page.page}:l${index + 1}`,
      sourceId: doc.sourceId, page: page.page, text
    }] : [])
  ));
}

// Conservative extraction-only classification. Bare numbers, empty pages and
// unknown publication text remain required: they may be instructional/visual.
// Persist this locally derived evidence; never accept a model coverage exemption.
function furnitureOnlyPages(doc) {
  const publication = /^(?:reprint(?:ed)?|first published|revised edition)\s*:?\s*\d{4}(?:\s*[-–/]\s*\d{2,4})?\.?$/i;
  const pageNumber = /^(?:page\s+)?\d+$/i;
  return doc.pages.filter(page => {
    const lines = page.text.split("\n").map(line => line.trim()).filter(Boolean);
    return lines.some(line => publication.test(line)) &&
      lines.every(line => publication.test(line) || pageNumber.test(line));
  }).map(page => page.page);
}

function resolveSourceText(materials, units) {
  if (!Array.isArray(units)) return materials;
  const registry = new Map(units.map((unit, index) => [unit.id, { ...unit, index }]));
  return materials.map((material, materialIndex) => {
    const { source_unit_ids, ...rest } = material;
    if (material.authority !== "EXPLICIT_SOURCE_CONTENT") return rest;
    if (material.evidence_kind !== "SOURCE_TEXT") {
      throw new IngestionError("OUTPUT_INVALID", "Explicit source material requires SOURCE_TEXT evidence.");
    }
    const ids = material.source_unit_ids;
    const reason = !Array.isArray(ids) || !ids.length ? "missing anchors"
      : ids.some(id => typeof id !== "string" || !registry.has(id)) ? "unregistered anchors"
      : new Set(ids).size !== ids.length ? "duplicate anchors" : null;
    if (reason) {
      throw new IngestionError("OUTPUT_SOURCE_ANCHOR_INVALID", "Explicit source material requires unique registered source-unit IDs.",
        { details: [`Material ${materialIndex + 1}: ${reason}.`] });
    }
    const selected = ids.map(id => registry.get(id)).sort((a, b) => a.index - b.index);
    const refs = [...new Map(selected.map(unit => [`${unit.sourceId}:${unit.page}`, { sourceId: unit.sourceId, page: unit.page }])).values()];
    // Never let a model rewrite, complete or describe the authoritative text.
    // Wire IDs do not alter the persisted artifact schema.
    return { ...rest, text: selected.map(unit => unit.text).join("\n"), source_refs: refs };
  });
}

module.exports = { sourceTextUnits, resolveSourceText, furnitureOnlyPages };

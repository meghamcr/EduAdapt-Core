const { ROLES, AUTHORITIES, EVIDENCE_KINDS } = require("./sourceFidelity");
const string = { type: "string" };
const object = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const array = items => ({ type: "array", items, minItems: 1 });

// Provider wire format only. Parent IDs express recursive hierarchy without a
// recursive JSON Schema. Graph validity, source authority and identity stay local.
function curriculumResponseSchema(withSourceContext = true) {
  const reference = object({ sourceId: string, page: { type: "integer", minimum: 1 } });
  const material = object({
    role: { type: "string", enum: ROLES },
    authority: { type: "string", enum: AUTHORITIES },
    evidence_kind: { type: "string", enum: EVIDENCE_KINDS },
    text: string, source_refs: array(reference), student_completion: { type: "boolean" },
    visual: object({ status: { type: "string", enum: ["NOT_APPLICABLE", "VISUAL_DEPENDENCY", "VISUAL_UNRESOLVED"] }, description: string })
  });
  const node = object({ temp_id: string, parent_temp_id: string, title: string,
    type: string, description: string, order: { type: "integer", minimum: 1 },
    ...(withSourceContext ? { materials: array(material) } : { content: string }) });
  return object({ source_coverage_complete: { type: "boolean" },
    board: string, grade: string, subject: string, book_id: string, book: string,
    chapter_id: string, chapter_number: { type: "integer", minimum: 1 }, chapter: string,
    learning_objectives: array(string),
    ...(withSourceContext ? { objective_evidence: array(array(reference)) } : {}),
    nodes: array(node) });
}
module.exports = { curriculumResponseSchema };

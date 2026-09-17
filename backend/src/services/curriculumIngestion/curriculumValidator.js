function validateCurriculum(curriculum) {
  const errors = [];
  const warnings = [];

  if (!curriculum || typeof curriculum !== "object") {
    return {
      valid: false,
      errors: ["Curriculum must be an object."],
      warnings: []
    };
  }

  // ==================================================
  // 1. CURRICULUM IDENTITY
  // ==================================================

  if (!curriculum.board?.trim()) {
    errors.push("Curriculum board is required.");
  }

  const grade = Number(curriculum.grade);

  if (!Number.isInteger(grade) || grade < 1 || grade > 12) {
    errors.push(
      "Curriculum grade must be between 1 and 12."
    );
  }

  if (!curriculum.subject?.trim()) {
    errors.push("Curriculum subject is required.");
  }

  if (!curriculum.book_id?.trim()) {
    errors.push("Curriculum book_id is required.");
  }

  if (!curriculum.book?.trim()) {
    errors.push("Curriculum book is required.");
  }

  if (!curriculum.chapter_id?.trim()) {
    errors.push("Curriculum chapter_id is required.");
  }

  if (
    !Number.isInteger(Number(curriculum.chapter_number)) ||
    Number(curriculum.chapter_number) < 1
  ) {
    errors.push(
      "Curriculum chapter_number must be a positive integer."
    );
  }

  if (!curriculum.chapter?.trim()) {
    errors.push(
      "Curriculum chapter title is required."
    );
  }

  // ==================================================
  // 2. LEARNING OBJECTIVES
  // ==================================================

  if (!Array.isArray(curriculum.learning_objectives)) {
    errors.push(
      "learning_objectives must be an array."
    );
  } else {
    const validObjectives =
      curriculum.learning_objectives.filter(
        objective =>
          typeof objective === "string" &&
          objective.trim().length > 0
      );

    if (validObjectives.length === 0) {
      warnings.push(
        "No usable learning objectives were generated."
      );
    }
  }

  // ==================================================
  // 3. NODES
  // ==================================================

  if (!Array.isArray(curriculum.nodes)) {
    errors.push(
      "Curriculum nodes must be an array."
    );

    return {
      valid: false,
      errors,
      warnings
    };
  }

  if (curriculum.nodes.length === 0) {
    errors.push(
      "Curriculum must contain at least one node."
    );

    return {
      valid: false,
      errors,
      warnings
    };
  }

  const ids = new Set();
  const nodeMap = new Map();

  // ==================================================
  // 4. INDIVIDUAL NODE VALIDATION
  // ==================================================

  curriculum.nodes.forEach((node, index) => {
    const location = `Node ${index + 1}`;

    if (!node || typeof node !== "object") {
      errors.push(
        `${location} must be an object.`
      );
      return;
    }

    if (!node.id?.trim()) {
      errors.push(
        `${location} is missing id.`
      );
    } else {
      if (ids.has(node.id)) {
        errors.push(
          `Duplicate node id found: ${node.id}`
        );
      }

      ids.add(node.id);
      nodeMap.set(node.id, node);
    }

    if (!node.title?.trim()) {
      errors.push(
        `${location} (${node.id || "unknown"}) is missing title.`
      );
    }

    if (!node.type?.trim()) {
      errors.push(
        `${location} (${node.id || "unknown"}) is missing type.`
      );
    }

    if (!node.description?.trim()) {
      warnings.push(
        `${location} (${node.id || "unknown"}) has no description.`
      );
    }

    const content =
      typeof node.content === "string"
        ? node.content.trim()
        : "";

    if (!content) {
      errors.push(
        `${location} (${node.id || "unknown"}) has no educational content.`
      );
    } else {
      // Very short content is suspicious for curriculum ingestion.
      // This is a warning rather than an error because some legitimate
      // facts or observations can naturally be short.
      if (content.length < 80) {
        warnings.push(
          `${location} (${node.id || "unknown"}) has very short educational content (${content.length} characters).`
        );
      }

      if (
        ["topic", "subtopic", "concept"].includes(
          String(node.type || "").toLowerCase()
        ) &&
        content.length < 150
      ) {
        warnings.push(
          `${location} (${node.id || "unknown"}) may be too shallow for later lesson/game generation.`
        );
      }
    }

    if (
      !Number.isFinite(Number(node.order)) ||
      Number(node.order) < 1
    ) {
      errors.push(
        `${location} (${node.id || "unknown"}) must have a positive order value.`
      );
    }

    if (
      node.parent_id !== undefined &&
      typeof node.parent_id !== "string"
    ) {
      errors.push(
        `${location} (${node.id || "unknown"}) has invalid parent_id.`
      );
    }
  });

  // ==================================================
  // 5. ROOT CHAPTER NODE
  // ==================================================

  const rootNodes = curriculum.nodes.filter(
    node =>
      node &&
      (node.parent_id || "") === ""
  );

  if (rootNodes.length === 0) {
    errors.push(
      "Curriculum does not contain a root node."
    );
  }

  if (rootNodes.length > 1) {
    errors.push(
      `Curriculum contains ${rootNodes.length} root nodes. Exactly one root chapter node is required.`
    );
  }

  if (rootNodes.length === 1) {
    const root = rootNodes[0];

    if (
      String(root.type || "").toLowerCase() !==
      "chapter"
    ) {
      errors.push(
        "The root curriculum node must have type 'chapter'."
      );
    }

    if (
      root.title?.trim() !==
      curriculum.chapter?.trim()
    ) {
      warnings.push(
        "Root node title does not exactly match the curriculum chapter title."
      );
    }
  }

  // ==================================================
  // 6. PARENT REFERENCES
  // ==================================================

  curriculum.nodes.forEach(node => {
    if (!node?.id) {
      return;
    }

    const parentId = node.parent_id || "";

    if (!parentId) {
      return;
    }

    if (!nodeMap.has(parentId)) {
      errors.push(
        `Node "${node.id}" references missing parent "${parentId}".`
      );
    }

    if (parentId === node.id) {
      errors.push(
        `Node "${node.id}" cannot be its own parent.`
      );
    }
  });

  // ==================================================
  // 7. CIRCULAR HIERARCHY CHECK
  // ==================================================

  curriculum.nodes.forEach(node => {
    if (!node?.id) {
      return;
    }

    const visited = new Set();
    let current = node;

    while (current && current.parent_id) {
      if (visited.has(current.id)) {
        errors.push(
          `Circular curriculum hierarchy detected involving node "${current.id}".`
        );
        break;
      }

      visited.add(current.id);

      current =
        nodeMap.get(current.parent_id);
    }
  });

  // ==================================================
  // 8. REACHABILITY CHECK
  // ==================================================

  if (
    rootNodes.length === 1 &&
    rootNodes[0]?.id
  ) {
    const rootId = rootNodes[0].id;
    const reachable = new Set();

    const childrenByParent = new Map();

    curriculum.nodes.forEach(node => {
      if (!node?.id) {
        return;
      }

      const parentId =
        node.parent_id || "";

      if (!childrenByParent.has(parentId)) {
        childrenByParent.set(
          parentId,
          []
        );
      }

      childrenByParent
        .get(parentId)
        .push(node);
    });

    function visit(nodeId) {
      if (reachable.has(nodeId)) {
        return;
      }

      reachable.add(nodeId);

      const children =
        childrenByParent.get(nodeId) || [];

      children.forEach(child => {
        visit(child.id);
      });
    }

    visit(rootId);

    curriculum.nodes.forEach(node => {
      if (
        node?.id &&
        !reachable.has(node.id)
      ) {
        errors.push(
          `Node "${node.id}" is not reachable from the chapter root.`
        );
      }
    });
  }

  // ==================================================
  // 9. DUPLICATE TITLES
  // ==================================================

  const titleMap = new Map();

  curriculum.nodes.forEach(node => {
    if (!node?.title) {
      return;
    }

    const normalizedTitle =
      node.title
        .trim()
        .toLowerCase();

    if (!titleMap.has(normalizedTitle)) {
      titleMap.set(
        normalizedTitle,
        []
      );
    }

    titleMap
      .get(normalizedTitle)
      .push(node.id);
  });

  for (
    const [title, nodeIds]
    of titleMap.entries()
  ) {
    if (nodeIds.length > 1) {
      warnings.push(
        `Repeated node title "${title}" found in ${nodeIds.length} nodes.`
      );
    }
  }

  // ==================================================
  // 10. DUPLICATE CONTENT
  // ==================================================

  const contentMap = new Map();

  curriculum.nodes.forEach(node => {
    if (!node?.content?.trim()) {
      return;
    }

    const normalized =
      node.content
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();

    // Ignore tiny pieces because short definitions may legitimately
    // appear in multiple places.
    if (normalized.length < 100) {
      return;
    }

    if (!contentMap.has(normalized)) {
      contentMap.set(
        normalized,
        []
      );
    }

    contentMap
      .get(normalized)
      .push(node.id);
  });

  for (
    const nodeIds
    of contentMap.values()
  ) {
    if (nodeIds.length > 1) {
      warnings.push(
        `Identical substantial content appears in ${nodeIds.length} nodes: ${nodeIds.join(", ")}.`
      );
    }
  }

  // ==================================================
  // 11. SIBLING ORDER VALIDATION
  // ==================================================

  const siblingsByParent = new Map();

  curriculum.nodes.forEach(node => {
    if (!node?.id) {
      return;
    }

    const parentId =
      node.parent_id || "__ROOT__";

    if (!siblingsByParent.has(parentId)) {
      siblingsByParent.set(
        parentId,
        []
      );
    }

    siblingsByParent
      .get(parentId)
      .push(node);
  });

  for (
    const [parentId, siblings]
    of siblingsByParent.entries()
  ) {
    const usedOrders = new Set();

    siblings.forEach(node => {
      const order = Number(node.order);

      if (usedOrders.has(order)) {
        warnings.push(
          `Duplicate sibling order ${order} under parent "${parentId}".`
        );
      }

      usedOrders.add(order);
    });
  }

  // ==================================================
  // 12. DEPTH CHECK
  // ==================================================

  let maximumDepth = 0;

  curriculum.nodes.forEach(node => {
    if (!node?.id) {
      return;
    }

    let depth = 0;
    let current = node;

    const visited = new Set();

    while (
      current &&
      current.parent_id
    ) {
      if (visited.has(current.id)) {
        break;
      }

      visited.add(current.id);

      depth += 1;

      current =
        nodeMap.get(current.parent_id);
    }

    maximumDepth = Math.max(
      maximumDepth,
      depth
    );
  });

  if (maximumDepth > 12) {
    warnings.push(
      `Curriculum hierarchy is unusually deep (${maximumDepth} levels).`
    );
  }

  // Do not fail a shallow chapter automatically.
  // Instead flag it for inspection.
  if (
    curriculum.nodes.length > 1 &&
    maximumDepth === 1
  ) {
    warnings.push(
      "Curriculum hierarchy contains only chapter-level children. Verify that meaningful subtopics/concepts were not collapsed."
    );
  }

  // ==================================================
  // 13. EDUCATIONAL STRUCTURE STATISTICS
  // ==================================================

  const typeCounts = {};

  curriculum.nodes.forEach(node => {
    if (!node?.type) {
      return;
    }

    const type =
      String(node.type)
        .trim()
        .toLowerCase();

    typeCounts[type] =
      (typeCounts[type] || 0) + 1;
  });

  const exampleLikeTypes = new Set([
    "example",
    "worked_example",
    "activity",
    "experiment",
    "observation",
    "application",
    "exercise",
    "story",
    "case"
  ]);

  let explicitExampleOrActivityNodes = 0;

  curriculum.nodes.forEach(node => {
    const type =
      String(node?.type || "")
        .trim()
        .toLowerCase();

    if (exampleLikeTypes.has(type)) {
      explicitExampleOrActivityNodes += 1;
    }
  });

  // This is informational only. Examples can correctly live inside
  // concept content instead of becoming separate nodes.
  if (explicitExampleOrActivityNodes === 0) {
    warnings.push(
      "No standalone example/activity nodes were generated. This is acceptable if examples and activities are preserved inside relevant node content."
    );
  }

  // ==================================================
  // FINAL RESULT
  // ==================================================

  return {
    valid: errors.length === 0,

    errors,

    warnings,

    stats: {
      totalNodes:
        curriculum.nodes.length,

      rootNodes:
        rootNodes.length,

      maximumDepth,

      learningObjectives:
        Array.isArray(
          curriculum.learning_objectives
        )
          ? curriculum.learning_objectives.length
          : 0,

      nodeTypes:
        typeCounts,

      explicitExampleOrActivityNodes
    }
  };
}

module.exports = {
  validateCurriculum
};
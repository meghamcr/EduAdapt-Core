const fs = require("fs");
const path = require("path");

const prisma = require("../../prismaClient");

const {
  validateCurriculum
} = require("./curriculumValidator");

// ==================================================
// FILE LOADING
// ==================================================

function readJsonFile(filePath) {
  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Processed curriculum file not found: ${absolutePath}`
    );
  }

  if (
    path.extname(absolutePath).toLowerCase() !== ".json"
  ) {
    throw new Error(
      `Curriculum file must be JSON: ${absolutePath}`
    );
  }

  let data;

  try {
    data = JSON.parse(
      fs.readFileSync(
        absolutePath,
        "utf8"
      )
    );
  } catch (error) {
    throw new Error(
      `Could not parse curriculum JSON "${absolutePath}": ${error.message}`
    );
  }

  return {
    absolutePath,
    data
  };
}

// ==================================================
// CURRICULUM VALIDATION
// ==================================================

function validateBeforeImport(data) {
  const result =
    validateCurriculum(data);

  if (result.warnings.length > 0) {
    console.log(
      "\nCurriculum validation warnings:"
    );

    result.warnings.forEach(
      warning => {
        console.log(
          `  ⚠ ${warning}`
        );
      }
    );
  }

  if (!result.valid) {
    console.error(
      "\nCurriculum validation errors:"
    );

    result.errors.forEach(
      error => {
        console.error(
          `  ✗ ${error}`
        );
      }
    );

    throw new Error(
      "Curriculum validation failed. Database was not modified."
    );
  }

  return result;
}

// ==================================================
// SORT NODES PARENT-FIRST
// ==================================================

function sortNodesParentFirst(nodes) {
  const remaining = [...nodes];
  const ordered = [];
  const resolved = new Set();

  while (remaining.length > 0) {
    let addedThisPass = 0;

    for (
      let i = remaining.length - 1;
      i >= 0;
      i--
    ) {
      const node =
        remaining[i];

      const parentReady =
        !node.parent_id ||
        resolved.has(
          node.parent_id
        );

      if (!parentReady) {
        continue;
      }

      ordered.push(node);

      resolved.add(
        node.id
      );

      remaining.splice(
        i,
        1
      );

      addedThisPass++;
    }

    if (addedThisPass === 0) {
      const unresolved =
        remaining
          .map(
            node =>
              `${node.id} -> ${node.parent_id}`
          )
          .join(", ");

      throw new Error(
        `Unable to resolve curriculum node parents: ${unresolved}`
      );
    }
  }

  return ordered;
}

// ==================================================
// IMPORT ONE CURRICULUM CHAPTER
// ==================================================

async function importCurriculumFile(
  filePath
) {
  const {
    absolutePath,
    data
  } = readJsonFile(
    filePath
  );

  console.log(
    "\n========================================"
  );

  console.log(
    `IMPORTING: ${path.basename(
      absolutePath
    )}`
  );

  console.log(
    "========================================"
  );

  console.log(
    `${data.board || "Unknown Board"} | Grade ${data.grade || "?"} | ${data.subject || "Unknown Subject"}`
  );

  console.log(
    `Book: ${data.book || "Unknown Book"}`
  );

  console.log(
    `Chapter ${data.chapter_number || "?"}: ${data.chapter || "Unknown Chapter"}`
  );

  // --------------------------------------------------
  // Validate everything BEFORE database modification
  // --------------------------------------------------

  const validation =
    validateBeforeImport(
      data
    );

  console.log(
    `✓ Curriculum validation passed (${validation.stats.totalNodes} nodes)`
  );

  // --------------------------------------------------
  // Prepare nodes
  // --------------------------------------------------

  const orderedNodes =
    sortNodesParentFirst(
      data.nodes
    );

  // --------------------------------------------------
  // Database transaction
  // --------------------------------------------------

  await prisma.$transaction(
    async tx => {

      // ==============================================
      // BOOK
      // ==============================================

      await tx.curriculumBook.upsert({
        where: {
          id: data.book_id
        },

        update: {
          board: data.board,
          grade: String(
            data.grade
          ),
          subject:
            data.subject,
          title:
            data.book
        },

        create: {
          id:
            data.book_id,
          board:
            data.board,
          grade:
            String(
              data.grade
            ),
          subject:
            data.subject,
          title:
            data.book
        }
      });

      // ==============================================
      // CHAPTER
      // ==============================================

      await tx.curriculumChapter.upsert({
        where: {
          id:
            data.chapter_id
        },

        update: {
          bookId:
            data.book_id,

          chapterNumber:
            Number(
              data.chapter_number
            ),

          title:
            data.chapter,

          learningObjectives:
            data.learning_objectives ||
            [],

          sourceFile:
            path.basename(
              absolutePath
            )
        },

        create: {
          id:
            data.chapter_id,

          bookId:
            data.book_id,

          chapterNumber:
            Number(
              data.chapter_number
            ),

          title:
            data.chapter,

          learningObjectives:
            data.learning_objectives ||
            [],

          sourceFile:
            path.basename(
              absolutePath
            )
        }
      });

      // ==============================================
      // REMOVE OLD VERSION OF THIS CHAPTER'S NODES
      // ==============================================

      await tx.curriculumNode.deleteMany({
        where: {
          chapterId:
            data.chapter_id
        }
      });

      // ==============================================
      // INSERT NEW HIERARCHY
      // ==============================================

      for (
        const node
        of orderedNodes
      ) {
        await tx.curriculumNode.create({
          data: {
            id:
              node.id,

            chapterId:
              data.chapter_id,

            parentId:
              node.parent_id ||
              null,

            title:
              node.title,

            type:
              node.type,

            description:
              node.description ||
              null,

            content:
              node.content,

            orderIndex:
              Number(
                node.order
              )
          }
        });
      }
    }
  );

  // --------------------------------------------------
  // VERIFY THIS CHAPTER
  // --------------------------------------------------

  const storedChapter =
    await prisma.curriculumChapter.findUnique({
      where: {
        id:
          data.chapter_id
      },

      include: {
        book: true,

        nodes: true
      }
    });

  if (!storedChapter) {
    throw new Error(
      `Chapter "${data.chapter_id}" could not be verified after import.`
    );
  }

  if (
    storedChapter.nodes.length !==
    data.nodes.length
  ) {
    throw new Error(
      `Node verification failed. Expected ${data.nodes.length}, found ${storedChapter.nodes.length}.`
    );
  }

  console.log(
    `✓ Book: ${storedChapter.book.title}`
  );

  console.log(
    `✓ Chapter: ${storedChapter.title}`
  );

  console.log(
    `✓ Nodes stored: ${storedChapter.nodes.length}`
  );

  console.log(
    `✓ Maximum hierarchy depth: ${validation.stats.maximumDepth}`
  );

  console.log(
    "✓ Curriculum chapter stored successfully."
  );

  return {
    board:
      data.board,

    grade:
      String(
        data.grade
      ),

    subject:
      data.subject,

    bookId:
      data.book_id,

    chapterId:
      data.chapter_id,

    chapter:
      data.chapter,

    nodeCount:
      data.nodes.length,

    maximumDepth:
      validation.stats.maximumDepth
  };
}

// ==================================================
// COMMAND LINE EXECUTION
// ==================================================

async function main() {
  const files =
    process.argv.slice(2);

  if (files.length === 0) {
    console.log(
      "\nEduAdapt Curriculum Database Importer"
    );

    console.log(
      "\nUsage:"
    );

    console.log(
      "node importCurriculumToDatabase.js <chapter.json>"
    );

    console.log(
      "\nMultiple chapters can also be supplied:"
    );

    console.log(
      "node importCurriculumToDatabase.js chapter-1.json chapter-2.json"
    );

    console.log(
      "\nThis importer is grade-, subject-, book-, and chapter-independent."
    );

    return;
  }

  console.log(
    "\n========================================"
  );

  console.log(
    "EDUADAPT CURRICULUM → DATABASE"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Files to import: ${files.length}`
  );

  let imported = 0;
  let totalNodes = 0;

  for (
    const file
    of files
  ) {
    const result =
      await importCurriculumFile(
        file
      );

    imported++;

    totalNodes +=
      result.nodeCount;
  }

  console.log(
    "\n========================================"
  );

  console.log(
    "IMPORT COMPLETE"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Chapters imported: ${imported}`
  );

  console.log(
    `Nodes imported: ${totalNodes}`
  );
}

// ==================================================
// RUN ONLY WHEN EXECUTED DIRECTLY
// ==================================================

if (require.main === module) {
  main()
    .catch(error => {
      console.error(
        "\n✗ CURRICULUM IMPORT FAILED"
      );

      console.error(
        error
      );

      process.exitCode = 1;
    })
    .finally(
      async () => {
        await prisma.$disconnect();
      }
    );
}

module.exports = {
  importCurriculumFile,
  sortNodesParentFirst
};
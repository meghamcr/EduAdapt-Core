function cleanJsonResponse(text) {
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  let cleaned = text.trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "");
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\s*```$/, "");
  }

  return cleaned.trim();
}

function createNodeId({
  grade,
  subject,
  chapterNumber,
  index
}) {
  const cleanSubject = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `ncert-g${grade}-${cleanSubject}-ch${chapterNumber}-node-${index}`;
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is missing from the backend .env file."
    );
  }

  const model = "gemini-3.6-flash";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:generateContent?key=${apiKey}`;

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 90000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      })
    });

    const responseBody = await response.text();

    if (!response.ok) {
      throw new Error(
        `Gemini API error ${response.status}: ${responseBody}`
      );
    }

    let data;

    try {
      data = JSON.parse(responseBody);
    } catch (error) {
      throw new Error(
        `Could not parse Gemini API response: ${error.message}`
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "";

    if (!text) {
      throw new Error(
        `Gemini returned no generated text. Response: ${responseBody}`
      );
    }

    return text;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "Gemini request timed out after 90 seconds."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseCurriculum({
  board = "NCERT",
  grade,
  subject,
  bookId,
  book,
  chapterNumber,
  chapterId,
  extractedText
}) {
  if (!grade) {
    throw new Error("grade is required.");
  }

  if (!subject) {
    throw new Error("subject is required.");
  }

  if (!bookId) {
    throw new Error("bookId is required.");
  }

  if (!book) {
    throw new Error("book is required.");
  }

  if (!chapterNumber) {
    throw new Error("chapterNumber is required.");
  }

  if (!chapterId) {
    throw new Error("chapterId is required.");
  }

  if (!extractedText) {
    throw new Error("extractedText is required.");
  }

  const prompt = `
You are the curriculum ingestion engine for EduAdapt.

Your job is to analyse ONLY the supplied textbook chapter and transform
it into a rich, source-grounded, hierarchical curriculum representation
for an adaptive learning and educational game generation system.

The resulting curriculum will later be used to generate:

- lessons
- concept explanations
- game introductions
- educational game mechanics
- questions
- hints
- remediation
- adaptive explanations
- examples for struggling students
- activities
- revision content

Therefore, DO NOT reduce the textbook into short summaries.

==================================================
AUTHORITATIVE CURRICULUM INFORMATION
==================================================

Board: ${board}
Grade: ${grade}
Subject: ${subject}
Book ID: ${bookId}
Book: ${book}
Chapter Number: ${chapterNumber}
Chapter ID: ${chapterId}

==================================================
SOURCE-GROUNDING RULES
==================================================

1. Use ONLY information supported by the supplied textbook chapter.

2. Do NOT introduce external syllabus material, outside examples,
   outside facts, or invented concepts.

3. Determine the chapter title from the supplied textbook.

4. Preserve the educational meaning and useful detail of the source.

5. You may clean formatting and extraction noise, but do not remove
   useful educational content merely to make the result shorter.

6. Do not fabricate missing textbook content.

==================================================
DYNAMIC HIERARCHY RULES
==================================================

7. A chapter MUST NOT automatically be treated as one single topic.

8. Analyse the actual educational structure of the chapter and identify
   all meaningful topics and their relationships.

9. Hierarchy depth is completely dynamic.

A chapter may naturally contain structures such as:

chapter
→ topic
→ concept

or:

chapter
→ topic
→ subtopic
→ concept

or:

chapter
→ topic
→ subtopic
→ concept
→ deeper concept

or another meaningful structure supported by the textbook.

10. There is NO fixed number of topics, subtopics, concepts, or levels.

11. A topic may contain multiple subtopics.

12. A subtopic may contain multiple concepts.

13. A concept may contain meaningful child concepts, examples,
    activities, observations, processes, or other educational elements.

14. Do NOT create artificial hierarchy just to increase depth.

15. Do NOT turn every paragraph into a separate node.

16. Determine node boundaries using educational meaning, including:

- textbook headings
- subheadings
- changes in concept
- definitions
- activities
- worked examples
- processes
- classifications
- observations
- exercises used for teaching
- meaningful contextual sections

17. Use parent_temp_id recursively to preserve the hierarchy.

18. The main chapter node must have parent_temp_id "".

19. Every other node must point to a valid parent node.

==================================================
FULL CONTENT PRESERVATION
==================================================

20. The "description" field is a SHORT semantic description.

21. The "content" field is NOT a summary field.

22. For each node, preserve substantial educational material from the
    textbook that directly belongs to that node.

23. The content should contain enough source-grounded information for
    another AI to teach or generate a game about the concept without
    having to guess what the textbook explained.

24. When present and educationally relevant, preserve:

- explanations
- definitions
- important facts
- conceptual reasoning
- procedures
- methods
- steps
- examples
- worked examples
- calculations
- real-life examples contained in the textbook
- activities
- experiments
- observations
- comparisons
- classifications
- relationships between concepts
- tables expressed meaningfully in text
- important notes
- contextual stories or situations used to teach the concept
- questions that form part of the teaching process
- problem-solving approaches

25. Do NOT replace a detailed textbook explanation with one or two
    generic sentences.

26. Do NOT unnecessarily paraphrase away useful detail.

27. Keep content coherent and readable after cleaning PDF extraction
    artifacts.

==================================================
EXAMPLE AND ACTIVITY PRESERVATION
==================================================

28. Examples are important learning material and MUST NOT be discarded.

29. Preserve examples inside the content of the concept they explain
    when they are closely tied to that concept.

30. A substantial worked example may become its own child node when it
    has independent educational value.

31. Preserve the reasoning or steps of worked examples when those steps
    are available in the source.

32. Activities, experiments and observations should be preserved when
    they help teach or demonstrate a concept.

33. Meaningful activities may become child nodes with type "activity"
    or "experiment".

34. Do NOT create a separate node for every tiny example or question.
    Keep related material together when that produces a better
    educational unit.

==================================================
PARENT AND CHILD CONTENT
==================================================

35. Parent nodes should describe and contain material directly relevant
    to the parent concept.

36. Child nodes should contain the detailed material specifically
    belonging to the child concept.

37. Do NOT copy the complete chapter text into every node.

38. Do NOT unnecessarily duplicate the same large block of content
    across parent and child nodes.

39. However, never remove necessary context merely to avoid duplication.

==================================================
LEARNING OBJECTIVES
==================================================

40. Generate learning objectives only from what the chapter actually
    teaches.

41. Objectives should represent meaningful learning outcomes rather
    than arbitrary section names.

==================================================
ORDERING
==================================================

42. Preserve the educational/textbook order of sibling nodes using
    the "order" field.

43. "order" represents the position among children of the same parent.

==================================================
ALLOWED NODE TYPES
==================================================

Use the most semantically appropriate type.

Possible types include:

chapter
topic
subtopic
concept
activity
experiment
observation
process
classification
application
example
worked_example
exercise
story
case
fact

This list is NOT a required hierarchy.

==================================================
IGNORE EXTRACTION NOISE
==================================================

Ignore non-educational PDF noise such as:

- page numbers
- repeated running headers
- repeated running footers
- reprint information
- printing metadata
- copyright boilerplate
- repeated book titles caused by page headers
- meaningless extraction artifacts

Do NOT classify useful textbook content as noise.

==================================================
OUTPUT REQUIREMENTS
==================================================

Return JSON only.

Do not return markdown.

Return this general structure:

{
  "board": "${board}",
  "grade": "${grade}",
  "subject": "${subject}",
  "book_id": "${bookId}",
  "book": "${book}",
  "chapter_id": "${chapterId}",
  "chapter_number": ${chapterNumber},
  "chapter": "Exact textbook chapter title",
  "learning_objectives": [
    "Source-grounded learning objective"
  ],
  "nodes": [
    {
      "temp_id": "node-1",
      "parent_temp_id": "",
      "title": "Exact chapter title",
      "type": "chapter",
      "description": "Short semantic description of the chapter",
      "content": "Substantial source-grounded educational content belonging directly to this node.",
      "order": 1
    },
    {
      "temp_id": "node-2",
      "parent_temp_id": "node-1",
      "title": "Meaningful topic title",
      "type": "topic",
      "description": "Short semantic description",
      "content": "Detailed source-grounded content including relevant explanations, examples and teaching context.",
      "order": 1
    }
  ]
}

==================================================
TEXTBOOK CHAPTER
==================================================

---------------- BEGIN TEXTBOOK TEXT ----------------

${extractedText}

---------------- END TEXTBOOK TEXT ----------------
`;

  const responseText = await callGemini(prompt);
  const cleaned = cleanJsonResponse(responseText);

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error("\nGemini raw response:\n");
    console.error(cleaned);

    throw new Error(
      `Could not parse Gemini curriculum JSON: ${error.message}`
    );
  }

  if (!Array.isArray(parsed.nodes)) {
    throw new Error(
      "Gemini response does not contain a nodes array."
    );
  }

  if (parsed.nodes.length === 0) {
    throw new Error(
      "Gemini did not generate curriculum nodes."
    );
  }

  const tempToRealId = new Map();

  parsed.nodes.forEach((node, index) => {
    const tempId =
      String(node.temp_id || `node-${index + 1}`).trim();

    if (tempToRealId.has(tempId)) {
      throw new Error(
        `Duplicate curriculum temp_id generated: ${tempId}`
      );
    }

    const realId = createNodeId({
      grade,
      subject,
      chapterNumber,
      index: index + 1
    });

    tempToRealId.set(tempId, realId);
  });

  const nodes = parsed.nodes.map((node, index) => {
    const tempId =
      String(node.temp_id || `node-${index + 1}`).trim();

    const id = tempToRealId.get(tempId);

    let parentId = "";

    if (node.parent_temp_id) {
      const parentTempId =
        String(node.parent_temp_id).trim();

      if (!tempToRealId.has(parentTempId)) {
        throw new Error(
          `Node "${tempId}" references missing parent "${parentTempId}".`
        );
      }

      parentId = tempToRealId.get(parentTempId);
    }

    return {
      id,
      parent_id: parentId,
      title: String(node.title || "").trim(),
      type: String(node.type || "concept")
        .trim()
        .toLowerCase(),
      description: String(
        node.description || ""
      ).trim(),
      content: String(
        node.content || ""
      ).trim(),
      order:
        typeof node.order === "number"
          ? node.order
          : index + 1
    };
  });

  return {
    board,
    grade: String(grade),
    subject,
    book_id: bookId,
    book,
    chapter_id: chapterId,
    chapter_number: Number(chapterNumber),
    chapter: String(
      parsed.chapter || ""
    ).trim(),
    learning_objectives:
      Array.isArray(parsed.learning_objectives)
        ? parsed.learning_objectives
            .map(objective =>
              String(objective).trim()
            )
            .filter(Boolean)
        : [],
    nodes
  };
}

module.exports = {
  parseCurriculum
};
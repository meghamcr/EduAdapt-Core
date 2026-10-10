# Chapter 1 source authority and readiness

2026-09-30 — NCERT, Grade 4 Mathematics, Maths Mela, Reprint 2026–27,
Chapter 1, Shapes Around Us. **PASS for the requested textual/structural
ingestion gate. Artifact remains UNREVIEWED; this is not curriculum approval.**
Only this chapter was generated. Level boundaries and game ideas below are
analysis, not implemented behavior.

## Implementation and scope

The remaining root cause was that a model could label its rewritten explanation
or guessed label-to-picture association as explicit source text. Prompt guidance
alone could not enforce that boundary.

In text mode, `sourceTextUnits` now assigns each nonblank extracted line a stable
document/page/original-line-index ID. Repeated identical lines retain distinct
occurrence IDs. Original indentation, punctuation and numbers survive. Stability
is within the same source/extraction identity, not across changed PDFs or extractors.
Source SHA-256 and implementation fingerprints distinguish those versions.

Gemini groups these anchors into educational materials and a recursive hierarchy.
For EXPLICIT_SOURCE_CONTENT, the parser ignores generated prose and reconstructs
text from registered lines, sorted in source order. Page references are derived
from those same lines. Missing, unknown or repeated anchors within a material
fail closed with safe diagnostics. Other authorities remain separate. Anchor IDs
are wire-only; the persisted curriculum schema is unchanged. The implementation
fingerprint includes the new module, preventing reuse of an older free-text
candidate as though it used this safeguard.

Units are not curriculum nodes or levels. Titles, descriptions, role assignments,
objectives and grouping remain model-organized metadata and need review. This
mechanism prevents authoritative rewriting; it does not prove that the model
selected every relevant line or grouped it correctly. Coverage and source-order
audit remain necessary. The safeguard applies to the page-aware text workflow;
it is not a claim of deterministic OCR or visual reconstruction in PDF mode.

Files in the accumulated ingestion change:

- Added `src/services/curriculumIngestion/textAuthority.js`.
- Modified `curriculumParser.js`, `curriculumResponseSchema.js`, `sourceContext.js`
  and `ingestCurriculum.js` in that directory for anchors, identity, reconstruction,
  diagnostics and cache invalidation.
- Preserved earlier changes to `curriculumValidator.js` and `sourceFidelity.js`
  for deferred visuals, structured authority and textual coverage.
- Added `tests/curriculumIngestion/textAuthority.test.js` (nine tests) and retained
  `deferredVisuals.test.js` (six tests).
- Modified `fixtures/helpers.js`, `requestPayload.test.js`,
  `sourceAuthority.test.js` and `structuredOutput.test.js` in that test directory.
- Documentation: this report, `grade4-ingestion-quality.md` and
  `grade4-textual-ingestion-quality.md` preserve the historical audit trail.

The final continuation added repeat-line identity, passage/question hierarchy,
synthesized-parent separation and safe diagnostic tests; numeric source-selection
diagnostics; and generic instructional-progression guidance. No chapter-specific
answers, page numbers or shape names were added to ingestion code.

## Generation and reproducibility

Local artifact:
`curriculum-local/processed/ncert-grade-4-mathematics-maths-mela/chapter-1.json`

- Model: `gemini-3.5-flash`; source mode: page-aware text with source units.
- Completed: 2026-09-29T22:57:15.749Z (2026-09-30 local date).
- Two provider attempts under the existing bounded policy: first HTTP 503;
  second HTTP 200, finish reason STOP. No cosmetic regeneration followed.
- Successful request: 78,279 bytes; 56,307 candidate text characters.
- Tokens: 21,835 prompt; 18,979 candidate; 26,964 thoughts; 67,778 total.
- Artifact SHA-256:
  `9ca2318cf13fe3dc48311548f8aec74922242942908b4f1a9a76def04fa2990b`.
- Source `demm101.pdf`: 23 pages; SHA-256
  `995681c844bbca58feba5da6623d7b11595ee8d93e73cf09a808054e13162fa9`.
- Source and content fingerprints verified; no extraction warnings.
- Previous candidate preserved in
  `curriculum-local/review/grade4-textual/chapter-1-second-candidate.json`.
- Successful wire candidate and summary retained under that review directory with
  suffix `2026-09-29T22-53-41-130Z.json`. They are local diagnostic evidence, not
  approved curriculum. The wire candidate permits exact source-anchor replay.

## Textual fidelity and structure

Structural validation: **valid, zero errors**. 27 nodes, one root, maximum depth
2 edges (three levels including root), five grounded learning objectives and
86 materials. There are six topic nodes, nine concept nodes, seven activity nodes,
three exercise nodes and one investigation node in addition to the chapter root.

Authority distribution: 86 EXPLICIT_SOURCE_CONTENT; zero SOURCE_GROUNDED_SYNTHESIS;
zero MODEL_VISUAL_INTERPRETATION; zero MODEL_INFERENCE. All 86 material texts and
source references exactly match independent replay of their registered anchors.
All authoritative node content is rendered from these materials. Generated
descriptions are organizational metadata, not source quotations or learner notes.

506 available source units; 459 selected once; 47 unselected; zero repeated
selections. Manual review of every omission found 43 page-number/reprint lines and
four isolated diagram labels (A on page 16; A, A, B on page 21). Their corresponding
instructions explicitly name the points and remain intact. No instructionally
meaningful extracted prose was omitted. This is extraction-relative coverage;
it does not claim preservation of graphical strokes or every image-embedded label.

All 67 source question marks survive, and the source-comparison triage found no
suspicious rewritten passages. Those counts supplement, rather than replace,
the material-by-material review against the source extraction and PDF pages.

| Content | Result and location (N = 1-based artifact node; M = material) |
| --- | --- |
| Context and passages | Diksha's monument visit and model context in N2; Squiggly/Wiggly stories and their questions together in N20 M1–M2. Two story_context roles include one chapter-heading container; the spider passages are activity-role text. |
| Explanations/definitions | Brick materials N4; net definition N6; angle definition N13; acute/obtuse definitions N15; centre/radius N22; diameter and radius investigation N23. Four definition roles, one explanation, seven concept roles and one observation. |
| Examples | No material is labeled example/worked_example. Contextual and concrete examples remain: monuments, named prisms/pyramids, bricks, the supplied opposite die faces and the house's seven-angle given. No worked solution was manufactured for an unanswered exercise. |
| Activities/projects | 28 activity materials; street project retained in N4 M4 alongside teacher guidance; model construction, paper sphere, straw solids, grids, circle folding and compass work retained. |
| Investigations | Three investigation materials: F+V–E and triangle/rectangle deformation. Pentagon and circle investigations also survive under activity/question roles. |
| Exercises/questions | 14 exercise, 16 question and one visual_dependent_task materials; 65 total materials marked student_completion. All six riddles, numerical subparts, blank tables, net tasks, model challenges and angle constraints retained. |
| Tables/blanks | Three blank-table materials; no counts filled in. Equal/unequal and half/double choices remain unanswered. |
| Numerical givens | Five storeys/379 stairs; die 6 opposite 1; house seven angles; riddle properties; matchstick counts; four straw/ball pairs (12/8, 9/6, 15/10, 10/6) unchanged. |
| Teacher notes | All six notes retained: pages 2, 7, 14, 15, 17, 18. Source-supplied triangle rigidity and square-as-rectangle guidance remain available separately from open student investigations. |
| Objectives | Five objectives cover solids/properties, nets, angles, polygons/rigidity and circle parts, with source-page evidence. They are grounded organizational goals, not verbatim textbook statements or supplied answers. |
| Previously problematic labels | Raw net-option labels and cube-model labels retained without invented mappings, inferred solid names, piece counts or colour answers. Visual-dependent tasks stay open. |

Instructional order is usable with an explicit qualification: this is a topic
hierarchy, not a ready-made chronological lesson sequence. N19–N20 (pages 20–22)
sit under the polygon topic before the circles topic in tree traversal. N22 M4
contains the page-16 pentagon transition after circle materials, and N25 mixes
circle review with later polygon puzzles. Source-page provenance and the retained
wire anchors permit the intended progression to be recovered; the level analysis
below does so. A future level builder must not equate depth-first traversal or
one node with one level. No hierarchy rewrite or additional call was made for
these grouping imperfections.

## Warnings and remaining limits

42 visual warnings: 39 VISUAL_DEPENDENCY and three VISUAL_UNRESOLVED (two material
dependencies on end-of-book nets/cards plus the chapter's text-only warning).
Diagrams, grids, geometry arrangements, colour-face relationships, letters drawn
as shapes, cube towers, puzzle networks and original figure layouts are deferred.
No source answers were inferred from those missing visuals.

Eight additional quality warnings concern short heading/container content and
potentially shallow nodes. Their children/materials supply the substantive
content; do not turn heading containers into isolated games or notes.

Role metadata is imperfect but not destructive: the street project shares a
teacher-note material; N26 contains an unanswered relationship question marked
concept/student_completion=false; examples are embedded rather than tagged
example. The text remains an open question, with no asserted answer. Future
assessment selection must inspect the material and reviewed context rather than
trust a role flag alone. A few printed page/header fragments remain. Some visual
warning descriptions are empty, so tasks must be interpreted with their cited
source context. These are review/presentation caveats, not lost textbook prose.

## Level-readiness analysis — no implementation

These are likely coherent groups in source order, not fixed levels. A level can
combine several nodes/materials, and a node can contribute to multiple groups.
Teacher guidance must be distinguished from learner-facing explanation. Final
notes can be produced only from approved curriculum.

| Likely group / source pages | Curriculum grouping | Notes/examples available | Practice and visual dependencies |
| --- | --- | --- | --- |
| 1. Buildings as solid models / 1–2 | N2–N4; N1 is navigation | Monument story, building materials, supplied monument facts, reflection vocabulary | Build models; five reflection questions; street project; monument pictures deferred. |
| 2. Making and describing solids / 3–4 | N5–N8 plus N9 M1–M2 | Net definition, printed prism/pyramid labels, face/edge/corner table vocabulary | Paper sphere, nets, straw models, blank tables and F+V–E investigation; nets/solid views require new presentation. |
| 3. Comparing, sorting and representing solids / 5–9 | N9 M3–M9, N10–N11 | Supplied opposite-face example, sorting criteria, teacher explanation of adjacency/opposition and overlapping sets | Colour/face observation, sorting, cube construction/drawing, six riddles and net matching; retain open answers; defer original diagrams and label mappings. |
| 4. Recognising and creating angles / 10–13 | N12–N15 | Angle definition, supplied seven-angle example, right-angle checker activity, acute/obtuse definitions and classroom examples | Identify, draw, compare and colour angles; grids, paper folds and figures need visual presentation. |
| 5. Shape rigidity and polygon comparison / 14–16 | N16–N18 and N22 M4 | Straw construction context, source teacher guidance about rigidity and square/rectangle relationship | Push/trace/compare shapes, classify right angles, equal-sided pentagon investigation; preserve unanswered observations. |
| 6. Circles, radius and diameter / 16–19 | N21; N22 M1–M3; N23–N24; N25 M4 | Centre/radius definition, diameter terminology, circle-making and measuring instructions | Equal-distance construction, paper folds, radius/diameter discussion, compass designs and wheel comparisons; no automatic half/double answer. |
| 7. Shape composition and reasoning puzzles / 19–22 | N25 M1–M3; N19; N20 | Puzzle instructions, sorting criteria, Squiggly/Wiggly passages and constraints | Divide/cut shapes, classify cards, trace paths, move/remove matchsticks; diagram-specific puzzles need a separately validated new layout. |
| 8. Integrated review / 22–23 | N26–N27 | Existing definitions/teacher guidance can be revisited; numerical model givens and angle criteria remain source-backed | Four solid-model challenges; sides/angles classification; draw/count/identify angle combinations; figures deferred. |

There is enough source-grounded instructional material for notes plus practice.
The source often teaches through investigation rather than an expository answer
paragraph: notes should explain the task/context and supplied facts without
converting an open investigation into a purported source conclusion.

## Game-readiness analysis — no games generated

| Groups | Suitable mechanics and opportunities |
| --- | --- |
| 1 | Passage/comprehension, model construction, selection and comparison; connected stages from reading context to selecting blocks to explaining a model. |
| 2–3 | Matching, sorting/classification, drag/drop, construction, visual identification, observation and investigation; stages can move from building a solid to counting properties to a riddle/net challenge. |
| 4 | Interactive angle identification, selection, drawing/rotation, classification and exploration; progress from noticing corners to constructing and distinguishing angle types. |
| 5 | Shape manipulation and investigation, prediction/observation and comparison; trace changes before revisiting teacher-supported properties. |
| 6 | Sequencing fold steps, equal-distance construction, measuring/exploration, compass interaction and visual comparison; connect centre/radius discovery to diameter investigation. |
| 7 | Passage-led path puzzles, drag/drop matchsticks, cutting/composition puzzles and open sorting; preserve each stated constraint and validate any new puzzle layout independently. |
| 8 | Short exercise-based challenges and interconnected review stages drawing on several earlier groups; not one game per topic. |

Reusable mechanics are opportunities, not authorized answers, assets or GameSpecs.
New visuals must satisfy the reviewed task constraints and must not masquerade as
the original textbook diagram. Open responses may need a reviewed rubric rather
than an invented answer key. Adaptive evidence will later determine advancement,
extra notes, hints, reinforcement or remediation; game completion alone is not
encoded as advancement here.

## Verification and safety

Before generation: 105 focused curriculum tests and 570 complete backend tests
passed, zero failures/skips. Final post-generation results:

| Check | Exact result |
| --- | --- |
| `npm run test:curriculum` in backend | 105 passed, 0 failed, 0 skipped, 0 cancelled (3,159.709875 ms) |
| `npm test` in backend | 570 passed, 0 failed, 0 skipped, 0 cancelled (6,169.421375 ms) |
| JavaScript `node --check` across ingestion source/tests | 28 files passed |
| Scoped `git diff --check` | Passed |
| Candidate-anchor replay | All 86 authoritative materials and page-reference lists match exactly |
| Source/content fingerprints | Match |

Tests use deterministic fixtures/mocked AI and in-memory persistence; the complete
suite includes localhost HTTP tests, not live database operations.

Artifact remains UNREVIEWED. No DB writes, import, materialization, approval,
Prisma changes, migration changes, Unity edits, unrelated HTTP edits, commit,
push or deployment were performed. No other chapter or second book was processed.
Local source/candidate artifacts remain local; nothing was staged.

Git review: the accumulated tracked ingestion diff contains 10 files,
163 insertions and 18 deletions. Six task files remain untracked: the new authority
module, two test files and three ingestion reports listed above. `git diff --check`
passes; the six untracked files also pass a trailing-whitespace check. The staged
file list is empty; the source PDF and generated artifact are ignored local files.
Pre-existing `.gitignore`, `backend/package.json`, runtime documentation,
`backend/src/http/`, `backend/tests/http/` and `EduAdapt-GameRuntime/` work remains
in the working tree and was not changed by this continuation.

**STOP after Chapter 1. Ready to review this curriculum and the proposed
Chapter → Levels → Notes → Games design; no such layer was implemented here.**

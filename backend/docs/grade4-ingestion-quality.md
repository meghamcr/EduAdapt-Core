# Grade 4 ingestion quality review

> Historical review under the earlier gate. The updated policy and current results are documented in [grade4-textual-ingestion-quality.md](grade4-textual-ingestion-quality.md). Deferred visuals alone no longer block ingestion; unsupported authoritative claims still do.

This review concerns local, UNREVIEWED artifacts only. No curriculum is approved,
imported or materialized by this work. Structural validity and page coverage do
not establish semantic completeness. Visual descriptions remain model
interpretations; original PDF pages are the source assets.

## Sources and implementation inspected

- `curriculum-local/ingestion.json`, `ingestion-phase1b.json`
- All 24 configured PDFs; full extraction and SHA-256 inventory in local
  `curriculum-local/review/grade4-batch/source-preflight.json`
- Normal processed Maths Chapter 1, the separate previous Phase 1B artifact,
  previous fidelity/visual review and source-provenance records
- All 23 Maths Chapter 1 page renders and extracted source text
- Ingestion runner, configuration, identity/resume, retry, extraction, parser,
  source-context, source-fidelity, response schema, validator and related tests

The starting normal Chapter 1 artifact was the old text-only baseline: 21 nodes,
11 objectives, depth 3 edges, 1 chapter / 4 topics / 7 subtopics / 9 concepts.
It had no page-aware authoritative materials. A byte-for-byte backup is retained
locally at `curriculum-local/review/grade4-batch/chapter-1-before.json`.
The separate Phase 1B artifact was not silently copied or re-fingerprinted into
normal outputs. Regeneration uses the current source-authority pipeline.

## Chapter 1 baseline audit

PDF page numbers below are original PDF pages (1–23). Source SHA-256:
`995681c844bbca58feba5da6623d7b11595ee8d93e73cf09a808054e13162fa9`.

| Pages | Finding against the old normal output | Educational implication |
| --- | --- | --- |
| 1–2 | Monument context, 5 storeys and 379 stairs retained. Five building-reflection prompts, remove-one-piece/improvement discussion, street project, brick comparison and materials-collection teacher note omitted. | Lost modelling choices, explanation and practical project scaffolding. |
| 3 | Net explanation and named prisms/pyramids retained; paper-strip sphere craft omitted. End-of-book nets mentioned but not recorded as missing assets. | Construction task missing; external dependency unresolved. |
| 3 | Pyramid fill-in questions became assertions about triangular faces meeting at one point. | Discovery questions converted into answers. |
| 4 | Blank faces/corners/edges table was filled with answers for five solids. F+V−E task and face/edge sorting categories retained. | An invented answer key replaced learner work; even correct arithmetic is not source authority. |
| 5 | Die questions and opposite-colour questions retained in text; all five border colouring/marking instructions omitted. | Lost property-classification activity; cube orientations/colours unavailable in old artifact. |
| 6–7 | Sorting labels mostly retained, but separate versus overlapping circles and the shared region were not represented by an asset reference. | Spatial classification cannot be reconstructed reliably from text. |
| 7 | Four construction models A–D conflated with two separate cube-counting towers. | Wrong task inventory and association with figures. |
| 8 | Dot-paper completion mentioned; exact grid absent. Six riddles retained but supplied parenthesized answers; five-shape comparison discussion omitted. | Learner matching task changed into an answer list. |
| 9 | Three net exercise families mentioned generically without their figures/options. | No grounded way to execute these visual challenges from artifact alone. |
| 10 | Angle definition and the printed count of seven house angles retained correctly. Object angle-marking exercise omitted. | Seven is source-provided, not a hallucination; the supporting drawing still matters. |
| 11 | Right-angle checker supplied an ungrounded verbal two-halves folding procedure. | Diagram-dependent construction was replaced by an underspecified procedure. |
| 12–13 | Acute/obtuse definitions, classroom examples, grid tasks and red/green/blue angle instructions retained. Grids, letters and figures lacked provenance. | Useful embedded exercises, but exact visuals remain necessary. |
| 14 | Triangle tracing and triangle/rectangle comparison omitted. Rectangle/square deformation questions became conclusions. Triangle rigidity teacher note was correctly retained. | Distinguish explicitly supplied teacher knowledge from unanswered investigations. |
| 15 | Polygon drawing/right-angle-count prompts retained. Square as a special rectangle is explicitly supported by the teacher note. | This relationship is not an unsupported addition. |
| 16 | Equal-sided pentagon manipulation compressed into a conclusion; unequal straws asserted unable to make a circle. | Open investigation replaced by an overgeneralized answer without radial arrangement. |
| 16–18 | Centre/radius wording and much folding/compass procedure retained. Diameter/radius completion and equality questions became conclusions. | Keep source definitions, preserve investigation blanks and visual construction steps. |
| 19 | Four wheel comparisons and cutting constraints retained; hidden overlapping-shape identification omitted. | Missing perceptual classification; wheel sizes and grids are essential assets. |
| 20 | Cuts table reduced to a generic instruction. Card sorting omitted explanatory prompt and end-of-book dependency. | Missing figure pairs and reasoning; unavailable cards must be flagged. |
| 21 | Spider path constraints and triangle/rectangle counts retained as questions. Graph topology absent. | Cannot generate a faithful path task from a generic web description. |
| 21–22 | Matchstick counts and moves retained; starting arrangements absent. Three model challenges supplied inferred solid names. | Numerical givens are useful, but answers must not be invented. |
| 22–23 | Angle-count classification, less/more-than-five drawing and angle-combination prompts mostly retained. Numbered options/grids absent. | Exact figures need human visual review; not standalone game-ready content. |

### Hierarchy and learning objectives

The four flagged short nodes were “Types of Angles”, “2D Shapes and Circles”,
“Circles”, and “Puzzles, Challenges, and Classifications”. Their children contain
real educational material; short navigation parents are not themselves proof of
lost content. However, source omissions above are real. Nets were misleadingly
nested under Prisms and Pyramids; broader sorting lived under Dice and Views of
Cubes; 2D classification was grouped under Solid Shape Model Challenges.

All 11 objectives concern chapter topics, but rigidity/circle objectives encode
investigation results and lacked page evidence. Objectives are aims, not answer
keys or proof of complete source coverage. Future objectives require page evidence.

Zero standalone example/activity nodes did not mean zero activities: net folding,
sorting, cube drawing, angle work, straw models, circle work, puzzles and challenges
were embedded. Keep coherent activity families with their concepts, or give a
substantial independent investigation its own node. Do not create one node per
question. No substantial solved numerical worked example was identified in this
chapter; filled learner tables must not be relabelled as worked examples.

## Minimal generalized changes

The current multimodal/source-authority implementation already supplies recursive
hierarchies, original PDF/page references, blank-task preservation and quarantined
inferences. It is retained. The prompt now explicitly preserves numerical givens,
units, subparts, constraints, table labels and source-provided worked steps.
Validator statistics count explicit embedded pedagogical roles independently of
node type. Quarantined inference does not satisfy activity presence. Missing task
roles produce a review warning, never an invented task or a structural failure.
Existing shallow-content warnings remain; no arbitrary required node count/depth
or grade-specific logic was added.

The local configuration uses `gemini-3.5-flash`, PDF mode, 50,000 output tokens,
300-second timeout and up to four attempts with bounded 2–30 second backoff for
network/timeouts and transient HTTP statuses 408/429/500/502/503/504. Exhausted HTTP
failures stop the batch. Model/output validation errors are not blindly retried.
Review and import gates remain unchanged.

The existing Chapter 3 source discrepancy is retained: preliminaries say
“Pattern Around Us”, chapter heading says “Patterns Around Us”; configuration uses
the latter. See local `review/source-provenance.json`; no source PDF was altered.

## Results

Generation stopped at the Chapter 1 source-fidelity gate. Local run diagnostics, source extracts and detailed per-chapter results are retained under `curriculum-local/review/grade4-batch/`.

### First regeneration review

The first candidate returned HTTP 200 / STOP on one attempt, but failed semantic
review. It restored blank tables, riddles, building reflections, border marking,
separate cube construction/counting and open circle investigations. However, it
inserted visual net/solid names, piece counts and cut-table descriptions into
SOURCE_TEXT; omitted the street project and several teacher notes; invented
parent explanations; introduced the name Euler in an objective; and did not flag
external nets/cards as unresolved. The candidate and safe diagnostics are retained
locally as `chapter-1-first-candidate.json` and `chapter-1-first-summary.json`.

The prompt was refined to require actual printed wording in SOURCE_TEXT, permit
brief source headings for navigation parents, and explicitly recheck every page
for projects, teacher notes, exercise subparts and external resources. This is a
general source-authority clarification, with no Chapter 1 content hardcoded.
No candidate was manually repaired or approved.

### Identity rejection and small reliability fix

The second generation returned HTTP 200 / STOP, but local checks rejected a changed
`grade` with `OUTPUT_IDENTITY_MISMATCH`. It took one provider attempt; the previous
artifact remained unchanged. No output-validation retry was silently performed by
the retry loop. A diagnosed new execution follows the implementation correction.

The native response schema now constrains configured identity strings with
single-value enums and chapter number with matching minimum/maximum bounds. The
prompt also carries exact typed identity JSON. Local strict equality checks remain
in place; no coercion or identity gate weakening was introduced. A deterministic
test verifies both schema constraints and rejection of a returned changed grade.
This handles arbitrary grade labels and configured book/chapter identities.

### Recovery verification and structural rejection

The six requested curriculum diffs and git status were inspected without changing
unrelated HTTP/runtime or Unity work. Identity-schema tests pass. The third request
passed identity checking but failed structural validation: HTTP 200, STOP, one
attempt, 15,625 prompt / 18,328 candidate / 45,293 total tokens. The existing CLI
did not retain detailed validation errors or this rejected candidate, so the exact
structural cause is unknown; it is not assumed to be a source-fidelity error.
The prior normal artifact was preserved. No other chapter was generated.

A task-local adapter now uses the existing runner/parser dependency seam to retain
the next candidate and local validation errors in diagnostic-only UNREVIEWED files.
It does not change provider payload, validation, retries, approval or import gates.
It never prints raw provider content or environment secrets.


## Final outcome: source-fidelity gate FAILED

**The requested 24-chapter ingestion is not complete. No Chapter 2+ or second-book
chapter was generated.** The latest Chapter 1 passes structural validation but
fails the source-fidelity audit. It remains UNREVIEWED, preserved unchanged both
in normal output and `review/grade4-batch/chapter-1-latest-candidate.json`.
The original baseline and first candidate are also preserved separately.

Latest artifact SHA-256:
`6cff21bad8d324ecb602e7d3dfefb8c4d9d4f8f28dab2d030ae90c775465d957`.

### Latest candidate: improvements and remaining failures

All five building-reflection prompts, the removal/improvement questions, street
project, sphere craft and border-marking activity now survive. All six teacher
notes are present in five material entries (the two circle notes are grouped).
Blank property tables are represented as row/column labels without supplied
answers. Riddles, straw-model challenges, circle relationship blanks, matchstick
counts and spider-path constraints remain open. Tracing, angle-colour instructions,
hidden shapes, polygon comparison, card-sorting explanation and numerical subparts
are retained. No substantive source-provided worked numerical example was found;
zero worked-example entries is appropriate here.

The five learning objectives concern source-supported topics and have relevant
page references. The earlier unsupported Euler label is gone. Recursive hierarchy
has one root, five topics and thirteen concepts, depth two edges. The short
Building Models parent contains printed source text, not an invented summary.
The broad puzzle topic would benefit from clearer subgroups, but arbitrary depth
or a separate node for every question is not required.

Blocking source-authority findings:

| PDF page / node | Remaining problem |
| --- | --- |
| 9 / Drawing and Matching 3D Shapes | SOURCE_TEXT names visual solid options, adds net/solid descriptions and states “1 pentagon and 5 triangles”. These names/counts are not printed text for that exercise. |
| 10 / Introduction to Angles | SOURCE_TEXT names the unlabeled picture options, including a “peace sign”. This is visual interpretation. |
| 20 / Puzzles and Classification of Shapes | SOURCE_TEXT invents left/right cutting-table descriptions, including “three parallel strips/rectangles” for B and a trapezoid description for C. These are unsupported and do not faithfully preserve the figures. |
| 3 / Nets of 3D Shapes | End-of-book nets are referenced but absent from the supplied PDF; not flagged VISUAL_UNRESOLVED. |
| 20 / Puzzles and Classification of Shapes | End-of-book cards are referenced but absent; not flagged VISUAL_UNRESOLVED. |

Additional concerns: page 6 circle/intersection layout is mixed into SOURCE_TEXT;
page 3 printed prism/pyramid names are relegated to visual-description metadata.
All 23 pages have references and the source hash matches, but this does not cure
misclassification. Visual descriptions outside content are correctly marked for
review; similar descriptions embedded in material text bypass that protection by
being falsely labelled SOURCE_TEXT. The validator verifies declared classification,
not whether the model's declaration is true. No correctness claim follows from
all 56 material entries declaring EXPLICIT_SOURCE_CONTENT, or from zero quarantined
inferences. There are 45 VISUAL_DEPENDENCY warnings, zero VISUAL_UNRESOLVED warnings
and one short-parent warning (46 total; zero structural errors).

Repeated prompt refinement has not reliably eliminated this failure. Further
blind regeneration is not justified. A stronger, separately designed source-text
anchoring/verification step is a possible next measure; it is **not implemented or
claimed effective here**. The quality gate remains closed. No generated content
was manually repaired to make it pass.

### Provider executions

All four executions used gemini-3.5-flash, HTTP 200 and finishReason STOP.
Each made one provider attempt; no automatic transport/HTTP retry occurred.

| Execution | Outcome | Prompt tokens | Candidate tokens | Total tokens |
| --- | --- | ---: | ---: | ---: |
| 1 | Structurally saved; source-fidelity failed | 15,357 | 16,116 | 47,377 |
| 2 | OUTPUT_IDENTITY_MISMATCH (grade); no replacement | 15,541 | 16,282 | 51,151 |
| 3 | OUTPUT_INVALID; no replacement; detailed cause not retained by CLI | 15,625 | 18,328 | 45,293 |
| 4 | Structurally saved; source-fidelity failed | 15,625 | 13,018 | 43,624 |

Latest request: 8,429,035 bytes; returned candidate text: 47,556 characters.
The task-local diagnostic adapter initially used an unrecognized dependency-hook
name, so execution 4 used the normal parser without raw-wire capture. The successful
artifact and summary were preserved afterward, byte-for-byte. The local hook name
was corrected without another provider request. No cause is fabricated for the
lost structural rejection in execution 3.

### Test and safety verification

- Final focused ingestion suite: **90 passed, 0 failed, 0 skipped**.
- Final complete backend suite: **555 passed, 0 failed, 0 skipped**.
- Four new tests cover embedded activities, inferred-task exclusion, numerical
  subpart/step preservation, and configured identity binding with local rejection.
- JavaScript syntax checks and scoped `git diff --check`: pass.
- All 24 source PDF SHA-256 values unchanged; all 388 pages extracted with zero
  extraction warnings (224 Maths, 164 Our Wondrous World).
- Configured Chapter 3 title discrepancy and unit-introduction provenance retained.
- No live database access/write/import/materialization, approval, Prisma/schema
  modification, migration/db push/reset/deploy, game generation, Unity edit,
  deployment, commit, push or staging operation was performed by this task.
- Existing unrelated HTTP runtime-adapter, package, documentation, .gitignore and
  Unity working-tree changes were preserved.

### Files changed by this curriculum task

Tracked modifications:
- `backend/src/services/curriculumIngestion/curriculumParser.js`
- `backend/src/services/curriculumIngestion/curriculumResponseSchema.js`
- `backend/src/services/curriculumIngestion/curriculumValidator.js`
- `backend/src/services/curriculumIngestion/sourceFidelity.js`
- `backend/tests/curriculumIngestion/sourceAuthority.test.js`
- `backend/tests/curriculumIngestion/structuredOutput.test.js`

New review document: `backend/docs/grade4-ingestion-quality.md`.
Six tracked code/test files: 100 insertions, 11 deletions. No historical files or
unrelated work reverted. Local-only changes: `curriculum-local/ingestion.json`,
normal Chapter 1 artifact and ingestion summary; backups, source extracts, safe
run logs, test logs, review decisions, quality summaries and task-local reporting/
diagnostic scripts under `curriculum-local/review/grade4-batch/`. No secrets were
printed or staged; textbook sources remain unchanged and unstaged.

### Configuration versus artifacts

Normal output has **1 of 24 chapter artifacts**, with **0 chapters passing the
source-fidelity gate**. Maths 1 is generated but rejected by that gate. Maths 2–14
and Our Wondrous World 1–10 are not processed; their counts and generation warnings
are unavailable, not zero. All existing/generated curriculum candidates remain
UNREVIEWED. The blocked Chapter 1 needs source-authority correction before any
batch generation. All future candidates still require human review before approval.

Latest Chapter 1: 19 nodes, 5 objectives, depth 2; 56 materials, including 25 activity,
11 exercise, 4 question, 3 investigation, 5 teacher-note, 4 definition, 2 explanation,
1 observation and 1 story-context entries. There are 43 embedded task/example-role
entries, zero standalone example/activity nodes and zero worked-example materials.
Counts group tasks rather than counting every subquestion.

| Chapter | Status | Nodes | Objectives | Depth (edges) | Pages | Embedded tasks/examples | Warnings | Visual dependency/unresolved |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Maths Mela 1: Shapes Around Us | SOURCE_FIDELITY_FAILED | 19 | 5 | 2 | 23 | 43 | 46 | 45/0 |
| Maths Mela 2: Hide and Seek | NOT_PROCESSED | — | — | — | 10 | — | — | —/— |
| Maths Mela 3: Patterns Around Us | NOT_PROCESSED | — | — | — | 5 | — | — | —/— |
| Maths Mela 4: Thousands Around Us | NOT_PROCESSED | — | — | — | 23 | — | — | —/— |
| Maths Mela 5: Sharing and Measuring | NOT_PROCESSED | — | — | — | 18 | — | — | —/— |
| Maths Mela 6: Measuring Length | NOT_PROCESSED | — | — | — | 15 | — | — | —/— |
| Maths Mela 7: The Cleanest Village | NOT_PROCESSED | — | — | — | 20 | — | — | —/— |
| Maths Mela 8: Weigh It, Pour It | NOT_PROCESSED | — | — | — | 13 | — | — | —/— |
| Maths Mela 9: Equal Groups | NOT_PROCESSED | — | — | — | 21 | — | — | —/— |
| Maths Mela 10: Elephants, Tigers, and Leopards | NOT_PROCESSED | — | — | — | 15 | — | — | —/— |
| Maths Mela 11: Fun with Symmetry | NOT_PROCESSED | — | — | — | 11 | — | — | —/— |
| Maths Mela 12: Ticking Clocks and Turning Calendar | NOT_PROCESSED | — | — | — | 9 | — | — | —/— |
| Maths Mela 13: The Transport Museum | NOT_PROCESSED | — | — | — | 19 | — | — | —/— |
| Maths Mela 14: Data Handling | NOT_PROCESSED | — | — | — | 22 | — | — | —/— |
| Our Wondrous World 1: Living Together | NOT_PROCESSED | — | — | — | 16 | — | — | —/— |
| Our Wondrous World 2: Exploring Our Neighbourhood | NOT_PROCESSED | — | — | — | 16 | — | — | —/— |
| Our Wondrous World 3: Nature Trail | NOT_PROCESSED | — | — | — | 24 | — | — | —/— |
| Our Wondrous World 4: Growing up with Nature | NOT_PROCESSED | — | — | — | 12 | — | — | —/— |
| Our Wondrous World 5: Food for Health | NOT_PROCESSED | — | — | — | 16 | — | — | —/— |
| Our Wondrous World 6: Happy and Healthy Living | NOT_PROCESSED | — | — | — | 17 | — | — | —/— |
| Our Wondrous World 7: How Things Work | NOT_PROCESSED | — | — | — | 15 | — | — | —/— |
| Our Wondrous World 8: How Things are Made | NOT_PROCESSED | — | — | — | 11 | — | — | —/— |
| Our Wondrous World 9: Different Lands, Different Lives | NOT_PROCESSED | — | — | — | 24 | — | — | —/— |
| Our Wondrous World 10: Our Sky | NOT_PROCESSED | — | — | — | 13 | — | — | —/— |

Full distributions, source statistics, page coverage, checksums, role counts and warning texts are in chapter-quality-summary.json.

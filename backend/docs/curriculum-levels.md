# Deterministic curriculum levels and notes

Chapter artifact → instructional sequence → Level Builder → Notes Builder →
Level Curriculum Package → future approved Adaptive Engine adapter → future AI Game Planner.

This is an **offline development foundation**, not an approval, importer, materializer,
mastery engine or game generator. It accepts one valid authority-v2 artifact at a time;
no complete book/batch is required. Outputs remain UNREVIEWED, DEVELOPMENT_ONLY and
`productionEligible: false`, even if an input file claims APPROVED. Existing production
approval/import and issued-context checks remain untouched.

## Entry points

- `instructionalSequence.js`: `buildInstructionalSequence(artifact, {sourceEvidence?})`.
- `levelCurriculum.js`: `buildChapterLevels(artifact, options)` and
  `levelCurriculumPackage(chapterPackage, levelId)`.
- `notesBuilder.js`: internal role-driven section and candidate projections.
- `levelProgression.js`: immutable `LEVEL_PROGRESSION` interface contract.
- `buildLevelPackages.js`: explicit local manifest runner; no environment/key loading,
  provider, database client, directory discovery or automatic curriculum regeneration.

The pure storage mapper `prepareArtifactStorage` supplies canonical artifact version
and scoped identity, validates structure/authority and verifies supplied content fingerprints.
Calling this mapper performs no persistence. Identity follows existing conventions:
board, grade label, subject, configured book/chapter IDs and edition, never title equality.

```js
const {buildChapterLevels, levelCurriculumPackage} = require('./src/services/curriculumLevels/levelCurriculum');
const chapter = buildChapterLevels(localArtifact, {sourceEvidence: verifiedLocalEvidence});
const oneLevel = levelCurriculumPackage(chapter, chapter.levels[0].levelId);
```

Omit `sourceEvidence` when it is unavailable. Page-only output remains usable for
inspection, with explicit ordering-review flags; it does not claim exact within-page order.

A manifest resolves all relative paths against its own directory:

```json
{
  "schemaVersion": 1,
  "outputDirectory": "level-packages",
  "artifacts": [
    {"artifactPath": "processed/example-book/chapter.json", "evidencePath": "evidence/chapter.json"}
  ]
}
```

`evidencePath` is optional. `policy` may override positive integer
`transitionWindowPages` (default 3) and `minimumTopicSpanPages` (default 2).
These are explainable review heuristics, not a fixed number of levels or a claim that
page length measures mastery. Unknown builder policy options fail closed.

```sh
node backend/src/services/curriculumLevels/buildLevelPackages.js --config backend/curriculum-local/levels-development/config.json
npm --prefix backend run test:levels
```

The current ignored development manifest contains only the eleven passing inputs.
Adding another artifact/evidence entry uses the same algorithm. All inputs build and
validate before output writes. Version-named JSON files are replaced atomically; input
aliases and output symlinks are rejected. Multi-file output is not a transactional store.
No source PDF or input artifact is rewritten. Local development sidecars contain textbook
text and must remain ignored; portable automated tests use synthetic text only.

## Ordering and provenance

Persisted source materials currently retain PDF page references but not their wire
source-line IDs. Never infer an exact line occurrence from the first matching phrase.
The builder supports a local extraction/anchor sidecar:

```js
{
  documents: [{sourceId: 'source-1', sha256: '<source checksum>'}],
  units: [{id: 'source-1:p2:l7', sourceId: 'source-1', page: 2, line: 7, text: '<exact extracted line>'}],
  materials: [{nodeId: '<original node ID>', materialIndex: 0, unitIds: ['source-1:p2:l7']}]
}
```

The builder checks document identity/checksum correspondence, registered pages, unique
unit identities, unique occurrence bindings, exact authoritative text reconstruction
and exact source references. Sidecars are trusted local extraction evidence, not
cryptographic proof that supplied text came from a PDF: a future untrusted upload
adapter must independently verify extraction/checksums. The development preparation
script verifies original PDF hashes and uses retained extraction and model-anchor
records, including deterministic repairs. No inference supplies missing anchors.

Sort by configured document order, original PDF page and verified line number. Without
line evidence, hierarchy order/ID and material occurrence index provide a deterministic
**tie-break only**. Node array/tree traversal is never the primary teaching sequence.
Materials remain atomic; long or noncontiguous selected passages are not silently split,
summarized or rewritten. Overlap is recorded for human ordering review. Teacher support
is separated from the learner sequence so late teacher notes cannot move earlier concepts.

Each material occurrence retains original node ID, material index, immutable artifact
version ID, hierarchy path, authority, source pages and any verified line anchors.
The chapter has one authoritative text catalog; notes, candidates and levels reference
it. Repeated source wording in distinct occurrences is preserved, not deduplicated by
text. Every occurrence has exactly one owning level. Supporting context can be referenced
from another level without transferring ownership or copying text inside the chapter.

## Explainable grouping

The algorithm processes the source-ordered learner stream, not one level per node/topic:

1. Keep material from the same node and direct parent/child continuations together.
2. A changed source document or source gap can start a new group when the node/parent
   relationship does not already establish continuation.
3. A change of hierarchy branch can start a new group after the current group has a
   meaningful source span. Short adjacent introductions can join related work.
4. Within a continuous branch, a new instructional node beyond the configurable page
   window may start a group; exercise/question continuations are kept attached.
5. Explicit review/assessment nodes and direct chapter exercise sections identify review
   boundaries. There is no subject-specific title dictionary or hardcoded conceptual map.
6. Never cut a new boundary inside a preceding material's source span. Merge a singleton
   trailing continuation in the same branch back into its previous group.

`boundaryReason` and per-material `groupingEvidence` record deterministic reason codes,
not generated reasoning. Titles reuse the first relevant source artifact node title and
are provisional navigation labels; they are not authoritative summaries of every item.
Multi-topic groups may need a better human-reviewed title.

Grouping may still be ambiguous. The builder emits review signals for overlapping material
spans, nodes spanning levels, small groups, unusually wide spans or a large single level.
Source fidelity takes precedence over forcing attractive level counts. A one-material
exercise may contain a substantial multi-part review; material count alone is not a
measure of educational size. Page overlap with a chapter objective creates only an
`objectiveCandidate`, never a verified learning-objective assignment.

## Notes, teacher guidance and candidates

Notes retain contiguous, nonempty source-backed sections: CONTEXT, EXPLANATION, KEY_IDEAS,
WORKED_EXAMPLES, OBSERVATIONS, SOURCE_TABLES and SOURCE_PROVIDED_ANSWERS where the roles
support them. Sections contain material references; resolution yields exact source text.
No summarization, sentence rewriting, generated facts, invented worked steps, filled
blanks, automatic answer keys or fabricated section occurs. Materials requiring student
completion are not converted to explanatory notes.

A coarse artifact role can contain multiple educational forms. The foundation does not
invent finer classification: e.g. an exercise containing worked steps remains available
as practice, even if it could later supply an explanatory note after presentation review.
This explains sparse notes in some otherwise rich chapters.

All `teacher_note` occurrences are preserved, attached by same node/branch and then nearest
source position. Their audience is TEACHER_PENDING_REVIEW, classification
PRESENTATION_REVIEW_REQUIRED, and `studentVisible` is false. Current metadata does not
reliably distinguish learner-useful explanation from teacher facilitation, so no teacher
instruction is automatically promoted to a student note. Teacher-only appendices do not
create learner levels. A wholly teacher-only input yields an explicit SUPPORT_ONLY group.

Interaction candidates retain activities, investigations, exercises, questions, visual
tasks, narrative/context and observations, plus other student-completion materials.
Every candidate has `mechanic: null`; no role-to-MCQ/drag-and-drop mapping exists.
Source-linked context is selected from the same node/ancestor or preceding shared branch,
with a named association rule. These links require planning review, not inferred mastery
or a claim that hierarchy alone proves pedagogical applicability.

## Visuals and one-level packages

Visual dependencies contain material/text references, source provenance, original status
and DEFERRED presentation. Model pixel descriptions are excluded. Furniture-only page
metadata is preserved separately as deferred source pages, never fake teaching material.
No visual reconstruction or image generation takes place.

A one-level package includes chapter/version/checksum/sequence identity, policy, level
sequence/title, chapter objective context, candidate objective links, source node/material
references, notes, examples/context, candidates, exercise/question/activity references,
teacher support, visual dependencies, source registry/order and review warnings. Its
catalog resolves owned materials plus explicit cross-level context references exactly
once. Non-authoritative synthesis/inference is excluded from the text catalog; original
occurrence pointers remain in the chapter's excluded-content ledger.

IDs use canonical SHA-256: material ID = artifact version + node + occurrence index;
objective ID = version + objective index; level ID = artifact version + sequence
fingerprint + policy + ordered owned material references. Sequence fingerprints include
verified source ordering/anchors. Key ordering/JSON formatting does not affect these IDs;
a changed immutable snapshot, ordering evidence, grouping policy or membership creates
new identities. Existing curriculum IDs are never changed. No database IDs are assigned.

## Progression and existing adaptive architecture

The contract describes LEARN → PRACTISE → CHECK_UNDERSTANDING, followed by ADVANCE or
REINFORCE/REMEDIATE → RETRY. It executes no transitions and contains no learner evidence.
Game completion does not mean mastery; automatic advancement is false.

Future integration must use the existing `decideAdaptiveLearning` policy with a genuinely
issued approved/imported node context, trusted normalized learner state and explicit
prerequisite evidence. Its existing WHAT/HOW decision is not a level mastery aggregator.
The current GameSpec likewise binds an approved artifact/node scope, not an arbitrary
multi-node level package. A future reviewed scope/evidence adapter is required before
these development packages can feed either system. This task does not call or weaken
those production trust boundaries, aggregate mastery, fabricate evidence or select games.

## Validation and limitations

See [all-chapter development results](curriculum-levels-validation.md), including detailed
Chapter 1, 5 and 14 analysis. All current inputs remain untouched and UNREVIEWED.
The algorithm provides an explainable draft progression, not proof of the author's exact
teaching sequence. Human boundary, objective-applicability, title, visual and presentation
review is still required. Pure page fallback cannot resolve within-page ambiguity;
noncontiguous source materials remain explicit review cases even with line evidence.

**Cross-subject validation remains pending until a World Around Us artifact, especially
Chapter 1 Living Together, is available.** Role-driven synthetic narrative tests are not
proof on that missing real textbook. The next recommended step is human review of the
local sequence/level/notes packages and documented boundary decisions, followed by a
separately authorized design for approved level-to-node scope and evidence mapping.
Do not begin AI game planning or production progression from these unreviewed outputs.

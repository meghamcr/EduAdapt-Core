# Grade 4 textual curriculum ingestion

> Historical policy/candidate log. The completed Chapter 1 source-line safeguard,
> final audit and level/game-readiness analysis are in
> [chapter-1-source-authority-readiness.md](chapter-1-source-authority-readiness.md).
> The current task stopped after Chapter 1; the remaining 23 chapters were not processed.

This report applies the updated visual policy. Previous candidate reviews in
`grade4-ingestion-quality.md` are historical. Exact visual reconstruction is not
an ingestion requirement. A visual-dependent exercise must retain its printed
instruction, subparts, givens, role and page references, with a dependency warning.
Missing diagrams/cards/nets are nonfatal. Unsupported facts remain blocking even
when they were inferred from a picture. No activity is dropped to avoid a visual.

## Implementation and configuration

The existing authority schema already separates explicit text, source synthesis,
visual interpretation and inference. The validator already treats unresolved
visuals as warnings. These boundaries and configuration-bound identity constraints
are preserved. No Prisma or persistence schema changes are needed.

The source-fidelity prompt now explicitly prioritizes substantial textual coverage,
defers visual reconstruction, prohibits describing pictured options/counts as text,
and instructs the model not to report incomplete coverage merely because visuals
are unavailable. The text-input visual warning now describes this policy precisely.

For this batch, the local configuration uses existing `sourceMode: "text"`:
all extracted page text and printed recoverable labels are supplied with original
PDF page numbers and hashes; no images are sent for interpretation. Original PDFs
are preserved locally for audit and visual-dependency provenance. This is a local
configuration choice, not a grade-, subject- or chapter-specific architecture.
It is suitable for the present sources' readable text layers; it is not a claim
that text extraction alone is sufficient for arbitrary scanned textbooks.

No visual representations or GameSpecs are generated here. Future game visuals
must remain presentation, not retroactive textbook facts. Source-specific numeric
or diagram puzzles may need adaptation before later use; deferred visuals do not
license guessed source answers.

## Tests

Six new deterministic tests in `deferredVisuals.test.js` cover detailed examples,
activities, teacher notes, numerical givens and exercise subparts; unanswered tasks
with both visual warning states; authoritative printed captions; quarantined
visual readings; rejected conflicting authority declarations; and page-aware text
input with arbitrary configured identity. Existing tests continue to cover blank
tables, recursive hierarchy, authority boundaries, provenance and resume behavior.

Tests verify representation and declared-authority enforcement. They do not prove
that a real model's SOURCE_TEXT declaration is truthful; source audit remains
required before calling a chapter textually faithful.

Pre-generation results: 96 focused tests / 561 complete backend tests passed;
zero failures and zero skips.

## Source inventory

All 24 configured source PDFs were previously extracted: 388 pages, with zero
extraction warnings. Original PDF SHA-256 values were verified unchanged.
The Maths Chapter 3 preliminaries/heading discrepancy (Pattern/Patterns) is retained
in the existing source-provenance record. Our Wondrous World unit-introduction
pages remain part of their configured source PDFs and keep original page references.

## Results

Pending Chapter 1 regeneration and textual audit. No batch chapter is approved by
this process. All generated candidates remain UNREVIEWED.

### First candidate under the updated policy

The first text-mode candidate passed structural validation with 22 nodes and
retained all six teacher notes, the street project, numerical tasks and open
questions. Both source extraction and generated materials contained 67 question
marks (a triage observation, not a completeness proof). The previous invented
solid names and cutting-table shape descriptions were absent.

It still guessed associations among unpositioned net/solid option labels and
misclassified synthesized parent explanations as SOURCE_TEXT. These are textual
fidelity/authority issues, not a requirement to reconstruct the figures. The
candidate is preserved as `review/grade4-textual/chapter-1-first-candidate.json`.

The parser's final instructions now explicitly keep organizational summaries in
`description`, require actual printed wording for parent materials, and prohibit
inventing relationships among unpositioned labels. Full textual tasks and visual
warnings must survive when those relationships are unavailable. This adds no
chapter-specific wording, page numbers or rules. The 96 focused and 561 full tests
passed again before the next regeneration.

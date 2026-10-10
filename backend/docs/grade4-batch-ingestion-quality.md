# Grade 4 batch ingestion quality — current checkpoint

**12 of 24 chapters PASS; 0 NEEDS REVIEW; 12 FAILED.** Every saved artifact remains **UNREVIEWED**. PASS is a development fidelity gate, not human approval. Passing artifacts were preserved. Provider failures do not imply architecture failures.

## Chapter-by-chapter status

| Subject / chapter | Title | Gate | Generation / latest issue | Nodes / objectives / depth | Materials | Source lines | Pages | Visual / other warnings | Calls, all passes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mathematics 1 | Shapes Around Us | PASS | PRESERVED | 27 / 5 / 2 | 86 | 459/506 | 23/23 | 42/8 | 0 |
| Mathematics 2 | Hide and Seek | PASS | SUCCESS | 15 / 4 / 2 | 24 | 201/220 | 10/10 | 17/5 | 9 |
| Mathematics 3 | Patterns Around Us | PASS | SUCCESS | 5 / 4 / 1 | 23 | 203/212 | 5/5 | 9/2 | 1 |
| Mathematics 4 | Thousands Around Us | PASS | SUCCESS | 24 / 7 / 2 | 38 | 770/815 | 23/23 | 15/3 | 3 |
| Mathematics 5 | Sharing and Measuring | PASS | Saved; deterministic repair | 17 / 6 / 2 | 54 | 564/601 | 18/18 | 27/11 | 5 |
| Mathematics 6 | Measuring Length | PASS | SUCCESS | 12 / 5 / 2 | 43 | 305/339 | 15/15 | 21/0 | 1 |
| Mathematics 7 | The Cleanest Village | PASS | Saved; deterministic repair | 8 / 6 / 1 | 23 | 604/688 | 20/20 | 21/1 | 8 |
| Mathematics 8 | Weigh It, Pour It | PASS | SUCCESS | 11 / 5 / 2 | 40 | 272/297 | 13/13 | 22/1 | 1 |
| Mathematics 9 | Equal Groups | FAILED | FAILED | N/A | N/A | —/— | —/— | —/— | 13 |
| Mathematics 10 | Elephants, Tigers, and Leopards | FAILED | HTTP 503 | N/A | N/A | —/— | —/— | —/— | 16 |
| Mathematics 11 | Fun with Symmetry | FAILED | HTTP 503 | N/A | N/A | —/— | —/— | —/— | 16 |
| Mathematics 12 | Ticking Clocks and Turning Calendar | PASS | SUCCESS | 14 / 7 / 2 | 30 | 313/329 | 9/9 | 11/2 | 9 |
| Mathematics 13 | The Transport Museum | PASS | SUCCESS | 20 / 6 / 2 | 39 | 578/660 | 19/19 | 14/4 | 11 |
| Mathematics 14 | Data Handling | PASS | Saved via local candidate replay (no provider) | 8 / 5 / 1 | 29 | 308/335 | 15/22 | 22/2 | 11 |
| The World Around Us 1 | Living Together | PASS | SUCCESS | 7 / 4 / 1 | 34 | 391/423 | 16/16 | 3/2 | 17 |
| The World Around Us 2 | Exploring Our Neighbourhood | FAILED | HTTP 503 | N/A | N/A | —/— | —/— | —/— | 20 |
| The World Around Us 3 | Nature Trail | FAILED | HTTP 503 | N/A | N/A | —/— | —/— | —/— | 16 |
| The World Around Us 4 | Growing up with Nature | FAILED | HTTP 429 (prior pass; latest skipped) | N/A | N/A | —/— | —/— | —/— | 8 |
| The World Around Us 5 | Food for Health | FAILED | HTTP 429 (prior pass; latest skipped) | N/A | N/A | —/— | —/— | —/— | 8 |
| The World Around Us 6 | Happy and Healthy Living | FAILED | HTTP 429 (prior pass; latest skipped) | N/A | N/A | —/— | —/— | —/— | 8 |
| The World Around Us 7 | How Things Work | FAILED | HTTP 429 (prior pass; latest skipped) | N/A | N/A | —/— | —/— | —/— | 8 |
| The World Around Us 8 | How Things are Made | FAILED | HTTP 429 (prior pass; latest skipped) | N/A | N/A | —/— | —/— | —/— | 8 |
| The World Around Us 9 | Different Lands, Different Lives | FAILED | HTTP 429 (prior pass; latest skipped) | N/A | N/A | —/— | —/— | —/— | 8 |
| The World Around Us 10 | Our Sky | FAILED | HTTP 429 (prior pass; latest skipped) | N/A | N/A | —/— | —/— | —/— | 8 |

## Per-chapter quality evidence

All saved artifacts have valid configured identity, recursive structure, source provenance and exact authoritative source-line reconstruction. Source pages and retained wire anchors provide instructional order; tree traversal alone is not a lesson sequence. Role counts are material counts, not counts of every subquestion. Examples, passages and teacher guidance may be embedded in another role. Visual metadata remains separate from authoritative text.

### Mathematics 1: Shapes Around Us

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":86,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"story_context":2,"activity":28,"question":16,"explanation":1,"concept":7,"teacher_note":6,"definition":4,"table":3,"investigation":3,"observation":1,"visual_dependent_task":1,"exercise":14}.
- Questions: 67/67 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: Preserved prior verified artifact and checksum; not regenerated. All 86 authoritative materials match source, all six teacher notes and all 67 question marks retained. Forty-seven omissions were page furniture and isolated deferred diagram labels. Full textual/structural and level-readiness review is in chapter-1-source-authority-readiness.md.
- Artifact SHA-256: `9ca2318cf13fe3dc48311548f8aec74922242942908b4f1a9a76def04fa2990b`.
- Execution: Preserved previously verified Chapter 1; zero batch calls.
### Mathematics 2: Hide and Seek

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":24,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"concept":3,"teacher_note":3,"activity":10,"question":3,"observation":1,"table":1,"exercise":2,"story_context":1}.
- Questions: 20/20 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: Provider restored on first request with the locally changed key. All ten pages and all 20 question marks retained; 201/220 units selected. All 19 omissions are page numbers/reprint footers. All 24 materials/page references replay exactly. Activities, viewing/mapping context, questions and three teacher-note materials retained; visual interpretation deferred.
- Artifact SHA-256: `54cb31fecc9a6aded2515f5b1817caca3138fc8ebff268258f02c9417588b82b`.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; key-refresh-pass: SUCCESS, 1 attempt(s).
### Mathematics 3: Patterns Around Us

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":23,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"explanation":3,"teacher_note":2,"question":8,"activity":4,"definition":1,"exercise":4,"observation":1}.
- Questions: 13/13 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: All five source pages represented; 203/212 lines retained. Nine omissions are five reprint footers and four printed page numbers. All 13 question marks, two teacher-note materials, pattern activities/exercises and numerical examples retained. Source text replay exact; visual relationships deferred. Configured plural Patterns title retained alongside source Pattern/Patterns discrepancy. Topic-level tree with semantic materials is usable; source provenance supplies sequence.
- Artifact SHA-256: `236f0d58656c28b55e7f16374b55724976e0937bdad275a4de3672da81a033d9`.
- Execution: first-pass: SUCCESS, 1 attempt(s).
### Mathematics 4: Thousands Around Us

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":38,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"concept":4,"teacher_note":5,"story_context":2,"table":3,"activity":9,"question":5,"exercise":8,"explanation":2}.
- Questions: 17/17 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: All 23 pages represented; 770/815 source lines retained. All 45 omissions are 23 reprint footers and 22 sequential printed page numbers. Exact reconstruction preserves numerical representations, tables, stories, examples, open tasks and all teacher guidance (five teacher-note materials). All 17 question marks retained. Hierarchy groups thousands/place-value/counting/number patterns with activities and exercises; page provenance supplies teaching sequence. Visual dependencies remain nonfatal.
- Artifact SHA-256: `24693057c6f482790592655909c9b2ca450561abc534c80b40b0b39f5a5c8f92`.
- Execution: first-pass: SUCCESS, 3 attempt(s).
### Mathematics 5: Sharing and Measuring

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":54,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"explanation":8,"story_context":6,"question":4,"definition":2,"teacher_note":2,"activity":11,"exercise":18,"investigation":1,"worked_example":1,"table":1}.
- Questions: 31/31 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: Known equation-fragment omission repaired deterministically by adding registered source-1:p15:l20 between already-selected l19/l21 in the same material. Original candidate preserved; all 54 authoritative materials and refs replay exactly; IDs/hierarchy unchanged; valid and UNREVIEWED. 564/601 lines retained, remaining omissions only chapter/page/reprint furniture. Fraction layout remains a deferred visual dependency; no answer or rewritten equation fabricated.
- Artifact SHA-256: `9176b664e6b7cabd9280263779d0b7a560036c56f86bdd259e6bac2481565607`.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; retry-pass: SUCCESS, 1 attempt(s).
### Mathematics 6: Measuring Length

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":43,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"story_context":3,"teacher_note":6,"question":6,"explanation":1,"activity":6,"concept":3,"observation":1,"exercise":16,"definition":1}.
- Questions: 21/21 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: All 15 pages represented, 305/339 lines retained. Omissions are page/reprint furniture and chapter/Let Us Do/Metre and Centimetres headings; corresponding identity, topic and all instructional bodies remain represented. All 21 question marks, six teacher notes, measurement explanations/definition, contexts, numerical givens and 16 exercise materials preserved. Exact source replay; visual scale/measurement examples remain dependencies rather than guessed answers.
- Artifact SHA-256: `2001e8d28d4f0914c0134b962e3f02b417aa342dc23cf77c1151946ceeeba59e`.
- Execution: first-pass: SUCCESS, 1 attempt(s).
### Mathematics 7: The Cleanest Village

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":23,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"story_context":2,"question":4,"activity":3,"worked_example":6,"exercise":8}.
- Questions: 31/31 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: Known context omission repaired deterministically by adding registered source-1:p12:l12 between already-selected l11/l13 in the same worked-example material. Original candidate preserved; all 23 authoritative materials and refs replay exactly; IDs/hierarchy unchanged; valid and UNREVIEWED. 604/688 lines retained; remaining omissions are furniture, headings, Specimen watermarks and detached arithmetic-layout symbols. All task prose, numerical contexts and 31 question marks retained; arithmetic diagrams remain deferred.
- Artifact SHA-256: `9e052e601ead267ae7dcc8a6dedd5e9b4a983044889e508879f13016912c5268`.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; retry-pass: SUCCESS, 4 attempt(s).
### Mathematics 8: Weigh It, Pour It

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":40,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"story_context":4,"explanation":2,"question":3,"activity":13,"definition":2,"concept":3,"investigation":5,"exercise":7,"teacher_note":1}.
- Questions: 45/44 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: All 13 pages represented; 272/297 lines selected. Twenty-five omissions are 13 reprint footers and 12 sequential printed page numbers. All meaningful text retained with exact reconstruction, including contexts, gram/kilogram and capacity explanations, numerical givens, five investigation materials, 13 activities, seven exercises and teacher guidance. Question marks 45 versus 44 source reflect repeated source selection, not invented text. Source provenance preserves sequence; visual readings remain deferred.
- Artifact SHA-256: `9d5727402c2c1c5c34b1bb10c7b823e509c9062f43dc79894bf68ed0408e77df`.
- Execution: first-pass: SUCCESS, 1 attempt(s).
### Mathematics 9: Equal Groups

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; key-math-pass: FAILED, 1 attempt(s) / OUTPUT_TRUNCATED; completion-math: FAILED, 4 attempt(s) / API_TIMEOUT.
### Mathematics 10: Elephants, Tigers, and Leopards

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; key-math-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; completion-smoke: FAILED, 4 attempt(s) / API_HTTP HTTP 503.
### Mathematics 11: Fun with Symmetry

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; key-math-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; completion-math: FAILED, 4 attempt(s) / API_HTTP HTTP 503.
### Mathematics 12: Ticking Clocks and Turning Calendar

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":30,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"story_context":2,"concept":5,"definition":1,"activity":4,"question":6,"exercise":6,"teacher_note":4,"investigation":1,"explanation":1}.
- Questions: 18/18 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: All nine pages represented; 313/329 units selected. Sixteen omissions are page/reprint furniture only. Exact source replay, all 18 question marks, four teacher-note materials, clock/calendar context, time examples, activities and investigation retained. Visual clock arrangements deferred; source pages support instructional sequence.
- Artifact SHA-256: `f74c947ba845f6136724d8442df43385b484c92be5b754c1a8e74064395e7845`.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; key-math-pass: SUCCESS, 1 attempt(s).
### Mathematics 13: The Transport Museum

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":39,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"story_context":3,"activity":5,"explanation":6,"question":3,"teacher_note":3,"worked_example":6,"exercise":10,"investigation":2,"definition":1}.
- Questions: 34/34 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: All 19 pages represented; 578/660 units selected. Omissions are page/reprint furniture, two repeated Times-10 headings and diagram-only repeated hundred-block labels on pages 10–11 (including block denomination labels). Inspected surrounding material retains multiplication expressions, givens, six worked examples, teacher explanations and all 34 question marks. Diagram block arrangements remain VISUAL_DEPENDENCY; no numerical task prose omitted or answers invented.
- Artifact SHA-256: `f87496ddc0c9ce21002a33ac5665f2e17894c5b2b0e32bc10305f8d9b12a5ceb`.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; key-math-pass: SUCCESS, 3 attempt(s).
### Mathematics 14: Data Handling

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":29,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"explanation":3,"story_context":3,"question":7,"teacher_note":9,"observation":2,"table":3,"activity":2}.
- Questions: 31/31 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: Existing candidate salvaged locally; zero provider calls. All 308 selected lines replay exactly in 29 materials; all 31 question marks retained. All 27 omissions are page numbers/reprint footers. Seven furniture-only extracted pages defer visuals with explicit warnings, without invented material. Data collection dialogue, question wording, all blank tables, pictograph questions, activities and appendix teacher guidance retained. Five objectives supported by these sections; appendix objective is not a new data-handling task. Instructional order is available from original page provenance. UNREVIEWED; no human approval.
- Artifact SHA-256: `ddb94e1013b293d009ecc8794c9a5077d68e88f2b3f782a3568517bb50aeb8be`.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; key-math-pass: FAILED, 3 attempt(s) / OUTPUT_INVALID; local14-salvage: SUCCESS, 0 attempt(s).
### The World Around Us 1: Living Together

- Gate: PASS. Artifact reviewStatus: UNREVIEWED.
- Structural errors: 0. Authority distribution: {"EXPLICIT_SOURCE_CONTENT":34,"SOURCE_GROUNDED_SYNTHESIS":0,"MODEL_VISUAL_INTERPRETATION":0,"MODEL_INFERENCE":0}.
- Educational roles: {"concept":6,"explanation":2,"teacher_note":2,"story_context":7,"visual_dependent_task":2,"table":3,"question":7,"activity":5}.
- Questions: 31/31 question marks retained/source (triage, not a completeness proof).
- Fidelity, examples, activities, context, teacher guidance and progression: Existing October 2 smoke artifact verified locally without regeneration. All 34 explicit materials reconstruct exactly; 391/423 lines selected, all 16 pages and 31 question marks retained. Omissions are running headers/reprint footers and three standalone activity-number labels; all task bodies, questions, table givens, seven narrative materials and two teacher notes preserved. Open riddles/tables are not answered. Unit context is identified separately. Unchanged Level/Notes builder produced four levels, 34/34 materials, zero duplicate ownership/loss/start inversions; two overlap warnings remain for review. UNREVIEWED.
- Artifact SHA-256: `3a871552dbc2b218f1cfd6eb2cb4e3a883b8def799b1db139960f84a01d237fb`.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; key-world-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 503; completion-world: FAILED, 4 attempt(s) / API_HTTP HTTP 503; oct2-smoke: SUCCESS, 1 attempt(s).
### The World Around Us 2: Exploring Our Neighbourhood

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; key-world-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; completion-world: FAILED, 4 attempt(s) / API_HTTP HTTP 503; oct8-world-2: FAILED, 4 attempt(s) / API_HTTP HTTP 503.
### The World Around Us 3: Nature Trail

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; completion-world: FAILED, 4 attempt(s) / API_HTTP HTTP 429; oct8-world-3: FAILED, 4 attempt(s) / API_HTTP HTTP 503.
### The World Around Us 4: Growing up with Nature

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429.
### The World Around Us 5: Food for Health

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429.
### The World Around Us 6: Happy and Healthy Living

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429.
### The World Around Us 7: How Things Work

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429.
### The World Around Us 8: How Things are Made

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429.
### The World Around Us 9: Different Lands, Different Lives

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429.
### The World Around Us 10: Our Sky

- Gate: FAILED. Artifact reviewStatus: N/A — no saved artifact.
- Textual fidelity, educational coverage, authority counts and artifact readiness cannot be evaluated without a saved artifact. Failure does not mean the source lacks those educational forms.
- Execution: first-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429; retry-pass: FAILED, 4 attempt(s) / API_HTTP HTTP 429.

## Aggregate counts

```json
{
  "totals": {
    "configured": 24,
    "available": 12,
    "passed": 12,
    "needsReview": 0,
    "failed": 12,
    "materials": 463,
    "activities": 100,
    "exercisesQuestions": 165,
    "investigations": 12,
    "context": 35,
    "workedExamples": 13,
    "teacherNotes": 43,
    "visualWarnings": 224,
    "otherWarnings": 41
  },
  "execution": {
    "currentContinuation": {
      "calls": 8,
      "statuses": {
        "503": 8
      }
    },
    "cumulative": {
      "calls": 213,
      "statuses": {
        "200": 12,
        "429": 122,
        "503": 72,
        "network/timeout": 7
      }
    },
    "previousKeyPasses": {
      "calls": 25,
      "statuses": {
        "200": 5,
        "429": 4,
        "503": 16
      }
    },
    "cumulativeBoundedRetries": 153,
    "quotaStopped": false,
    "notAttemptedThisContinuation": [
      "ncert-grade-4-mathematics-maths-mela-chapter-9",
      "ncert-grade-4-mathematics-maths-mela-chapter-10",
      "ncert-grade-4-mathematics-maths-mela-chapter-11",
      "ncert-grade-4-the-world-around-us-our-wondrous-world-chapter-4",
      "ncert-grade-4-the-world-around-us-our-wondrous-world-chapter-5",
      "ncert-grade-4-the-world-around-us-our-wondrous-world-chapter-6",
      "ncert-grade-4-the-world-around-us-our-wondrous-world-chapter-7",
      "ncert-grade-4-the-world-around-us-our-wondrous-world-chapter-8",
      "ncert-grade-4-the-world-around-us-our-wondrous-world-chapter-9",
      "ncert-grade-4-the-world-around-us-our-wondrous-world-chapter-10"
    ]
  }
}
```

Counts cover all currently saved artifacts. Historical Chapter 1 provider calls are excluded. Automatic bounded retries and new authorized passes are distinguished; no passing artifact was regenerated.

## October 8 continuation

Inventory reconciled the preserved October 2 World Chapter 1 success before any provider execution. No successful artifact was regenerated. World Chapters 2 and 3 each exhausted the existing four-attempt policy with HTTP 503, no candidate and no artifact. Eight calls were made; no additional chapters or planner/GameSpec requests were submitted after those repeated availability failures. Ten other missing chapters remain unattempted in this continuation, as listed above.

All 12 saved artifact checksums and all 26 source PDF checksums are unchanged. The source-line replay verifies 463 authoritative materials, structural validation, content fingerprints and UNREVIEWED status. Existing Maths 5/7 deterministic repairs and Maths 14 local salvage remain preserved. Prior detailed checkpoint text is retained locally at `curriculum-local/review/grade4-authority-batch/quality-before-oct8.md`.

The complete backend suite passes 634 tests; Unity passes 12 PlayMode tests including two synthetic cross-subject HTTP loops. Those tests perform only in-memory fixture approval/persistence, never real curriculum approval or database access. See [implementation checkpoint](implementation-checkpoint.md) for the new planner/runtime work and remaining completion blockers.

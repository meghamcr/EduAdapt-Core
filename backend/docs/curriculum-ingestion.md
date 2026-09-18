# Phase 1: reviewable curriculum ingestion

This pipeline reads local PDFs and produces local, **UNREVIEWED** curriculum JSON.
It does not load Prisma, import curriculum, contact Supabase, or approve content.
Real generation sends extracted source text to Gemini; “offline” here means
offline from the application database, not an offline language model. Tests and
`--validate-only` do not contact Gemini.

## Setup

Use Node 22.16+ in the 22.x line, or Node 24+, and the checked-in lockfile. Verified
with Node 22.23.2 and `pdf-parse` 2.4.5. From the backend directory:

```sh
npm ci --ignore-scripts
npm test
npm run ingest:curriculum -- --help
```

Lifecycle scripts are not needed for this ingestion path. Do not run Prisma
generation, seeds, migrations or the existing database importer for Phase 1.

For real generation, set `GEMINI_API_KEY` in the process environment or the local
backend `.env`. Set `model` in configuration, or omit it and set `GEMINI_MODEL`.
Configuration takes precedence. There is deliberately no hard-coded model
default. Check availability and output limits for the selected model in your
Google project. Credentials never belong in configuration or processed files.
The CLI loads backend `.env` without overwriting existing process variables.
Library callers manage their own environment.

## Configuration

`../config/curriculum/ingestion.example.json` is illustrative, using an original
two-page synthetic test fixture. It is **not a real textbook or approved source**.
The model field is a placeholder. Replace the metadata, sources and model before
real ingestion. Place local source PDFs and private configurations under the
ignored `backend/curriculum-local/` directory when convenient; paths are configurable.

All relative paths resolve against the **configuration file's directory**, never
the shell's working directory. `outputFile` resolves inside `outputDirectory`.
Unknown fields are rejected, including credentials in configuration.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Must be `1` |
| `outputDirectory` | Required local destination; absolute or configuration-relative |
| `model` | Explicit Gemini identifier, or fall back to `GEMINI_MODEL` |
| `timeoutMs` | Per-request timeout; default 90,000, maximum 600,000 |
| `maxOutputTokens` | Requested output budget; default 16,384; provider limits still apply |
| `retry` | `maxAttempts` (1–10, default 4), `baseDelayMs` (default 1,000), `maxDelayMs` (default 30,000, maximum 300,000) |
| `extraction` | `minCharacters` (default 500), `allowLowText` (default false) |
| `chapterDelayMs` | Delay between selected chapters; default 0 |
| `books` | Non-empty array; arbitrary number of books |

Each book supplies `board`, `grade`, `subject`, `bookId`, `book`, optional
`edition`, and `chapters`. Grade can be any non-empty label or safe integer;
there is no grade-range or subject whitelist. `bookId` must be unique within the
configuration, consistent with the existing database's globally identified books.

Each chapter supplies a globally unique `chapterId` and a positive integer
`chapterNumber`, unique within that book. Numbers need not be consecutive; no
count is inferred. Optional `chapterTitle` is an exact expected source title.

Specify either:

```json
{ "pdfPath": "../../curriculum-local/arbitrary-name.pdf", "pages": [2, 3, 4] }
```

or an ordered list of source mappings:

```json
{
  "sources": [
    { "pdfPath": "../../curriculum-local/part-a.pdf", "pages": [4, 5] },
    { "pdfPath": "../../curriculum-local/part-b.pdf", "pages": [1] }
  ]
}
```

Omit `pages` to extract all pages. Page numbers are 1-based PDF page positions,
not printed textbook page numbers. A mapping's pages must be unique and strictly
increasing. Sources are combined in configuration order. Confirm that mappings
cover exactly the intended chapter; the runner does not infer chapter boundaries.

An optional `outputFile` names a JSON file under `outputDirectory`. Otherwise a
deterministic identity hash supplies the filename. Duplicate destinations,
`ingestion-summary.json`, traversal outside the output directory, output symlink
escapes, and overwriting the configuration/source are rejected. Use one runner
per output directory; parallel processes targeting the same files are not supported.

## Commands

From `backend`, validate the supplied example without an API call or output writes:

```sh
npm run ingest:curriculum -- --config config/curriculum/ingestion.example.json --validate-only
```

After preparing a real local configuration and key:

```sh
npm run ingest:curriculum -- --config curriculum-local/ingestion.json --resume
npm run ingest:curriculum -- --config curriculum-local/ingestion.json --chapter YOUR_CHAPTER_ID
npm run ingest:curriculum -- --config curriculum-local/ingestion.json --chapter YOUR_CHAPTER_ID --force
```

Repeat `--chapter` for several chapter IDs. Resume is enabled by default;
`--no-resume` or `--force` requests regeneration. These flags only replace local
processed output after successful validation. There is no `--import` option.
`--validate-only` checks configuration and source paths/files, not PDF extraction
or existing processed content. Unknown flags and chapter IDs fail before generation.

Exit code is zero if every selected chapter succeeds or is reused; one if any
chapter fails, or configuration/output handling fails. Chapter failures do not
prevent later chapters from running. Configuration and unsafe output destinations
are global errors and do not create a run summary.

## Resume and identity

Resume requires structurally valid content and matching:

- Board, grade, subject, book ID/title/edition, chapter ID/number.
- Ordered SHA-256 fingerprints of the actual source bytes and page mappings.
- Normalized chapter configuration and generation/extraction settings.
- Implementation fingerprints of the ingestion modules, lockfile and Node version.
- Artifact version, node-ID strategy, and content checksum.

The exact bytes fingerprinted are passed to the extractor. Missing, unreadable,
invalid, edited, legacy, or stale artifacts are regenerated. A corrupt or missing
source is a failure, even when a previous output exists. Changing source paths,
output paths, model, source mapping or implementation conservatively invalidates
reuse. Retry delays and chapter selection do not change educational content.
Manual edits to content invalidate its checksum; preserve review notes separately.

New node IDs use `chapter-path-sha256-v1`: a scope hash includes board, grade,
subject, book identity/edition and chapter identity. Descendant hashes include
the parent identity and each node's title, type and sibling order. Reordering the
flat JSON array or renaming model temporary IDs does not change these IDs.
Content-only correction does not change IDs. Renaming/reparenting/reordering a
node can change its ID and descendant IDs. Ambiguous siblings are rejected.
These are deterministic artifact IDs, **not a claim of permanent semantic IDs**.
Existing database IDs are never inspected or changed by this pipeline.

## Output, provenance and review

The processed JSON retains the existing curriculum fields and recursive `nodes`,
and adds `edition` and `_ingestion`. Metadata includes fingerprints, selected
source pages, extraction statistics, model, timestamp, warnings, validation stats
and `reviewStatus: "UNREVIEWED"`. The metadata is a local audit aid, not a signed
provenance record or database publication approval.

The final `ingestion-summary.json` records selected identities, SUCCESS/SKIPPED/
FAILED status, attempts, output paths, node counts, available source statistics,
warnings, and structured error codes. It is replaced on each run; archive a copy
if you need run history. Old successful chapter output remains intact after a
failed regeneration, while the latest summary clearly records the failure.

Writes use a same-directory exclusive temporary file, flush, close and rename.
Normal failures clean up temporary files. A hard process kill can leave a `.tmp`
file, which is ignored on resume. Atomicity is per file, not across a whole batch;
successfully saved chapters can be resumed after interruption. Power-loss durability
depends on the filesystem. Concurrent output writers are not coordinated.

Structural errors (invalid fields, ordering, roots, IDs, parents, cycles or
unreachable nodes) stop output. Quality concerns (short/shallow content, repeated
titles/content, unusual depth, absent descriptions/objectives or examples) remain
warnings. No minimum topic count or hierarchy depth is imposed.

Before publishing any chapter, manually compare its output with its source:

1. Confirm identity, edition, page mapping and exact chapter title.
2. Check meaningful hierarchy boundaries and sibling order.
3. Check definitions, explanations, reasoning, calculations, worked examples,
   activities, observations and tables against the PDF.
4. Check that content was neither silently omitted nor supplemented from outside
   the source; inspect diagrams and extraction quality directly.
5. Check objectives reflect the chapter and warnings have been resolved or explained.

Never treat a successful run or model completeness flag as educational approval.
Do not run the existing importer as part of Phase 1; its runtime/reference-safety
issues remain deferred to Phase 2.

## Failures and limitations

The Gemini transport follows the [GenerateContent API](https://ai.google.dev/api/generate-content).
It requires a normal `STOP` finish reason, valid JSON, unchanged identity,
`source_coverage_complete: true`, and a structurally valid hierarchy. `MAX_TOKENS`,
blocked responses, missing completion signals and malformed JSON are rejected.
The model's self-reported completeness cannot prove that every source detail was
preserved. No raw provider response or credential is attached to API errors.

Network failures and timeouts retry when `retryNetwork` is enabled. HTTP errors
stop by default; explicitly allowlisted transient statuses use bounded exponential
backoff, respecting `Retry-After` up to the configured delay cap. Authentication,
invalid model/configuration, truncation, malformed output and structural validation
failures are not retried automatically. A failure never substitutes invented content.

PDF extraction uses the [pdf-parse API](https://github.com/mehmet-kozan/pdf-parse).
It conservatively normalizes line endings, null/non-breaking-space characters,
trailing whitespace and excessive blank lines. It retains internal spacing and
line structure, but PDF reading order, equations, diagrams and complex tables still
require human inspection. OCR is not implemented. In PDF mode, original visual
pages remain available even without readable text, and extraction warnings persist.
In text mode, empty extraction fails and low-text/empty-page warnings block
generation unless `allowLowText` is explicitly set after source inspection.

Large chapters currently use a single model request. There is no silent source
truncation and no automatic chunking/merge algorithm. Choose a suitable model and
budget or explicitly prepare source mappings; never split a chapter blindly to
hide incomplete coverage. AI output can vary across forced regenerations.

## Tests

`npm test` and `npm run test:curriculum` run the same deterministic Node test suite.
The suite extracts the synthetic PDF with the installed parser and uses stubbed
Gemini responses, temporary filesystem workspaces and no database credentials.
It covers malformed data, hierarchy checks, ID stability/collisions, source/model
changes, resume/force, multi-book/page mappings, quality gates, bounded retries,
timeout/truncation handling, failure preservation, path safety and database-module
isolation. A real provider call and real textbook quality review are separate
acceptance steps before curriculum publication.

## Phase 1B: source visuals and pedagogical fidelity

`sourceMode` defaults to `pdf`. Gemini receives original PDF bytes plus a compact JSON
page map through `generateContent` multipart `inlineData` with MIME
`application/pdf`. Entire documents are unchanged; page selections are copied
with pdf-lib, with an explicit attachment-page → original-PDF-page map. No OCR
or external Files API upload is used. The configured model must support PDF
input; there is no model fallback. The complete request is capped conservatively
at 18 MiB, and each attachment at 1,000 pages. Larger sources fail before a call;
select a smaller range instead. This is an intentional current limitation.

The same source bytes supply extraction, fingerprints and visual attachments.
`source_context.documents` stores source IDs, SHA-256 and original selected page
numbers. Resolve IDs to original paths using the corresponding ordered
`_ingestion.sources` entries. Every structured material and learning objective
cites that registry. Missing/out-of-range references and uncovered pages fail
validation. Page coverage does not prove that every activity on a page survived.

Each node's `materials` records pedagogical role, explicit-source authority,
text (including blank tables/questions), source references, student-completion
status and visual status. The parser derives `content` exclusively from these
explicit materials. Model-labelled deductions are moved into `review_inferences`
and excluded from authoritative `content`. This separation is structural, not a
semantic oracle: a model can still mislabel an inference or misread a diagram.
Human source review remains required. Titles/descriptions are navigation, not
additional authoritative explanation.

`VISUAL_DEPENDENCY` preserves a reference to a necessary source figure;
`VISUAL_UNRESOLVED` records ambiguity or unavailable external material. Both
produce review warnings; neither means a verified image interpretation. PDFs
remain the visual authority: this release does not embed cropped images into
individual nodes. Visual-only/low-text pages remain available in PDF mode with
warnings. `sourceMode: "text"` uses page text without visuals and always warns
that visual fidelity is unestablished; its existing low-text gate still applies.
Legacy artifacts without this contract remain readable, but implementation and
configuration fingerprints prevent silently resuming them as new artifacts.

Retry policy is explicit: `retryNetwork` defaults to true; `retryHttpStatuses`
defaults to `[]` (no HTTP retries). Only 408/429/500/502/503/504 can be opted in.
Authentication, model/configuration, malformed and truncated output errors cannot
be retried. `stopOnHttpError` defaults true and stops remaining batch targets
after HTTP attempts are exhausted. Set it false only to explicitly continue
other targets. Retry events and final summaries retain numerical HTTP status,
never raw provider bodies, request headers, or credentials. Summaries include
selected/notAttempted counts when a run stops early.

For diagnostic comparisons, choose a NEW outputDirectory in a separate local
configuration. `--force` still replaces that configuration's destination, so do
not use it on a baseline you need to preserve. All outputs remain UNREVIEWED.

Provider references (checked for Phase 1B):
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash
- https://ai.google.dev/api/generate-content#Part
- https://ai.google.dev/gemini-api/docs/document-processing

## Native structured output and safe response diagnostics

The existing `v1beta/models/{model}:generateContent` request sends both
`generationConfig.responseMimeType: "application/json"` and
`generationConfig.responseJsonSchema`. The compact schema constrains the wire
format: identity, objectives/evidence, flat parent-linked nodes and structured
materials. It uses supported object/array/scalar types, required properties,
enums, minimum values and additionalProperties. There are no recursive schema
references or fixed hierarchy depth; graph, identity, coverage and source-fidelity
checks remain the responsibility of deterministic local validation.

In page-aware mode, the model returns materials without a duplicate `content`
field; the parser derives authoritative content locally as before. Original PDF
visuals are retained in requests; complete extracted page text remains available
locally. Output-token settings are unchanged.
Native structured output improves formatting reliability; it cannot establish
semantic fidelity or guarantee completion within the output budget.

Provider metadata is attached to errors as `diagnostics` and to each runner result
as `provider` when available. Only safe fields are kept: HTTP status, allowlisted
finish reason/MIME type, candidate/text presence, text length, numerical token
counts, requested output limit, request byte count, schema-request flag, parsing
stage and a fixed JSON-failure category. Unknown labels become UNKNOWN. Raw
provider error messages, response bodies, SyntaxError excerpts, headers and keys
are never saved by this diagnostic path. Failure summaries retain this metadata;
no diagnostic response text file is written.

`MAX_TOKENS` yields `OUTPUT_TRUNCATED` before JSON parsing, even if the returned
text happens to be valid JSON. Other non-STOP/missing finish reasons and prompt
blocks yield `OUTPUT_INCOMPLETE`. A STOP response that fails JSON parsing yields
`OUTPUT_JSON_INVALID`; an unexpected end/unterminated string is identified as a
syntax symptom, not claimed as proven provider truncation. Valid JSON proceeds
to unchanged curriculum/identity/fidelity validation. No failed output becomes
an artifact. A complete outer Markdown fence can be removed, but prose wrappers,
unmatched fences and malformed content are rejected, never repaired.

A previously discarded response cannot be reconstructed from an error code.
These diagnostics improve future evidence; they do not retroactively establish
whether an earlier syntax failure was caused by a token limit or another issue.

Official references:
- https://ai.google.dev/api/generate-content#GenerationConfig
- https://ai.google.dev/gemini-api/docs/structured-output


## Local payload accounting and compact PDF provenance

In PDF mode, each PDF is immediately preceded by exactly one metadata part:
`{"sourceId":"source-1","originalPdfPages":[2,5,6]}`. Attachment page 1 is original
PDF page 2, attachment page 2 is original page 5, and so on. Numbers are original
1-based PDF positions, not printed page labels. This works for complete PDFs,
selected ranges and multiple documents. No model-side checksum is necessary:
source hashes and full page registries remain in local/artifact provenance.

The model reads both the text layer and visuals of the original PDF. Full
extracted page text is no longer repeated in the PDF-mode prompt. Local extraction
still supplies quality statistics, source validation and the page registry; its
text is available for local review/search, without being automatically persisted
or duplicated in the request. Text-only mode still sends all page-labelled text.
No PDF compression, rasterization, OCR, downsampling or visual removal occurs.

`measureRequestPayload(request)` in `requestPayload.js` is a pure local helper.
It returns only numerical, disjoint UTF-8 serialized-byte counts for base64 PDF,
prompt text, attachment metadata, response schema and remaining envelope. It has
no transport, credential or logging capability. Raw PDF size is a separate input
measurement, not an additional request component. Standard base64 expands N PDF
bytes to `4 * ceil(N / 3)` bytes; inline JSON must carry that encoding.

The audit established that PDF base64 dominated the real diagnostic request.
Removing duplicate extracted words and redundant page metadata saves only a small
fraction of total bytes. This is a generic simplification, not evidence that
payload size caused any provider HTTP 503. Model interpretation with the compact
mapping still requires the next explicitly authorized real acceptance review.

## Provider diagnostic isolation harness (dry run by default)

Run `node src/services/curriculumIngestion/providerDiagnosticHarness.js --probe basic`
from the backend directory to prepare and measure a request WITHOUT sending it.
The model comes from the same local GEMINI_MODEL configuration. The tool prints
only a summary; no request/response body, headers or credential is printed or
saved. It never writes a curriculum artifact. Use `--execute` only after explicit
user authorization for that named probe: exactly one transport attempt, no retry
and no fallback. A dry run does not need an API key. There is no execute-all mode.

Named probes:
- `basic`: tiny text prompt, no explicit MIME/schema/PDF.
- `json`: identical prompt plus application/json MIME only.
- `structured`: same prompt and MIME plus a tiny status schema.
- `pdf`: tiny synthetic one-page PDF (words and a red square), JSON MIME only.
- `pdf-structured`: identical PDF/prompt plus a tiny shape/colour schema.
- `size-100kb`, `size-500kb`, `size-1mb`, `size-2mb`, `size-4mb`, `size-6mb`:
  same PDF task/MIME as `pdf`, with respectively 100,000 to 6,000,000 inert
  uncompressed bytes in an unreferenced PDF stream. Actual raw PDFs include PDF
  overhead; the summary measures actual serialized/base64 bytes. This tests
  transfer/request size, NOT growing page count, visual density or token context.
- `curriculum`: synthetic explanation/question/activity/blank table/unavailable
  visual reference and objective, using the CURRENT production curriculum prompt,
  schema and deterministic validator. No real textbook or PDF is involved.

Both production and harness call the same pure `buildGeminiRequest` serializer
and `callGemini` transport. The curriculum prepare-only path builds the actual
production prompt without calling transport. Native schema and curriculum
semantics are unchanged. Synthetic tests execute injected stubs only.

Provider failures retain safe numeric/allowlisted diagnostics. Diagnostic-only
HTTP handling may inspect structured ErrorInfo reasons in memory, preserving only
QUOTA_EXCEEDED, DAILY_LIMIT_EXCEEDED or RATE_LIMIT_EXCEEDED; all other reason
values become UNKNOWN. Free-form provider prose is discarded. 401/403 are auth,
404 means the configured model endpoint was unavailable (not proof the model is
universally nonexistent), and 400/413/422 are rejected requests. A bare 429 stays
PROVIDER_HTTP because rate limiting and quota cannot be distinguished reliably
without evidence. A 503 stays PROVIDER_HTTP, never assumed to be quota exhaustion.
JSON syntax, incomplete/truncated generation, tiny-probe schema errors and
curriculum-validation errors retain separate categories. `attempts` is zero in
dry run/preflight failure and one after an explicit execution starts transport.

Start future isolation with ONLY `basic`. Successful local preparation establishes
no provider availability, schema acceptance, PDF support or size threshold.

### Source authority (new page-aware artifacts)

New artifacts record `source_context.authorityVersion: 2`. Source page IDs,
checksums, objective evidence and deterministic hierarchy IDs are unchanged.

- `EXPLICIT_SOURCE_CONTENT` / `SOURCE_TEXT`: printed source wording and labels;
  stored in `materials` and used to derive node `content`.
- `SOURCE_GROUNDED_SYNTHESIS` / `SOURCE_SUMMARY`: evidence-backed model summaries;
  stored separately in `source_synthesis`, excluded from authoritative `content`.
- `MODEL_VISUAL_INTERPRETATION` / `VISUAL_READING`: descriptions of pixels,
  geometry, colours or visual options; stored in `review_inferences` with
  `review_required: true`.
- `MODEL_INFERENCE` / `DEDUCTION`: nonvisual deductions; also quarantined in
  `review_inferences` with `review_required: true`.

A source page is an authoritative asset. Its model-generated description is
not: `visual.description` is always labelled `MODEL_VISUAL_INTERPRETATION` and
review-required, including when attached to explicit printed instructions.
It is never rendered into node `content`. A visual-dependent activity may
retain only printed wording, source references, role, completion state and
visual dependency flag, with an empty description. Do not expose quarantined
interpretations as learner hints, answers or authoritative teaching content.

Validation rejects inconsistent evidence/authority, misplaced interpretations,
missing provenance, content contamination and synthesis replacing learner work
or source-provided answers. This is contract enforcement, not a semantic oracle:
a model falsely labelling both its evidence kind and its authority can still
require human source review. No generated artifact is automatically approved.
Historical artifacts without authorityVersion remain readable as legacy data;
they are not upgraded, repaired or certified by this change.

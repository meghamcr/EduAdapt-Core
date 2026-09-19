# Phase 3D: grounded game generation

Status: local implementation; no routes, database client, persistence, runtime,
telemetry ingestion, or external generation is invoked by this layer's tests.

```text
Phase 3B approved GenerationContext + Phase 3C AdaptiveDecision
  → buildGenerationRequest (detached, frozen, bounded)
  → provider.generateStructuredGame(request)
  → validateGame (structure + exact source + adaptation + gameplay)
  → at most maxRepairs corrective provider calls, each fully revalidated
  → immutable VALIDATED package or structured failure (no candidate returned)
```

## Public APIs and trust

All modules are under `src/services/gameGeneration/`:

- `generationRequest.js`: `buildGenerationRequest({context, decision, prerequisite?})`.
- `gameValidation.js`: `validateGame(candidate, request)` returns `{valid, errors}`.
- `gameGenerator.js`: `createGameGenerator(provider, {maxRepairs = 1}).generate(input)`.
- `geminiGameProvider.js`: opt-in `createGeminiGameProvider()`.
- `gameContract.js`: immutable `schema`, `templates`, `VERSION`, `LIMITS`, `PHASES`, `EVENTS`.

`context` must come from the existing Phase 3B service, and `decision` from the
existing Phase 3C engine, on the trusted server. Freeze/shape/scope checks are
defense in depth, **not authentication**. A browser-supplied lookalike is never a
trusted context or decision. Neither service is weakened or changed here. The
validator accepts only an in-process request issued by this builder (a WeakSet
guards against accidentally validating against a model-supplied request).

```js
const { createGameGenerator } = require('../services/gameGeneration/gameGenerator');
// context and decision have already been built by the trusted Phase 3B/3C services.
const result = await createGameGenerator(provider, { maxRepairs: 1 })
  .generate({ context, decision });
if (result.ok) {
  // result.package is detached, recursively frozen and validated.
  // No persistence or execution occurs here.
}
```

The request separates `academicGrounding`, `instructionalPolicy`,
`creativeFreedom`, and `outputContract`. It includes the exact response JSON
schema and fixed instructions. It excludes learner identifiers, observations,
mastery records, navigation hierarchy, and non-authoritative review text. Only
instructional decisions needed to design the game reach the provider. Stable
IDs and checksums, never timestamps/randomness, identify requests.

## Academic authority and current capability limits

WHAT is the selected node's explicit approved `SOURCE_TEXT`. Evidence IDs bind
material index and content fingerprint; each entry retains source ID/page refs.
The request also binds artifact version/checksum, node and materialized node IDs,
source registry/checksums, content fingerprint and source fingerprint.

A citation does not establish that arbitrary generated prose follows from it.
Consequently **v1 deliberately supports source-recall/cloze games**, using:

- claims equal to an entire approved material's text, byte-for-byte;
- prompts defined by `SOURCE_CLOZE`, an evidence ID and whole-token UTF-16 span;
- the full source passage with that span blanked (never a paraphrased prompt);
- answers exactly equal to that source span;
- MCQ alternatives that are distinct fragments present in the same source;
- hints/feedback from fixed non-academic templates, pointing to the same source.

The model can select passages/spans, arrange phases/challenges, choose interaction
type, and compose fictional templates. It cannot generate unchecked definitions,
formulas, answers or questions and make them authoritative by adding a citation.
Source fragments in MCQ options are candidate replacements, not independent
assertions. This verifies source correspondence, not whether every cloze is a
useful test of understanding. Human pedagogical evaluation remains necessary.

Materials needing student completion or any unresolved/resolved visual dependency
are excluded from answer generation. Eligible roles are explanation, definition,
concept, worked example, source-provided answer and observation. No visual
interpretation, inference, synthesis, unanswered task, or inferred diagram enters
academic authority. An entirely ineligible node fails before calling the provider.
No source is truncated to fit: exceeding the input bounds fails closed.

Phase 3B supplies **chapter** objectives, explicitly without selected-node
applicability. V1 therefore emits empty `learningObjectiveRefs` and the explicit
`NOT_ESTABLISHED` applicability marker. It never infers applicability from same
page, title similarity, text overlap or hierarchy. Objective-bearing games need a
reviewed node/objective mapping contract in a later reviewed extension. The
schema includes the reference fields, but rejects nonempty values in this version.

HOW is copied from `instructionalDecision` exactly: difficulty, scaffolding,
guidance, hints, reinforcement and challenge intensity. HIGH support requires
prior TEACH/DEMONSTRATE material for each challenge; STEP_BY_STEP requires guided
practice or remediation plus its fixed instruction. Hints obey the supplied
policy. Remediation mode requires a remediation challenge. HARD never adds
academic content. **This iteration does not establish deeper reasoning/application
for HARD, or prove mastery at any level**; each package carries that warning.
Broader, deterministically scored reasoning mechanics require explicit approved
concept/operation contracts or reviewed question-answer pairs, not keyword guesses
about what the chapter probably teaches.

## Creative freedom

Fiction is composed from closed, reviewed templates: imaginary cloud garden,
star library or pretend island; Mira, robot or friendly dragon; collecting
pretend stars, restoring a storybook or following a trail; encouraging dialogue.
The model chooses a title, narrative composition, decorative theme and reward.
These templates make no academic claims. Unknown prose fields, URLs, executable
content, custom asset paths and academic visual descriptions are rejected.
This is intentionally narrower than unrestricted generated stories: arbitrary
fictional prose can hide academic misinformation and cannot be proven safe by
checking references or forbidden-word regexes. The template catalog is exposed
in the request so a provider need not guess it.

## Prerequisites

Blocked Phase 3C decisions cannot generate the dependent game. Supply
`prerequisite: {context, decision}` only when the original decision is blocked.
The separate approved/materialized context must match an explicit unresolved
prerequisite edge; its own Phase 3C decision must permit work and refer to the
same learner. That decision controls HOW to teach the prerequisite. Its context
alone supplies academic evidence. The output mode is PREREQUISITE and
`prerequisiteFor` retains the original target and relationship ID for traceability.
Nested unresolved prerequisites fail closed; no automatic traversal/fetch occurs.
Hierarchy is neither examined nor sent to the model as prerequisite authority.

## GameSpecification and scoring

`source-game-v1` is an **engine-neutral intermediate format**, not the historical
browser quiz schema and not a verified Unity DTO. `gameContract.js` is its exact
machine-readable schema; all objects reject unknown fields.

| Field | Meaning |
| --- | --- |
| contractVersion, gameId, specVersion | Contract, deterministic request-family ID, initial spec revision |
| metadata | Title and fictional template selections |
| grounding, learningObjectiveRefs | Exact selected target; empty objectives pending applicability |
| academicMode, instructionalPolicy | Phase 3C mode and exact HOW policy |
| claims | Exact academic passages with evidence IDs |
| phases | Unique IDs/types, instruction templates, teaching references |
| challenges | IDs, phase, source/span prompt, type, correct answer, options, refs, hint/feedback, difficulty, telemetry key |
| completion | All challenge IDs in their declared order; no invented mastery threshold |
| reward | Decorative star/celebration quantity only; never XP or account mutation |
| visuals | Decorative theme and symbolic asset requirements; no external paths |
| telemetry | Event declarations and scope binding |

All ten requested lifecycle phases are representable. INTRO is first, COMPLETE
last; challenges belong to playable phases. Teaching must precede the supported
challenge. Completion references every challenge exactly once. CLOZE requires
empty options; MCQ_CLOZE requires 2–6 distinct source-fragment options including
the trusted correct answer. A future scorer can use exact case-sensitive string
equality against `correctAnswer` (or resolve a selected option to its string).
Any normalization/tolerance must be separately versioned and reviewed; a client
must not invent an answer key. No scorer or gameplay runtime is installed here.

## Validation and bounded repair

Validation has two layers:

1. Strict schema/type checks, enums, required fields, bounded arrays/text/numbers,
   and unknown-field rejection. JSON data is copied without invoking accessors or
   `toJSON`; cycles, non-finite numbers and excessive depth are rejected.
2. Cross-field checks: identity, exact academic text/answer support, references,
   adaptive policy, phases/order/scaffolding, option consistency, completion and
   telemetry. All stages run again after every repair.

Bounds: 180 KB initial request, 100 KB candidate, depth 20, 64 evidence entries,
12,000 characters per material, 10 phases, 24 challenges, 100 validation errors.
Repair adds at most one bounded candidate and its bounded errors to the original
request (some original sections are repeated explicitly). Large/non-JSON object
responses are not forwarded for repair; bounded malformed JSON strings may be.

`maxRepairs` is an integer 0–2, default 1. Total provider calls are at most
`1 + maxRepairs`; generation and repair attempts and validation results are
tracked separately. A repair receives the immutable original request, explicit
academic grounding/instructional policy, previous candidate, and deterministic
errors. Candidate data is untrusted. A repair may not redefine the request.
Provider exceptions immediately return controlled failure, with no retry or
fallback. Adapters own transport deadlines (Gemini: 90 seconds); an arbitrary
injected provider must also enforce its own deadline.

Failures contain only fixed error codes, fixed schema paths and counters, never
provider messages, raw responses, exception stacks, headers, URLs or credentials.
Successful packages contain detached/frozen game/evidence, request fingerprint,
specification fingerprint, telemetry context, warnings, and validation history.
`VALIDATED` means this contract passed; it is not curriculum approval, proof of
learning effectiveness, authorization, or a persisted GameSpec status.

## Providers

The only orchestration requirement is async-compatible
`generateStructuredGame(request)`, returning JSON text or a plain JSON object.
The same method receives `{kind: 'REPAIR', originalRequest, ...}` for correction.
Tests inject fakes; no global DB client is imported.

The optional Gemini adapter reuses existing `callGemini` exactly once per call,
uses application/json + responseJsonSchema, and reads `GEMINI_MODEL` and
`GEMINI_API_KEY` only from the process environment at execution. It does not load
`.env`, select a fallback model, retry, or log. Import/construction is inert.
Real Gemini/schema compatibility and game quality have not been tested in this
phase; no provider request is authorized or performed by these tests.

## Telemetry declarations, not ingestion

All twelve events requested for Phase 3F are declared in the contract, from
GAME_STARTED through GAME_ABANDONED, including phases, answers, hints, skips,
remediation and challenge completion. Future events must carry the package's
`telemetryContext` (gameId, specVersion, specificationFingerprint, artifact
version, source node, difficulty, objective refs), plus event type, phaseId when
relevant and challenge key when relevant. Challenge keys equal challenge IDs;
phase IDs and objective refs resolve within the validated game. Objectives are
empty until applicability is established. Session/event/learner IDs and timestamps
must be assigned by the future trusted telemetry boundary, not by the model.

The specification fingerprint distinguishes different candidates produced for the
same deterministic request/gameId and initial revision. Phase 3E must map this
identity to persisted versions deliberately. Nothing emits events, updates
mastery, claims that a decorative reward is XP, or writes a database record.

## Verification and deferred integration

Run `npm run test:game-generation` and `npm test` from `backend/`. Tests use the
existing in-memory artifact service fixture to build actual Phase 3B contexts and
Phase 3C decisions. They install a failing fetch guard and use fake providers.
They cover source/authority/identity attacks, malformed types, prerequisites,
adaptive behavior, repair limits, provider failures, safe diagnostics, determinism,
immutable isolation, and no DB/network activity in the generator.

Before Phase 3E: establish server authentication/authorization and trusted input
wiring, recheck artifact approval/materialization in the persistence transaction,
design version/reuse identity and map the new intermediate contract to GameSpec.
Do not treat an in-memory VALIDATED package as durable authorization. Node-level
objective applicability and richer academic mechanics remain explicit capability
gaps; do not silently relabel source recall as higher-order reasoning.

Before Unity translation: locate/audit actual loader DTOs, scoring/input APIs,
phase sequencing, asset resolution and event emission; then build and test a
versioned adapter. No verified Unity runtime exists in the current repository,
so this phase makes no Unity compatibility claim. An integration must render
source passages literally and keep decorative assets separate from academic
diagrams. No frontend, runtime, schema or migration was changed here.

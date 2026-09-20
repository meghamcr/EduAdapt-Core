# Trusted Unity runtime boundary (Phase 3G)

The server converts `source-game-v1` / specVersion 1, persisted in
`grounded-game-storage-v1`, into **`eduadapt-runtime-v1`**. These are separate
contracts. Unknown runtime versions fail before writes; unknown source versions
fail trusted storage validation. No silent compatibility fallback exists.

`src/services/gameplay/gameplaySession.js` provides transaction-bound operations:

- `openRuntimeSession({ learnerId, gameSpecId, creationKey, runtimeVersion })`
- `restoreRuntimeSession({ learnerId, sessionId, runtimeVersion })`
- `ingestRuntimeEvent({ learnerId, sessionId, runtimeVersion, event })`

Use the public-safe composition in `learningLoop.js` for the complete flow and
fixed error envelopes. Lower-level gameplay/persistence/context methods are
server-only domain APIs, not HTTP handlers. Never return persisted packages or
serialize caught Error objects to a client.

There is no new HTTP route or authentication implementation. A future authenticated
adapter must derive learnerId from the verified actor (or explicitly authorized
teacher-to-student scope), never trust body/localStorage learner IDs, and inject
`authorizeExecution` bound to that actor. The callback receives learnerId,
gameSpecId and the exact specificationChecksum, and must return a nonempty
server-owned certification reference only when execution is currently permitted.
No callback means denial. `VALIDATED_PENDING_RUNTIME` is NOT permission. The policy
is rechecked on open, restore, every event and duplicate delivery. It may run again
on transaction retry; it must be read-only, retry-safe and perform no provider calls.
An auth token, UUID, local demo flag or stored reference alone is not permission.

The projection includes opaque game/session IDs, title, fixed fictional template
text, difficulty/mode, visible instructional policy, ordered phases and their
explicit teaching text, ordered challenges, blanked prompts, choices, generic
hints, catalog visuals, decorative reward and replay-derived progress.
The game ID identifies the exact specification; the session ID binds all events.
No GameSpec database ID, learner ID, curriculum IDs, source registry, evidence IDs,
prompt offsets, answer mapping, checksum field, raw observations, mastery policy,
validation diagnostics, repair history or authorization reference is projected.

Teaching passages deliberately contain source knowledge. MCQ choices include the
correct text among alternatives. This is source-recall practice, not a secure exam:
non-disclosure means no privileged answer key or correct-choice association, NOT
that the answer word can never appear in learner-visible teaching or options.
Hints are generic rereading instructions, not solutions. Correct/incorrect feedback
appears only in server acknowledgements after scoring; no expected answer is echoed.
Approved source text is **plain text**, not HTML, Unity rich text, Markdown, links,
commands or asset addresses. Disable TextMeshPro richText and browser HTML parsing.
Visuals use only PAPER/PIXEL/PLAIN and DECORATIVE_BACKGROUND/FICTIONAL_COMPANION/
REWARD_ICON catalog keys. Map these to bundled, reviewed Unity assets; no URL fetch,
asset-path resolution, dynamic script execution or model-generated code.

See `runtime-example.json`: a synthetic, safe payload produced through the actual
fixture pipeline, with illustrative opaque IDs substituted. It contains no real
curriculum or secret answer keys. `runtime.test.js` checks the example against the
actual projection to prevent contract drift.

## Event protocol

Always send `runtimeVersion: "eduadapt-runtime-v1"` and the issued sessionId.
The authenticated adapter adds learnerId. Keep a stable opaque eventId for each
logical action across network retries. Do not reuse it for a changed action.
Send one action at a time and await acknowledgement before advancing:

1. GAME_STARTED.
2. PHASE_STARTED with the next phaseId, or REMEDIATION_STARTED for REMEDIATION.
3. For each challenge in that phase, CHALLENGE_PRESENTED with challengeId.
4. ANSWER_SUBMITTED with challengeId and response: exact string for CLOZE,
   zero-based integer into `choices` for MCQ_CLOZE. Never send correctness,
   attempts, score, mastery, difficulty, mode or completion booleans.
5. Incorrect answers keep the challenge active; the server increments attempts.
   HINT_REQUESTED records usage; CHALLENGE_SKIPPED resolves without success.
6. After all required phases/challenges, GAME_COMPLETED. The server alone decides
   whether completion is valid. A completed session can include skipped tasks;
   that is not mastery. GAME_ABANDONED terminates a started session, preserving
   partial evidence. A CREATED session must be started before abandonment.

An acknowledgement contains runtimeVersion, sessionId, eventId, sequence, attempt,
correctness, derivedTypes, generic feedback and progress. Non-answer correctness
and attempt are null. Progress contains status, sequence, phaseId,
activeChallengeId, active attempts/hints and resolved challenge display flags.
No raw learner response, timing or mastery is returned. A duplicate event returns
its original scoring receipt plus **current** replayed progress; don't regress UI
state to an old sequence when restoring/retrying.

Restore revalidates owner, policy, curriculum, game and event replay. Never trust
client save state. No answer history is included. COMPLETED/ABANDONED sessions can
be displayed/restored but cannot accept new events (exact retries still work).
There is no offline scoring or offline completion. Keep lost-response event IDs
stable; restore after reconnect. New sessions have distinct creationKeys. Repeating
an unchanged launch before play is idempotent. Once play has begun, use restore;
a launch with a reused key and a different adapted game rejects with a conflict.

## Unity developer next steps

1. Create DTOs for the example's exact fields and explicitly reject unknown runtime
   versions. Do not parse `source-game-v1` directly. The current Assets tree has no
   C# loader/DTO/GameManager to migrate.
2. Build phase rendering with plain-text teaching, blanked prompts, CLOZE input and
   MCQ buttons. Preserve phase/challenge order. Use reviewed bundled visual keys.
3. Connect through the future authenticated backend adapter, not Supabase tables.
   Keep no database/service-role keys or Gemini credentials in the Web build.
4. Implement sequential event delivery, stable event IDs, acknowledgement-driven
   progress, generic safe errors and restore. Display server scoring only.
5. Test both challenge types, wrong answers, hints, skips, abandonment, disconnect/
   duplicate delivery, denied authorization, stale authority and version mismatch.
   Web rendering, asset resolution and browser/auth integration remain untested.

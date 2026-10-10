# Unity runtime HTTP adapter

`src/http/runtimeApi.js` wraps the existing trusted gameplay service. It does not
reimplement projection, scoring, replay, evidence, mastery or adaptation. It opens
an already persisted, authorized GameSpec; generation/assignment remains a server
workflow. Nothing listens or loads credentials on import.

The October 8 continuation also connects the optional authenticated Level/Notes →
planner → launch flow at `/api/learning/levels`, `/api/learning/plans` and
`/api/learning/launch`. See [level planning](level-game-planning.md). Existing runtime
routes and their authorization contract remain unchanged. Latest verification is
46 HTTP tests and 634 complete backend tests, all passing; the historical counts
at the end of this document describe the earlier adapter-only checkpoint.

## Integration boundary

Exported factories:

```js
const { createRuntimeHttpServer } = require('./src/http/runtimeApi');
const server = createRuntimeHttpServer({
  db: trustedDatabaseAdapter,
  resolveActor: verifyProductionBearerToken,
  authorizeExecution: checkStudentAssignmentAndRuntimeCertification,
  allowedOrigins: ['https://your-reviewed-unity-host.example']
});
// The application bootstrap controls binding, TLS/reverse proxy and lifecycle.
```

The names above are integration interfaces, not shipped authentication functions.
`createRuntimeHttpHandler(options)` can instead be mounted as a native Node request
listener in a host application. Give it the raw request stream, before any middleware
has consumed the body. No production-ready startup command is added because verified
actor resolution and execution certification are not connected in this repository.

`resolveActor({bearerToken})` must verify the real identity-provider token, including
signature, issuer, audience, expiry/revocation as applicable, and resolve the server
User identity/role. Return `{learnerId, role: 'STUDENT'}` or null. The token subject
must be mapped to the real learner identity; do not assume arbitrary subject IDs are
User IDs. Never decode an unsigned token and call it authentication. Missing/failed
resolution returns 401. Non-student roles return 403. Cookies, localStorage, body
learnerId, client role headers and guessed session IDs are not actor resolution.
The resolver receives only the bearer credential, not client learner/body fields.

`authorizeExecution({learnerId,gameSpecId,specificationChecksum,actor})` remains a
separate trusted server policy. It must verify learner assignment/access, the exact
certified GameSpec variant and current execution permission, returning a server-owned
`{reference}` or null. It runs inside existing gameplay transactions and must be
read-only, bounded and retry-safe. Login alone grants no game execution. No resolver
or execution policy is supplied by default. All three endpoints enforce both gates;
the gameplay service additionally enforces session ownership and current authority.

Before production: wire those real policies and a trusted database adapter into a
host application, review deployed database permissions, serve HTTPS, configure exact
Unity origins and endpoint URL, and apply appropriate ingress rate limiting and auth
lookup deadlines. HTTP body/header limits are implemented; distributed throttling
and credential verification are not invented here. No schema change is needed.

## Requests and success responses

All actual calls use `POST`, `Authorization: Bearer <verified-token>` and
`Content-Type: application/json` (optional charset=utf-8). No learnerId is accepted.
Bodies are at most 4096 bytes, including chunked requests. Compressed bodies reject.
Runtime version is mandatory and must be `eduadapt-runtime-v1`. Unknown fields,
query parameters and unsupported paths reject. Server factory limits headers to
8192 bytes, header receipt to 10 seconds and request receipt to 30 seconds.

### Open

`POST /api/runtime/sessions`

```json
{
  "gameSpecId": "assigned-persisted-game-id",
  "creationKey": "stable-launch-action-id",
  "runtimeVersion": "eduadapt-runtime-v1"
}
```

`gameSpecId` is the persisted ID supplied by the authorized server assignment
workflow, not the opaque `gameId` inside the runtime payload. Client selection never
bypasses the execution policy. A repeated creationKey for the same learner/game is
idempotent; conflicting reuse rejects. HTTP 200 returns the sanitized runtime object
**directly**, with no `ok`, `result` or `runtime` envelope. See `runtime-example.json`.
This keeps the response directly deserializable as Unity's eduadapt-runtime-v1 DTO.

### Event

`POST /api/runtime/sessions/{sessionId}/events`

```json
{
  "runtimeVersion": "eduadapt-runtime-v1",
  "event": {
    "eventId": "stable-answer-action-id",
    "type": "ANSWER_SUBMITTED",
    "challengeId": "challenge1",
    "response": 0
  }
}
```

CLOZE uses an exact answer string; MCQ_CLOZE uses the selected zero-based choices
index. Other supported events are GAME_STARTED, PHASE_STARTED, REMEDIATION_STARTED,
CHALLENGE_PRESENTED, HINT_REQUESTED, CHALLENGE_SKIPPED, GAME_COMPLETED and
GAME_ABANDONED. Their fields/order are defined in `unity-runtime.md`. Do not submit
correctness, score, attempt counts, mastery, difficulty or learner-state changes.
Completion/abandonment use events, not client-authored summary records.

HTTP 200 returns the existing safe acknowledgement directly:

```json
{
  "runtimeVersion": "eduadapt-runtime-v1",
  "sessionId": "example-session",
  "eventId": "stable-answer-action-id",
  "sequence": 6,
  "attempt": 1,
  "correctness": false,
  "derivedTypes": ["ANSWER_INCORRECT"],
  "feedback": "Compare your answer with the source text.",
  "progress": {
    "status": "STARTED",
    "sequence": 6,
    "phaseId": "practice",
    "activeChallengeId": "challenge1",
    "attempts": 1,
    "hintsUsed": 0,
    "resolved": []
  }
}
```

Keep eventId and payload unchanged when retrying lost responses. Exact duplicates
return the original scoring receipt plus current replayed progress, without new
events/evidence. Reusing the key for different content returns 409. IDs are scoped
to the session. Wait for acknowledgement before advancing; never locally calculate
academic state. Server-scored correctness is permitted in acknowledgements; trusted
answer keys/associations are never returned.

### Restore

`POST /api/runtime/sessions/{sessionId}/restore`

```json
{ "runtimeVersion": "eduadapt-runtime-v1" }
```

HTTP 200 returns the sanitized runtime object directly with replay-derived progress.
No client state is accepted. Rechecks include actor ownership, execution policy,
current curriculum authority, stored game integrity and event replay. Terminal
sessions can be restored for display; normal new events remain disallowed.

## Errors and browser handling

Errors contain only `{"error":{"code":"FIXED_CODE"}}`, never exception messages,
stacks, credentials, submitted answers, provider prompts or database diagnostics.

| Status | Meaning / codes |
|---|---|
| 400 | INVALID_JSON or INVALID_REQUEST, including unsupported runtime version |
| 401 | UNAUTHENTICATED; WWW-Authenticate: Bearer |
| 403 | STUDENT_REQUIRED, EXECUTION_DENIED, ORIGIN_DENIED or PREFLIGHT_DENIED |
| 404 | NOT_FOUND or SESSION_NOT_FOUND; unknown and another learner's sessions indistinguishable |
| 405 | METHOD_NOT_ALLOWED; Allow: POST, OPTIONS |
| 409 | EVENT_OR_SESSION_CONFLICT; invalid order, completion or conflicting idempotency key |
| 413 | REQUEST_TOO_LARGE |
| 415 | JSON_REQUIRED or ENCODING_UNSUPPORTED |
| 500 | RUNTIME_UNAVAILABLE; safe failure for storage/authority/integrity/policy exceptions |

All responses are no-store and nosniff. Errors must not be interpreted as success or
mastery updates. After a lost response, retry the identical action ID or restore;
do not create a new action ID merely because the network failed.

Browser Origin headers must match the explicit configured allowlist, including
same-origin browser callers if their browser sends Origin. Default [] allows no
browser origins. Non-browser clients without Origin still require verified bearer
authentication and authorization. OPTIONS preflight allows only POST and
Authorization/Content-Type for approved origins; it performs no DB access and needs
no token. No wildcard origins or credentialed-cookie CORS is enabled. CORS is not
authentication. Unity Web supplies the bearer header through the host's reviewed
auth integration; do not embed server credentials in a Web build.

Public teaching text/choices intentionally contain source knowledge. Key secrecy
means absence of privileged answer associations, not absence of every answer word
from educational text. Render that text without HTML/rich-text/script interpretation.

## Verification

`npm run test:runtime-api` uses real HTTP on ephemeral 127.0.0.1 ports and the existing
synthetic in-memory database/provider fixtures. No Supabase or Gemini access occurs.
Environments forbidding loopback listeners need permission to run this test suite;
tests do not silently skip the HTTP boundary. `npm test` includes these tests and all
509 prior tests without weakening or deleting them.

Final local verification: **42 HTTP tests passed**, **551 complete backend tests
passed**, zero failed or skipped. Both new JavaScript files passed syntax checks;
Scoped `git diff --check` for the changed backend paths passed. The repository-wide
check stalled outside this change scope. The initial sandbox run could not bind localhost (EPERM);
the successful runs used permitted loopback listeners outside that sandbox.
No existing tests were removed or weakened, and no live DB/provider calls occurred.

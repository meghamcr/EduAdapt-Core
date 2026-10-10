# Level planning and runtime integration

The semantic planner selects an instructional interaction from declared capabilities.
It does not create authoritative curriculum facts or decide mastery. Current
`source-game-v1` capabilities are exact-text CLOZE/MCQ_CLOZE source recall. A visual
construction or open investigation stays deferred when no suitable executable
mechanic exists. READY can describe a **partial** practice plan with explicit
deferrals; it does not certify that the whole level is assessed.

## Server composition

Use `createRuntimeHttpServer` with the existing trusted database adapter, verified
actor resolver and execution-certification policy. Add a `learning` configuration:

```js
const { createGeminiPlannerProvider } = require('./src/services/gamePlanning/geminiPlannerProvider');
const { createGeminiGameProvider } = require('./src/services/gameGeneration/geminiGameProvider');
const learning = {
  plannerProvider: createGeminiPlannerProvider(),
  provider: createGeminiGameProvider(),
  authorizeLevel: checkReviewedLevelAccess,
  authorizeLearning: checkCurriculumAccess,
  loadPrerequisites: loadReviewedPrerequisiteRequirements,
  maxRepairs: 1
};
// Pass learning into createRuntimeHttpServer({...existingOptions, learning}).
```

These policy names are application-owned integration interfaces, not provided
allow policies. `authorizeLevel({learnerId,curriculumArtifactVersionId,levelId?,actor})`
returns `{reference}` only for an explicitly permitted level/catalogue.
`authorizeLearning({learnerId,curriculumArtifactVersionId,curriculumNodeId,actor})`
returns true only for permitted approved material. Source approval is separate from
review/authorization of a derived level. Existing `authorizeExecution` still checks
the exact GameSpec checksum before execution. No factory starts a server, imports
curriculum, opens Prisma, approves content, or reads .env on import.

`GEMINI_MODEL` and `GEMINI_API_KEY` are read at provider execution. Supply them through
the host's existing private environment; never place keys in source/example files.
Current model decision is `gemini-3.5-flash`; there is no fallback. Each planner call
has a timeout and one attempt. Game generation keeps the existing bounded repair
limit. Neither adapter is called by deterministic tests.

## HTTP flow

All routes require the same verified bearer actor, JSON limits and CORS handling as
[runtime HTTP](runtime-http-api.md). No client learnerId is accepted.

1. `POST /api/learning/levels` with `{curriculumArtifactVersionId}` returns server
   catalogue IDs/titles/spans for an approved imported snapshot.
2. `POST /api/learning/plans` with `{curriculumArtifactVersionId,levelId,language:"en"}`
   returns `planId`, status, exact Notes, selected games and explicit deferrals.
3. `POST /api/learning/launch` with `{planId,gameId,creationKey,runtimeVersion:"eduadapt-runtime-v1"}`
   returns the existing runtime object directly. It rechecks scope/adaptation and
   uses validated persistence/reuse before opening a session.
4. Use the existing events/restore endpoints. Request a fresh plan after evidence
   changes the presentation policy. A game completion never advances the level by
   itself. Failed or stale launch responses do not authorize local progression.

Plan tickets and semantic caches are bounded and process-local. Restart/eviction
requires preparing again; persisted validated games remain reusable. Multi-process
deployments need sticky plan routing or a reviewed shared ticket store. Language
support is explicitly `en`; translation is not invented. One level can contain
several planned games. Each game is confined to one approved node because that is
the existing evidence/grounding contract. This is not a rule to make one game per node.

## Unity

`EduAdaptBootstrap` includes `RuntimeApiClient` and `RuntimeSessionController`.
The authenticated host supplies the endpoint and short-lived verified bearer token:

```csharp
controller.Configure(endpointFromHost, verifiedBearerToken);
controller.PrepareLevel(approvedArtifactVersionId, serverCatalogueLevelId);
```

The generic client displays exact Notes, deferred visual notices and available
source-recall practice choices. `LaunchPlan`, `Open` and `Restore` remain callable
host integration methods. Unsupported mechanics fail closed. Text is displayed
without rich-text interpretation. Tokens are memory-only, HTTPS is required except
loopback development, and redirects are disabled. A lost request retains its exact
body/event ID for an explicit retry. Do not assign a new key to the same uncertain
action. The UI waits for acknowledgement; only server progress is applied.

The local `RuntimeLoader.TestRuntimeJson` path remains a presentation preview. It
does not create evidence or confer execution permission. Unity PlayMode tests
exercise real HTTP against an isolated synthetic service, with no live credentials.

## Reproduce the isolated proof

From the repository root, start the synthetic servers in a separate terminal:

```sh
node backend/tests/http/fixtures/unityProofServer.js /tmp/eduadapt-unity-proof.json
```

Then run the installed Unity Editor (adjust its installation path when necessary):

```sh
env EDUADAPT_UNITY_PROOF=/tmp/eduadapt-unity-proof.json \
  /Applications/Unity/Hub/Editor/6000.3.24f1/Unity.app/Contents/MacOS/Unity \
  -batchmode -nographics -projectPath "$PWD/EduAdapt-GameRuntime" \
  -runTests -testPlatform PlayMode \
  -testFilter 'RuntimeProtocolTests|RuntimeHttpProofTests' \
  -testResults /tmp/eduadapt-unity-tests.xml \
  -logFile /tmp/eduadapt-unity-tests.log
```

Stop the synthetic servers with Ctrl-C afterward. The fixture server binds only
127.0.0.1 and loads no production environment/Prisma client. Its synthetic token is
test data, not an application credential. Unity protocol tests can run separately;
the HTTP proof intentionally fails rather than silently skipping when no fixture
server configuration is supplied.

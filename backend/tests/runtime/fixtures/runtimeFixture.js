'use strict';
const { fixture, candidate } = require('../../gameGeneration/fixtures/gameFixture');
const { database } = require('../../curriculumArtifacts/fixtures/serviceFixture');
const { createGameGenerator } = require('../../../src/services/gameGeneration/gameGenerator');
const { createGamePersistenceService } = require('../../../src/services/gameGeneration/gamePersistence');
const { createGameplayService } = require('../../../src/services/gameplay/gameplaySession');
const { RUNTIME_VERSION } = require('../../../src/services/gameplay/runtimeProjection');
const authorizeExecution = async () => ({ reference: 'SYNTHETIC_TEST_POLICY' });
async function runtimeFixture({ type = 'MCQ_CLOZE', authorize = authorizeExecution, mutate = () => {} } = {}) {
  const f = await fixture({ db: database({ includeGameplay: true }) });
  const result = await createGameGenerator({ generateStructuredGame(request) {
    const game = candidate(request); game.challenges[0].type = type;
    if (type === 'CLOZE') game.challenges[0].options = [];
    mutate(game); return game;
  } }).generate(f);
  const stored = await createGamePersistenceService(f.db).persistValidatedGame({ context: f.context, decision: f.decision, result });
  const service = createGameplayService(f.db, { authorizeExecution: authorize });
  const learnerId = 'synthetic-learner', runtimeVersion = RUNTIME_VERSION;
  const openInput = { learnerId, gameSpecId: stored.gameSpecId, creationKey: 'launch', runtimeVersion };
  const runtime = await service.openRuntimeSession(openInput);
  const identity = { learnerId, sessionId: runtime.sessionId, runtimeVersion };
  let n = 0;
  const send = (type, extra = {}) => service.ingestRuntimeEvent({ ...identity, event: { eventId: `event_${++n}`, type, ...extra } });
  async function present() {
    await send('GAME_STARTED');
    for (const p of runtime.phases.slice(0, 3)) await send(p.type === 'REMEDIATION' ? 'REMEDIATION_STARTED' : 'PHASE_STARTED', { phaseId: p.id });
    await send('CHALLENGE_PRESENTED', { challengeId: runtime.challenges[0].id });
  }
  return { ...f, service, runtime, openInput, identity, send, present };
}
module.exports = { runtimeFixture, authorizeExecution, RUNTIME_VERSION };

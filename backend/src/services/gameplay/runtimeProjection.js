'use strict';
const { freeze } = require('../adaptiveLearning/learnerStateProvider');
const { templates } = require('../gameGeneration/gameContract');
const { fail } = require('./gameplayEvents');
const RUNTIME_VERSION = 'eduadapt-runtime-v1';
function requireRuntimeVersion(version) {
  if (version !== RUNTIME_VERSION) fail('RUNTIME_VERSION_UNSUPPORTED');
}
function progress(state, game) {
  return {
    status: state.status, sequence: state.sequence,
    phaseId: game.phases[state.phaseIndex]?.id || null,
    activeChallengeId: state.active?.challengeId || null,
    attempts: state.active?.attempts || 0, hintsUsed: state.active?.hintsUsed || 0,
    resolved: state.resolved.map(c => ({ challengeId: c.challengeId, completed: c.completion, skipped: c.skipped, abandoned: c.abandoned }))
  };
}
// INTERNAL projector. Call only within the gameplay transaction after the stored
// package, actor authorization and replay state have been verified. Never accept
// a client-supplied package. Explicit allowlists intentionally avoid object spreads.
function projectRuntime(p, session, state) {
  const g = p.game;
  if (p.generationContractVersion !== 'source-game-v1' || g.contractVersion !== 'source-game-v1' || g.specVersion !== 1) fail('RUNTIME_SOURCE_VERSION_UNSUPPORTED');
  const evidence = new Map(p.academicGrounding.evidence.map(e => [e.id, e.text]));
  const policy = g.instructionalPolicy;
  return freeze({
    runtimeVersion: RUNTIME_VERSION, gameId: `runtime_${p.specificationFingerprint}`, sessionId: session.id,
    title: g.metadata.title, difficulty: policy.difficulty, adaptiveMode: g.academicMode,
    fiction: { setting: templates[g.metadata.fiction.setting], character: templates[g.metadata.fiction.character],
      narrative: templates[g.metadata.fiction.narrative], dialogue: templates[g.metadata.fiction.dialogue] },
    instructionalPolicy: { scaffoldingLevel: policy.scaffoldingLevel, hintsAllowed: policy.hintsAllowed,
      guidanceLevel: policy.guidanceLevel, challengeIntensity: policy.challengeIntensity, reinforcementLevel: policy.reinforcementLevel },
    phases: g.phases.map(p => ({ id: p.id, type: p.type, instruction: templates[p.instruction],
      teaching: p.teachingRefs.map(ref => evidence.get(ref)) })),
    challenges: g.challenges.map(c => ({ id: c.id, type: c.type, phaseId: c.phaseId,
      instruction: templates.SOURCE_CLOZE,
      prompt: evidence.get(c.prompt.evidenceId).slice(0, c.prompt.start) + '____' + evidence.get(c.prompt.evidenceId).slice(c.prompt.end),
      choices: [...c.options], hint: c.hint ? templates.REREAD_SOURCE : null, telemetryKey: c.telemetryKey })),
    visuals: { theme: g.visuals.theme, assets: [...g.visuals.assets] },
    reward: { type: g.reward.type, quantity: g.reward.quantity },
    progress: progress(state, g)
  });
}
module.exports = { RUNTIME_VERSION, requireRuntimeVersion, projectRuntime, progress };

'use strict';
const { artifact, database, rehash } = require('../../curriculumArtifacts/fixtures/serviceFixture');
const { renderMaterials } = require('../../../src/services/curriculumIngestion/sourceFidelity');
const { createArtifactService } = require('../../../src/services/curriculumArtifacts/artifactService');
const { createGenerationContextService } = require('../../../src/services/gameGeneration/generationContext');
const { normalizeLearnerState, freeze } = require('../../../src/services/adaptiveLearning/learnerStateProvider');
const { normalizePrerequisites } = require('../../../src/services/adaptiveLearning/prerequisitePolicy');
const { decideAdaptiveLearning } = require('../../../src/services/adaptiveLearning/adaptiveDecision');
const { buildGenerationRequest } = require('../../../src/services/gameGeneration/generationRequest');
const { VERSION, EVENTS } = require('../../../src/services/gameGeneration/gameContract');

async function fixture({ nodeId = 'worked', state = {}, requirements = [] } = {}) {
  const db = database(), service = createArtifactService(db, { dbNull: null }), source = artifact();
  const node = source.nodes.find(n => n.id === 'worked'); node.id = nodeId;
  node.materials[0].text = 'A collection contains eight tokens and four counters.';
  node.content = renderMaterials(node.materials); rehash(source);
  const { versionId } = await service.persist(source);
  await service.review(versionId, 'IN_REVIEW', { expectedRevision: 0 });
  await service.review(versionId, 'APPROVED', { expectedRevision: 1, reviewerReference: 'synthetic-reviewer' });
  await service.importVersion(versionId);
  const context = await createGenerationContextService(db).build({ curriculumArtifactVersionId: versionId, curriculumNodeId: nodeId });
  const scope = { learnerId: 'synthetic-learner', artifactVersionId: versionId, nodeId };
  const decision = decideAdaptiveLearning({ context, learnerState: normalizeLearnerState({ ...scope, ...state }), prerequisites: normalizePrerequisites({ ...scope, requirements }) });
  db.trace = [];
  return { context, decision, db };
}
function candidate(request) {
  const a = request.academicGrounding, e = a.evidence[0], policy = request.instructionalPolicy;
  const start = e.text.indexOf('eight'), end = start + 5;
  const phaseType = a.mode === 'REMEDIATION' ? 'REMEDIATION' : policy.guidanceLevel === 'STEP_BY_STEP' ? 'GUIDED_PRACTICE' : 'CORE_GAMEPLAY';
  return {
    contractVersion: VERSION, gameId: request.gameId, specVersion: 1,
    metadata: { title: 'Source Quest', fiction: { setting: 'CLOUD_GARDEN', character: 'FRIENDLY_DRAGON', narrative: 'COLLECT_STARS', dialogue: 'TRY_TOGETHER' } },
    grounding: structuredClone(a.target), academicMode: a.mode, instructionalPolicy: structuredClone(policy), learningObjectiveRefs: [],
    claims: [{ evidenceId: e.id, text: e.text }],
    phases: [{ id: 'intro', type: 'INTRO', instruction: 'WELCOME', teachingRefs: [] },
      { id: 'teach', type: 'TEACH', instruction: 'READ_SOURCE', teachingRefs: [e.id] },
      { id: 'practice', type: phaseType, instruction: policy.guidanceLevel === 'STEP_BY_STEP' ? 'TRY_WITH_SUPPORT' : 'COMPLETE_CHALLENGES', teachingRefs: [] },
      { id: 'complete', type: 'COMPLETE', instruction: 'CELEBRATE', teachingRefs: [] }],
    challenges: [{ id: 'challenge1', type: 'MCQ_CLOZE', phaseId: 'practice', prompt: { template: 'SOURCE_CLOZE', evidenceId: e.id, start, end },
      groundingRefs: [e.id], learningObjectiveRefs: [], correctAnswer: 'eight', options: ['eight', 'four'],
      feedback: { correct: 'MATCHED_SOURCE', incorrect: 'REVISIT_SOURCE', evidenceId: e.id },
      hint: policy.hintsAllowed ? { template: 'REREAD_SOURCE', evidenceId: e.id } : null, difficulty: policy.difficulty, telemetryKey: 'challenge1' }],
    completion: { type: 'ALL_CHALLENGES', challengeIds: ['challenge1'] }, reward: { type: 'DECORATIVE_STAR', quantity: 1 },
    visuals: { theme: 'PAPER', assets: ['FICTIONAL_COMPANION'] },
    telemetry: { events: [...EVENTS], binding: { gameId: request.gameId, specVersion: 1, artifactVersionId: a.target.artifactVersionId, nodeId: a.target.nodeId,
      difficulty: policy.difficulty, learningObjectiveRefs: [] }, challengeKeys: ['challenge1'] }
  };
}
const changed = (input, fn) => { const copy = structuredClone(input); fn(copy); return freeze(copy); };
const strong = Array.from({ length: 3 }, (_, i) => ({ id: `e${i}`, correctness: true, attempts: 1, hintsUsed: 0, mistakes: 0, completion: true, abandoned: false, skipped: false }));
module.exports = { fixture, candidate, changed, strong, buildGenerationRequest };

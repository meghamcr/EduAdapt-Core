'use strict';
const { artifact, rehash, database } = require('../../curriculumArtifacts/fixtures/serviceFixture');
const { renderMaterials } = require('../../../src/services/curriculumIngestion/sourceFidelity');
const { createArtifactService } = require('../../../src/services/curriculumArtifacts/artifactService');
const { createLevelContextService } = require('../../../src/services/gamePlanning/levelContext');
const { normalizeLearnerState } = require('../../../src/services/adaptiveLearning/learnerStateProvider');
const { normalizePrerequisites } = require('../../../src/services/adaptiveLearning/prerequisitePolicy');
const { decideAdaptiveLearning } = require('../../../src/services/adaptiveLearning/adaptiveDecision');
const { candidate } = require('../../gameGeneration/fixtures/gameFixture');

async function fixture({ story = false, mutate = () => {}, approved = true } = {}) {
  const source = artifact(), db = database({ includeGameplay: true });
  source.subject = story ? 'Synthetic community study' : 'Synthetic mathematics';
  const node = source.nodes[1], material = node.materials[0];
  material.role = story ? 'story_context' : 'explanation';
  material.text = story ? 'Our class planted eight saplings and four shrubs together.' : 'A collection contains eight tokens and four counters.';
  const visual = structuredClone(material);
  visual.role = 'activity'; visual.text = 'Look at the illustration. Build a model and explain your choices.';
  visual.student_completion = true; visual.visual.status = 'VISUAL_DEPENDENCY';
  node.materials.push(visual);
  mutate(source);
  for (const n of source.nodes) n.content = renderMaterials(n.materials);
  rehash(source);
  const artifacts = createArtifactService(db, { dbNull: null });
  const { versionId } = await artifacts.persist(source);
  if (approved) {
    await artifacts.review(versionId, 'IN_REVIEW', { expectedRevision: 0 });
    await artifacts.review(versionId, 'APPROVED', { expectedRevision: 1, reviewerReference: 'SYNTHETIC_TEST_ONLY' });
    await artifacts.importVersion(versionId);
  }
  const service = createLevelContextService(db);
  if (!approved) return { db, versionId, service, source };
  const catalogue = await service.list(versionId), levelId = catalogue.levels[0].levelId;
  const levelContext = await service.build({ curriculumArtifactVersionId: versionId, levelId });
  function decisions(state = {}, requirements = []) {
    return Object.fromEntries(Object.entries(levelContext.contexts).map(([nodeId, context]) => {
      const scope = { learnerId: 'synthetic-learner', artifactVersionId: versionId, nodeId };
      return [nodeId, decideAdaptiveLearning({ context, learnerState: normalizeLearnerState({ ...scope, ...state }),
        prerequisites: normalizePrerequisites({ ...scope, requirements }) })];
    }));
  }
  return { db, versionId, source, service, levelContext, levelId, decisions };
}
// A deterministic provider double, not the production planner algorithm.
function planCandidate(request) {
  const material = request.materials.find(m => m.nodeId === 'worked' && m.supportedForRecall && request.adaptive[m.nodeId].dependentWorkAllowed);
  return { planVersion: request.planVersion, requestFingerprint: request.requestFingerprint,
    status: material ? 'READY' : 'UNSUPPORTED',
    games: material ? [{ id: 'source-practice', materialRefs: [material.materialRef], mechanic: 'MCQ_CLOZE', purpose: 'RECALL_EXPLICIT_TEXT' }] : [],
    deferred: request.materials.filter(m => m !== material).map(m => ({ materialRef: m.materialRef,
      reason: m.visualStatus !== 'NOT_APPLICABLE' ? 'VISUAL_DEPENDENCY' : m.studentCompletion ? 'UNANSWERED_TASK' : 'NOT_SELECTED', requiredCapability: 'NONE' })) };
}
function twoChallenges(request) {
  const g = candidate(request), c = structuredClone(g.challenges[0]); c.id = c.telemetryKey = 'challenge2';
  c.prompt.start = request.academicGrounding.evidence[0].text.indexOf('four'); c.prompt.end = c.prompt.start + 4; c.correctAnswer = 'four';
  g.challenges.push(c); g.completion.challengeIds.push(c.id); g.telemetry.challengeKeys.push(c.id); return g;
}
module.exports = { fixture, planCandidate, twoChallenges };

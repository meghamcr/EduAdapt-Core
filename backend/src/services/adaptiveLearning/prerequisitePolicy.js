const { object, id, fail, freeze } = require('./learnerStateProvider');
const policies = new WeakSet();
// Explicit relationships are supplied by an authorized curriculum policy owner.
// Empty requirements mean none supplied, not proof that none exist.
function normalizePrerequisites(input) {
  object(input, ['learnerId', 'artifactVersionId', 'nodeId', 'requirements']);
  if (!Array.isArray(input.requirements)) fail('INVALID_PREREQUISITES');
  const seen = new Set(), relationships = new Set();
  const requirements = input.requirements.map(r => {
    object(r, ['relationshipId', 'approvedBy', 'artifactVersionId', 'nodeId', 'masteryStatus', 'evidenceReference']);
    const result = { relationshipId: id(r.relationshipId), approvedBy: id(r.approvedBy), artifactVersionId: id(r.artifactVersionId), nodeId: id(r.nodeId), masteryStatus: r.masteryStatus, evidenceReference: r.evidenceReference == null ? null : id(r.evidenceReference) };
    if (!['UNKNOWN', 'MASTERED', 'NOT_MASTERED'].includes(result.masteryStatus)) fail('INVALID_PREREQUISITE_STATUS');
    if (result.masteryStatus !== 'UNKNOWN' && result.evidenceReference === null) fail('PREREQUISITE_EVIDENCE_REQUIRED');
    const key = JSON.stringify([result.artifactVersionId, result.nodeId]);
    if (relationships.has(result.relationshipId) || seen.has(key) || (result.artifactVersionId === input.artifactVersionId && result.nodeId === input.nodeId)) fail('INVALID_PREREQUISITE_RELATIONSHIP');
    seen.add(key); relationships.add(result.relationshipId); return result;
  }).sort((a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; });
  const policy = freeze({ learnerId: id(input.learnerId), artifactVersionId: id(input.artifactVersionId), nodeId: id(input.nodeId), requirements });
  policies.add(policy); return policy;
}
function evaluatePrerequisites(policy, context, learnerId) {
  if (!policies.has(policy)) fail('NORMALIZED_PREREQUISITES_REQUIRED');
  if (policy.learnerId !== learnerId) fail('PREREQUISITE_LEARNER_MISMATCH');
  if (policy.artifactVersionId !== context?.curriculum?.artifactVersionId || policy.nodeId !== context?.curriculum?.nodeId) fail('PREREQUISITE_SCOPE_MISMATCH');
  const unresolved = policy.requirements.filter(r => r.masteryStatus !== 'MASTERED');
  return freeze({ status: !policy.requirements.length ? 'NOT_SUPPLIED' : unresolved.some(r => r.masteryStatus === 'NOT_MASTERED') ? 'GAP' : unresolved.length ? 'UNKNOWN' : 'SATISFIED', dependentWorkAllowed: !unresolved.length, requirements: structuredClone(policy.requirements), unresolved: structuredClone(unresolved) });
}
module.exports = { normalizePrerequisites, evaluatePrerequisites };

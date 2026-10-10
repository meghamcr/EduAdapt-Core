'use strict';
const {fingerprint}=require('../services/curriculumIngestion/curriculumIdentity');
// Diagnostic provenance, never an execution permission or substitute for validation.
function groundingManifest(stored, chapter) {
  const scope=stored.planning, grounding=stored.academicGrounding;
  const level=chapter.levels.find(l=>l.levelId===scope?.levelId);
  if(!level || scope.artifactVersionId!==chapter.artifactVersionId || scope.artifactChecksum!==chapter.artifactChecksum || scope.sequenceFingerprint!==chapter.sequenceFingerprint)throw Error('MANIFEST_SCOPE_MISMATCH');
  const evidence=new Map(grounding.evidence.map(e=>[e.id,e]));
  const challenges=stored.game.challenges.map(c=>{
    const e=evidence.get(c.prompt.evidenceId),m=chapter.materials[e?.materialRef];
    if(!m || !level.learnerMaterialRefs.includes(m.materialId) || !scope.materialRefs.includes(m.materialId) || m.studentCompletion || m.visualStatus!=='NOT_APPLICABLE' || e.text!==m.text || fingerprint(e.sourceRefs)!==fingerprint(m.sourceRefs) || fingerprint([...(e.sourceUnitIds||[])].sort())!==fingerprint(m.sourceUnits.map(u=>u.id).sort()))throw Error('MANIFEST_EVIDENCE_MISMATCH');
    if(e.text.slice(c.prompt.start,c.prompt.end)!==c.correctAnswer)throw Error('MANIFEST_ANSWER_MISMATCH');
    return {challengeId:c.id,mechanic:c.type,materialRef:m.materialId,evidenceId:e.id,sourceRefs:m.sourceRefs,sourceUnits:m.sourceUnits,
      passageSha256:fingerprint(e.text),answerSpan:{start:c.prompt.start,end:c.prompt.end,sha256:fingerprint(c.correctAnswer)},
      hint:c.hint?.template || null,feedback:c.feedback,assessment:'EXACT_SOURCE_RECALL_ONLY'};
  });
  for(const claim of stored.game.claims)if(evidence.get(claim.evidenceId)?.text!==claim.text)throw Error('MANIFEST_CLAIM_MISMATCH');
  return {manifestVersion:1,usage:'DEVELOPMENT_ONLY',sourceReviewStatus:'UNREVIEWED',artifactVersionId:chapter.artifactVersionId,
    artifactChecksum:chapter.artifactChecksum,levelId:level.levelId,sequenceFingerprint:chapter.sequenceFingerprint,
    specificationFingerprint:fingerprint(stored.game),challenges};
}
module.exports={groundingManifest};

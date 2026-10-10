'use strict';
// Explicit development authority can only be attached to storage created here.
// There is no register-existing-db API, environment switch or HTTP approval flag.
const { database } = require('./inMemoryStore');
const { fingerprint } = require('../services/curriculumIngestion/curriculumIdentity');
const { buildChapterLevels } = require('../services/curriculumLevels/levelCurriculum');
const { isDeepStrictEqual } = require('node:util');
const transactions = new WeakMap(), contexts = new WeakSet();
function developmentEntry(tx, version) {
  const entry = transactions.get(tx)?.get(version?.id);
  return entry && version.reviewStatus === 'UNREVIEWED' &&
    fingerprint(version.snapshot) === entry.artifactChecksum && version.artifactChecksum === entry.artifactChecksum ? entry : null;
}
function isDevelopmentVersion(tx, version) { return Boolean(developmentEntry(tx, version)); }
function sourceEvidenceFor(tx, version) { return developmentEntry(tx, version)?.sourceEvidence; }
function markDevelopmentContext(tx, version, context) {
  if (isDevelopmentVersion(tx, version)) contexts.add(context);
}
function isDevelopmentContext(context) { return contexts.has(context); }
async function createDevelopmentWorkspace({ authorization, entries } = {}) {
  if (authorization !== 'LOCAL_UNREVIEWED_CURRICULUM' || !Array.isArray(entries) || !entries.length) throw Error('EXPLICIT_DEVELOPMENT_AUTHORIZATION_REQUIRED');
  const registry = new Map(), db = database({includeGameplay:true});
  for (const entry of entries) {
    const artifact = structuredClone(entry.artifact), sourceEvidence = structuredClone(entry.sourceEvidence);
    if (artifact._ingestion?.reviewStatus !== 'UNREVIEWED' || !sourceEvidence) throw Error('UNREVIEWED_SOURCE_WITH_LINE_EVIDENCE_REQUIRED');
    const chapter = buildChapterLevels(artifact, {sourceEvidence});
    if (entry.package && !isDeepStrictEqual(chapter, entry.package)) throw Error('SAVED_LEVEL_PACKAGE_MISMATCH');
    if (registry.has(chapter.artifactVersionId)) throw Error('DUPLICATE_DEVELOPMENT_ARTIFACT');
    registry.set(chapter.artifactVersionId, {artifact, sourceEvidence, chapter, artifactChecksum:chapter.artifactChecksum});
  }
  const transact = db.$transaction;
  db.$transaction = (fn, options) => transact(async tx => {
    transactions.set(tx, registry);
    try { return await fn(tx); } finally { transactions.delete(tx); }
  }, options);
  // Reuse integrity/materialization checks inside ephemeral storage. Review status
  // never changes and no curriculum review record is created.
  const { createArtifactService } = require('../services/curriculumArtifacts/artifactService');
  const artifacts = createArtifactService(db, {dbNull:null});
  for (const entry of registry.values()) {
    const {versionId} = await artifacts.persist(entry.artifact);
    await artifacts.importVersion(versionId, {importedBy:'ISOLATED_DEVELOPMENT_ONLY'});
  }
  return {db, chapters:[...registry.values()].map(e => structuredClone(e.chapter)), usage:'DEVELOPMENT_ONLY'};
}
module.exports = {createDevelopmentWorkspace, isDevelopmentVersion, sourceEvidenceFor, markDevelopmentContext, isDevelopmentContext};

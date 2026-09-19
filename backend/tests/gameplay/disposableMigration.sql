-- Run ONLY in an empty disposable local database. Minimal parent-key fixtures
-- match existing schema types; this is NOT a production/bootstrap migration.
\set ON_ERROR_STOP on
CREATE TABLE "User" (id TEXT PRIMARY KEY);
CREATE TABLE "CurriculumArtifactVersion" (id TEXT PRIMARY KEY);
CREATE TABLE "CurriculumNode" (id TEXT PRIMARY KEY);
CREATE TABLE game_spec (id UUID PRIMARY KEY);
\ir ../../prisma/proposals/phase3f/migration.sql
INSERT INTO "User" VALUES ('learner');
INSERT INTO "CurriculumArtifactVersion" VALUES ('artifact');
INSERT INTO "CurriculumNode" VALUES ('node');
INSERT INTO game_spec VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO "CurriculumNodeMastery" (id,"learnerId","artifactVersionId","nodeId","policyVersion") VALUES ('scope','learner','artifact','node','source-recall-mastery-v1');
INSERT INTO "GameplayEvidenceSession" (id,"learnerId","gameSpecId","artifactVersionId","nodeId","scopeId","specificationChecksum","contractVersion",difficulty,"adaptiveMode","creationKey","runtimeAuthorizationReference",state)
VALUES ('session','learner','00000000-0000-0000-0000-000000000001','artifact','node','scope','checksum','trusted-gameplay-v1','EASY','PRIMARY','open','test-certification','{}');
INSERT INTO "GameplayEvidenceEvent" (id,"sessionId","scopeId","eventKey",sequence,"scopeSequence","payloadFingerprint",type,payload,"derivedTypes","observedAt")
VALUES ('event','session','scope','token',1,1,'hash','GAME_STARTED','{}','[]',CURRENT_TIMESTAMP);
DO $$
BEGIN
  BEGIN
    INSERT INTO "GameplayEvidenceEvent" SELECT 'duplicate',"sessionId","scopeId","eventKey",2,2,"payloadFingerprint",type,"phaseId","challengeId",attempt,correctness,"responseTimeMs",payload,"derivedTypes","observedAt" FROM "GameplayEvidenceEvent" WHERE id='event';
    RAISE EXCEPTION 'duplicate token was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO "GameplayEvidenceEvent" SELECT 'duplicate-order',"sessionId","scopeId",'other',sequence,3,"payloadFingerprint",type,"phaseId","challengeId",attempt,correctness,"responseTimeMs",payload,"derivedTypes","observedAt" FROM "GameplayEvidenceEvent" WHERE id='event';
    RAISE EXCEPTION 'duplicate order was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO "GameplayEvidenceEvent" SELECT 'duplicate-scope',"sessionId","scopeId",'other',2,"scopeSequence","payloadFingerprint",type,"phaseId","challengeId",attempt,correctness,"responseTimeMs",payload,"derivedTypes","observedAt" FROM "GameplayEvidenceEvent" WHERE id='event';
    RAISE EXCEPTION 'duplicate scope sequence was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    UPDATE "GameplayEvidenceSession" SET "gameSpecId"='00000000-0000-0000-0000-000000000002';
    RAISE EXCEPTION 'unknown game was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    UPDATE "GameplayEvidenceEvent" SET correctness=true;
    RAISE EXCEPTION 'non-answer correctness was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    DELETE FROM "CurriculumNode";
    RAISE EXCEPTION 'referenced node was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
SELECT 'PASS: additive schema, inserts, token/order/scope uniqueness, FK, correctness CHECK, RESTRICT' AS result;

-- NON-DEPLOYED PHASE 3F ADDITIVE PROPOSAL. Outside configured migrations/.
-- Apply only to a disposable local database for review. No historical changes.
BEGIN;
CREATE TABLE "CurriculumNodeMastery" (
  "id" TEXT PRIMARY KEY,
  "learnerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "artifactVersionId" TEXT NOT NULL REFERENCES "CurriculumArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "nodeId" TEXT NOT NULL REFERENCES "CurriculumNode"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "nextSequence" INTEGER NOT NULL DEFAULT 0 CHECK ("nextSequence" >= 0),
  "status" TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK ("status" IN ('UNKNOWN','MASTERED','NOT_MASTERED')),
  "sampleSize" INTEGER NOT NULL DEFAULT 0 CHECK ("sampleSize" BETWEEN 0 AND 5),
  "policyVersion" TEXT NOT NULL
);
CREATE UNIQUE INDEX "CurriculumNodeMastery_learnerId_artifactVersionId_nodeId_key" ON "CurriculumNodeMastery"("learnerId","artifactVersionId","nodeId");
CREATE TABLE "GameplayEvidenceSession" (
  "id" TEXT PRIMARY KEY,
  "learnerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "gameSpecId" UUID NOT NULL REFERENCES "game_spec"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "artifactVersionId" TEXT NOT NULL REFERENCES "CurriculumArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "nodeId" TEXT NOT NULL REFERENCES "CurriculumNode"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "scopeId" TEXT NOT NULL REFERENCES "CurriculumNodeMastery"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "specificationChecksum" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  "difficulty" TEXT NOT NULL CHECK ("difficulty" IN ('EASY','MEDIUM','HARD')),
  "adaptiveMode" TEXT NOT NULL CHECK ("adaptiveMode" IN ('PRIMARY','REINFORCEMENT','REMEDIATION','PREREQUISITE')),
  "creationKey" TEXT NOT NULL,
  "runtimeAuthorizationReference" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED' CHECK ("status" IN ('CREATED','STARTED','COMPLETED','ABANDONED')),
  "state" JSONB NOT NULL CHECK (jsonb_typeof("state") = 'object'),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "GameplayEvidenceSession_learnerId_creationKey_key" ON "GameplayEvidenceSession"("learnerId","creationKey");
CREATE INDEX "GameplayEvidenceSession_scopeId_createdAt_idx" ON "GameplayEvidenceSession"("scopeId","createdAt");
CREATE TABLE "GameplayEvidenceEvent" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL REFERENCES "GameplayEvidenceSession"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "scopeId" TEXT NOT NULL REFERENCES "CurriculumNodeMastery"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "eventKey" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL CHECK ("sequence" BETWEEN 1 AND 500),
  "scopeSequence" INTEGER NOT NULL CHECK ("scopeSequence" > 0),
  "payloadFingerprint" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('GAME_STARTED','PHASE_STARTED','CHALLENGE_PRESENTED','ANSWER_SUBMITTED','HINT_REQUESTED','CHALLENGE_SKIPPED','REMEDIATION_STARTED','GAME_COMPLETED','GAME_ABANDONED')),
  "phaseId" TEXT,
  "challengeId" TEXT,
  "attempt" INTEGER CHECK ("attempt" > 0),
  "correctness" BOOLEAN,
  "responseTimeMs" INTEGER CHECK ("responseTimeMs" BETWEEN 0 AND 86400000),
  "payload" JSONB NOT NULL CHECK (jsonb_typeof("payload") = 'object'),
  "derivedTypes" JSONB NOT NULL CHECK (jsonb_typeof("derivedTypes") = 'array'),
  "observedAt" TIMESTAMPTZ(6) NOT NULL,
  CHECK (("type" = 'ANSWER_SUBMITTED') = ("correctness" IS NOT NULL)),
  CHECK (("type" = 'ANSWER_SUBMITTED') = ("attempt" IS NOT NULL))
);
CREATE UNIQUE INDEX "GameplayEvidenceEvent_sessionId_eventKey_key" ON "GameplayEvidenceEvent"("sessionId","eventKey");
CREATE UNIQUE INDEX "GameplayEvidenceEvent_sessionId_sequence_key" ON "GameplayEvidenceEvent"("sessionId","sequence");
CREATE UNIQUE INDEX "GameplayEvidenceEvent_scopeId_scopeSequence_key" ON "GameplayEvidenceEvent"("scopeId","scopeSequence");
COMMIT;

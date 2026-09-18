-- PROPOSED ONLY. NOT IN THE ACTIVE PRISMA MIGRATION DIRECTORY. DO NOT APPLY.
-- Forward delta from baselines/phase2b1.schema.prisma, NOT an empty DB baseline.
-- Requires separately approved baseline reconciliation, isolated PostgreSQL tests,
-- privilege/RLS review, and deployment authorization. No existing rows are changed.
BEGIN;
CREATE TYPE "CurriculumReviewStatus" AS ENUM ('UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');
CREATE TABLE "CurriculumArtifactIdentity" (
  "id" TEXT PRIMARY KEY,
  "board" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "bookKey" TEXT NOT NULL,
  "editionKey" TEXT NOT NULL,
  "chapterKey" TEXT NOT NULL,
  "currentVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "CurriculumArtifactVersion" (
  "id" TEXT PRIMARY KEY,
  "identityId" TEXT NOT NULL,
  "artifactChecksum" TEXT NOT NULL,
  "sourceFingerprint" TEXT,
  "contentFingerprint" TEXT NOT NULL,
  "configurationFingerprint" TEXT,
  "implementationFingerprint" TEXT,
  "model" TEXT,
  "generatedAt" TIMESTAMP(3),
  "generatedBy" TEXT,
  "authorityVersion" INTEGER,
  "snapshot" JSONB NOT NULL,
  "authoritativeNodes" JSONB,
  "sourceProvenance" JSONB NOT NULL,
  "objectives" JSONB NOT NULL,
  "reviewStatus" "CurriculumReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  "reviewRevision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifact_review_revision_nonnegative" CHECK ("reviewRevision" >= 0),
  CONSTRAINT "artifact_checksum_format" CHECK ("artifactChecksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "artifact_snapshot_object" CHECK (jsonb_typeof("snapshot") = 'object'),
  CONSTRAINT "artifact_authority_projection" CHECK ("authoritativeNodes" IS NULL OR ("authorityVersion" IS NOT NULL AND "authorityVersion" = 2 AND jsonb_typeof("authoritativeNodes") = 'array'))
);
CREATE TABLE "CurriculumArtifactReview" (
  "id" TEXT PRIMARY KEY,
  "versionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "fromStatus" "CurriculumReviewStatus" NOT NULL,
  "toStatus" "CurriculumReviewStatus" NOT NULL,
  "reviewerReference" TEXT,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  CONSTRAINT "artifact_review_revision_positive" CHECK ("revision" > 0)
);
CREATE TABLE "CurriculumArtifactImport" (
  "id" TEXT PRIMARY KEY,
  "versionId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedBy" TEXT,
  "importerFingerprint" TEXT NOT NULL,
  "nodeMapping" JSONB NOT NULL
);
ALTER TABLE "game_spec" ADD COLUMN "curriculum_artifact_version_id" TEXT;
CREATE UNIQUE INDEX "artifact_identity_scope_key" ON "CurriculumArtifactIdentity"("board", "grade", "subject", "bookKey", "editionKey", "chapterKey");
CREATE UNIQUE INDEX "CurriculumArtifactIdentity_id_currentVersionId_key" ON "CurriculumArtifactIdentity"("id", "currentVersionId");
CREATE UNIQUE INDEX "CurriculumArtifactVersion_artifactChecksum_key" ON "CurriculumArtifactVersion"("artifactChecksum");
CREATE UNIQUE INDEX "CurriculumArtifactVersion_identityId_id_key" ON "CurriculumArtifactVersion"("identityId", "id");
CREATE INDEX "CurriculumArtifactVersion_identityId_contentFingerprint_idx" ON "CurriculumArtifactVersion"("identityId", "contentFingerprint");
CREATE INDEX "CurriculumArtifactVersion_identityId_sourceFingerprint_idx" ON "CurriculumArtifactVersion"("identityId", "sourceFingerprint");
CREATE INDEX "CurriculumArtifactVersion_identityId_reviewStatus_idx" ON "CurriculumArtifactVersion"("identityId", "reviewStatus");
CREATE UNIQUE INDEX "CurriculumArtifactReview_versionId_revision_key" ON "CurriculumArtifactReview"("versionId", "revision");
CREATE UNIQUE INDEX "CurriculumArtifactImport_versionId_chapterId_key" ON "CurriculumArtifactImport"("versionId", "chapterId");
CREATE INDEX "CurriculumArtifactImport_chapterId_importedAt_idx" ON "CurriculumArtifactImport"("chapterId", "importedAt");
CREATE INDEX "game_spec_curriculum_artifact_version_id_idx" ON "game_spec"("curriculum_artifact_version_id");
ALTER TABLE "CurriculumArtifactVersion" ADD CONSTRAINT "CurriculumArtifactVersion_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "CurriculumArtifactIdentity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CurriculumArtifactIdentity" ADD CONSTRAINT "CurriculumArtifactIdentity_id_currentVersionId_fkey" FOREIGN KEY ("id", "currentVersionId") REFERENCES "CurriculumArtifactVersion"("identityId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CurriculumArtifactReview" ADD CONSTRAINT "CurriculumArtifactReview_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CurriculumArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CurriculumArtifactImport" ADD CONSTRAINT "CurriculumArtifactImport_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "CurriculumArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "CurriculumArtifactImport" ADD CONSTRAINT "CurriculumArtifactImport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "CurriculumChapter"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "game_spec" ADD CONSTRAINT "game_spec_curriculum_artifact_version_id_fkey" FOREIGN KEY ("curriculum_artifact_version_id") REFERENCES "CurriculumArtifactVersion"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- New-table guards only; no trigger, privilege or policy on a legacy table.
-- Prisma cannot describe these guards/CHECKs; preserve them in future SQL diffs.
CREATE FUNCTION curriculum_artifact_immutable_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Curriculum artifact history is immutable';
  END IF;
  IF (to_jsonb(NEW) - 'reviewStatus' - 'reviewRevision') IS DISTINCT FROM
     (to_jsonb(OLD) - 'reviewStatus' - 'reviewRevision') THEN
    RAISE EXCEPTION 'Curriculum artifact payload is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER curriculum_artifact_immutable_payload
BEFORE UPDATE OR DELETE ON "CurriculumArtifactVersion"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact_immutable_payload();
CREATE FUNCTION curriculum_artifact_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Curriculum artifact history is append-only';
END;
$$;
CREATE TRIGGER curriculum_artifact_review_append_only BEFORE UPDATE OR DELETE ON "CurriculumArtifactReview"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact_append_only();
CREATE TRIGGER curriculum_artifact_import_append_only BEFORE UPDATE OR DELETE ON "CurriculumArtifactImport"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact_append_only();
CREATE FUNCTION curriculum_artifact_immutable_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'currentVersionId') IS DISTINCT FROM (to_jsonb(OLD) - 'currentVersionId') THEN
    RAISE EXCEPTION 'Curriculum artifact scope is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER curriculum_artifact_immutable_identity BEFORE UPDATE ON "CurriculumArtifactIdentity"
FOR EACH ROW EXECUTE FUNCTION curriculum_artifact_immutable_identity();
COMMIT;

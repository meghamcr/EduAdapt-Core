-- EDUADAPT adaptive-learning schema migration.
-- This migration is intentionally NOT applied to Supabase by this commit.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "RecommendationType_new" AS ENUM (
  'NEXT_LESSON',
  'DIFFICULTY_ADJUSTMENT',
  'DROPOUT_RISK',
  'CONTENT_SUGGESTION',
  'PRACTICE_REQUIRED',
  'REVIEW_REQUIRED'
);
ALTER TABLE "Recommendation" ALTER COLUMN "type" TYPE "RecommendationType_new" USING ("type"::text::"RecommendationType_new");
DROP TYPE "RecommendationType";
ALTER TYPE "RecommendationType_new" RENAME TO "RecommendationType";

CREATE TYPE "GameType" AS ENUM ('EXPLORATION', 'PUZZLE', 'SORTING', 'MATCHING', 'SIMULATION', 'DRAG_DROP', 'SCENARIO', 'QUIZ', 'RIDDLE', 'WORD_GAME');
CREATE TYPE "GameStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "AssetType" AS ENUM ('SPRITE', 'BACKGROUND', 'CHARACTER', 'ICON', 'ANIMATION', 'SOUND', 'UI', 'OTHER');
CREATE TYPE "SessionStatus" AS ENUM ('STARTED', 'COMPLETED', 'ABANDONED', 'SKIPPED');
CREATE TYPE "InteractionType" AS ENUM ('START_GAME', 'ANSWER', 'HINT_USED', 'SKIP', 'RETRY', 'COMPLETE', 'PAUSE', 'RESUME', 'CONTENT_VIEWED', 'FEEDBACK_SHOWN');

ALTER TABLE "Course" ADD COLUMN "__adaptive_subjects_marker" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Course" DROP COLUMN "__adaptive_subjects_marker";

CREATE TABLE "Subject" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Chapter" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Topic" (
  "id" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subtopic" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subtopic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LearningObjective" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "subtopicId" TEXT,
  "statement" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningObjective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Game" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "subtopicId" TEXT,
  "title" TEXT NOT NULL,
  "gameType" "GameType" NOT NULL,
  "description" TEXT,
  "educationalObjective" TEXT,
  "difficulty" "Difficulty" NOT NULL,
  "pixelArt" BOOLEAN NOT NULL DEFAULT true,
  "introContent" TEXT,
  "specification" JSONB NOT NULL,
  "syllabusVersion" TEXT NOT NULL DEFAULT '1.0',
  "contentHash" TEXT NOT NULL,
  "status" "GameStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameAsset" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "type" "AssetType" NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Question" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "correctAnswer" TEXT NOT NULL,
  "explanation" TEXT,
  "difficulty" "Difficulty" NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 10,
  "orderIndex" INTEGER NOT NULL,
  CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentInteraction" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sessionId" TEXT,
  "topicId" TEXT,
  "subtopicId" TEXT,
  "questionId" TEXT,
  "eventType" "InteractionType" NOT NULL,
  "correctness" BOOLEAN,
  "responseTimeSec" INTEGER,
  "hintUsage" BOOLEAN,
  "attemptNumber" INTEGER,
  "metadata" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentInteraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentMistake" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "subtopicId" TEXT,
  "questionId" TEXT,
  "studentAnswer" TEXT NOT NULL,
  "expectedAnswer" TEXT NOT NULL,
  "misconception" TEXT,
  "metadata" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentMistake_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentTopicMastery" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "gamesCompleted" INTEGER NOT NULL DEFAULT 0,
  "gamesSkipped" INTEGER NOT NULL DEFAULT 0,
  "avgResponseTime" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "hintsUsed" INTEGER NOT NULL DEFAULT 0,
  "currentDifficulty" "Difficulty" NOT NULL DEFAULT 'EASY',
  "lastUpdated" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentTopicMastery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudentSubtopicMastery" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "subtopicId" TEXT NOT NULL,
  "masteryScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "gamesCompleted" INTEGER NOT NULL DEFAULT 0,
  "gamesSkipped" INTEGER NOT NULL DEFAULT 0,
  "avgResponseTime" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "hintsUsed" INTEGER NOT NULL DEFAULT 0,
  "currentDifficulty" "Difficulty" NOT NULL DEFAULT 'EASY',
  "lastUpdated" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentSubtopicMastery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "XPTransaction" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sessionId" TEXT,
  "xpAmount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "metadata" JSONB,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "XPTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Lesson" ADD COLUMN "topicId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "subtopicId" TEXT;

ALTER TABLE "GameSession" ADD COLUMN "gameId" TEXT;
ALTER TABLE "GameSession" ADD COLUMN "completion" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "GameSession" ADD COLUMN "hintsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GameSession" ADD COLUMN "mistakesCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GameSession" ADD COLUMN "status" "SessionStatus" NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "GameSession" ADD COLUMN "xpEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GameSession" ADD COLUMN "completedAt" TIMESTAMP(3);

ALTER TABLE "EngagementLog" ALTER COLUMN "metadata" TYPE JSONB USING CASE WHEN "metadata" IS NULL THEN NULL ELSE to_jsonb("metadata") END;

CREATE UNIQUE INDEX "Subject_courseId_orderIndex_key" ON "Subject"("courseId", "orderIndex");
CREATE UNIQUE INDEX "Subject_courseId_code_key" ON "Subject"("courseId", "code");
CREATE INDEX "Subject_courseId_idx" ON "Subject"("courseId");
CREATE UNIQUE INDEX "Chapter_subjectId_orderIndex_key" ON "Chapter"("subjectId", "orderIndex");
CREATE INDEX "Chapter_subjectId_idx" ON "Chapter"("subjectId");
CREATE UNIQUE INDEX "Topic_chapterId_orderIndex_key" ON "Topic"("chapterId", "orderIndex");
CREATE INDEX "Topic_chapterId_idx" ON "Topic"("chapterId");
CREATE UNIQUE INDEX "Subtopic_topicId_orderIndex_key" ON "Subtopic"("topicId", "orderIndex");
CREATE INDEX "Subtopic_topicId_idx" ON "Subtopic"("topicId");
CREATE UNIQUE INDEX "LearningObjective_topicId_orderIndex_key" ON "LearningObjective"("topicId", "orderIndex");
CREATE INDEX "LearningObjective_topicId_idx" ON "LearningObjective"("topicId");
CREATE INDEX "LearningObjective_subtopicId_idx" ON "LearningObjective"("subtopicId");
CREATE UNIQUE INDEX "Game_contentHash_key" ON "Game"("contentHash");
CREATE INDEX "Game_topicId_difficulty_status_idx" ON "Game"("topicId", "difficulty", "status");
CREATE INDEX "Game_subtopicId_idx" ON "Game"("subtopicId");
CREATE INDEX "Game_topicId_subtopicId_difficulty_syllabusVersion_idx" ON "Game"("topicId", "subtopicId", "difficulty", "syllabusVersion");
CREATE INDEX "GameAsset_gameId_idx" ON "GameAsset"("gameId");
CREATE INDEX "Question_gameId_idx" ON "Question"("gameId");
CREATE INDEX "StudentInteraction_studentId_idx" ON "StudentInteraction"("studentId");
CREATE INDEX "StudentInteraction_sessionId_idx" ON "StudentInteraction"("sessionId");
CREATE INDEX "StudentInteraction_topicId_idx" ON "StudentInteraction"("topicId");
CREATE INDEX "StudentInteraction_subtopicId_idx" ON "StudentInteraction"("subtopicId");
CREATE INDEX "StudentMistake_studentId_idx" ON "StudentMistake"("studentId");
CREATE INDEX "StudentMistake_sessionId_idx" ON "StudentMistake"("sessionId");
CREATE INDEX "StudentMistake_topicId_idx" ON "StudentMistake"("topicId");
CREATE INDEX "StudentMistake_subtopicId_idx" ON "StudentMistake"("subtopicId");
CREATE UNIQUE INDEX "StudentTopicMastery_studentId_topicId_key" ON "StudentTopicMastery"("studentId", "topicId");
CREATE INDEX "StudentTopicMastery_studentId_idx" ON "StudentTopicMastery"("studentId");
CREATE INDEX "StudentTopicMastery_topicId_idx" ON "StudentTopicMastery"("topicId");
CREATE UNIQUE INDEX "StudentSubtopicMastery_studentId_subtopicId_key" ON "StudentSubtopicMastery"("studentId", "subtopicId");
CREATE INDEX "StudentSubtopicMastery_studentId_idx" ON "StudentSubtopicMastery"("studentId");
CREATE INDEX "StudentSubtopicMastery_subtopicId_idx" ON "StudentSubtopicMastery"("subtopicId");
CREATE INDEX "XPTransaction_studentId_idx" ON "XPTransaction"("studentId");
CREATE INDEX "XPTransaction_sessionId_idx" ON "XPTransaction"("sessionId");
CREATE INDEX "Lesson_courseId_idx" ON "Lesson"("courseId");
CREATE INDEX "Lesson_topicId_idx" ON "Lesson"("topicId");
CREATE INDEX "Lesson_subtopicId_idx" ON "Lesson"("subtopicId");
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");
CREATE INDEX "GameSession_studentId_idx" ON "GameSession"("studentId");
CREATE INDEX "GameSession_lessonId_idx" ON "GameSession"("lessonId");
CREATE INDEX "GameSession_gameId_idx" ON "GameSession"("gameId");
CREATE INDEX "GameSession_studentId_lessonId_idx" ON "GameSession"("studentId", "lessonId");
CREATE INDEX "GameSession_studentId_gameId_idx" ON "GameSession"("studentId", "gameId");
CREATE INDEX "UserBadge_userId_idx" ON "UserBadge"("userId");
CREATE INDEX "UserBadge_badgeId_idx" ON "UserBadge"("badgeId");
CREATE INDEX "Leaderboard_courseId_totalPoints_idx" ON "Leaderboard"("courseId", "totalPoints");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "EngagementLog_userId_idx" ON "EngagementLog"("userId");
CREATE INDEX "Recommendation_studentId_idx" ON "Recommendation"("studentId");

ALTER TABLE "Subject" ADD CONSTRAINT "Subject_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subtopic" ADD CONSTRAINT "Subtopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearningObjective" ADD CONSTRAINT "LearningObjective_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Game" ADD CONSTRAINT "Game_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GameAsset" ADD CONSTRAINT "GameAsset_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Question" ADD CONSTRAINT "Question_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentInteraction" ADD CONSTRAINT "StudentInteraction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentInteraction" ADD CONSTRAINT "StudentInteraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentInteraction" ADD CONSTRAINT "StudentInteraction_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentInteraction" ADD CONSTRAINT "StudentInteraction_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StudentMistake" ADD CONSTRAINT "StudentMistake_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentMistake" ADD CONSTRAINT "StudentMistake_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentMistake" ADD CONSTRAINT "StudentMistake_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentMistake" ADD CONSTRAINT "StudentMistake_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "Subtopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "XPTransaction" ADD CONSTRAINT "XPTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XPTransaction" ADD CONSTRAINT "XPTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Level" (
  "id" TEXT NOT NULL,
  "levelNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "requiredXp" INTEGER NOT NULL,
  "rewardJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Level_levelNumber_key" ON "Level"("levelNumber");

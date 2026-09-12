const { PrismaClient, Role, Difficulty } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const levels = [
    { levelNumber: 1, title: 'Curious Learner', requiredXp: 0 },
    { levelNumber: 2, title: 'Explorer', requiredXp: 100 },
    { levelNumber: 3, title: 'Problem Solver', requiredXp: 250 },
    { levelNumber: 4, title: 'Knowledge Builder', requiredXp: 500 },
    { levelNumber: 5, title: 'Subject Master', requiredXp: 900 },
  ];

  for (const level of levels) {
    await prisma.level.upsert({
      where: { levelNumber: level.levelNumber },
      update: level,
      create: level,
    });
  }

  const badges = [
    { name: 'First Game', description: 'Complete your first learning game.', iconUrl: 'pixel:first-game', criteria: 'gamesCompleted >= 1' },
    { name: 'Quick Learner', description: 'Complete a game with strong accuracy and speed.', iconUrl: 'pixel:quick-learner', criteria: 'accuracy >= 0.8 and responseTimeSec <= 60' },
    { name: 'Consistent Learner', description: 'Complete five learning games.', iconUrl: 'pixel:consistent-learner', criteria: 'gamesCompleted >= 5' },
    { name: 'Topic Master', description: 'Reach 80% mastery on a topic.', iconUrl: 'pixel:topic-master', criteria: 'topicMastery >= 0.8' },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { name: badge.name },
      update: badge,
      create: badge,
    });
  }

  // Seed only when a suitable course already exists. This never creates a fake user
  // or changes authentication data in an existing project.
  const course = await prisma.course.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!course) {
    console.log('No course found; levels and badges seeded, example curriculum skipped.');
    return;
  }

  const subject = await prisma.subject.upsert({
    where: { courseId_code: { courseId: course.id, code: 'SCI' } },
    update: { name: 'Science', description: 'Example science curriculum for adaptive game development.', orderIndex: 1 },
    create: { courseId: course.id, name: 'Science', code: 'SCI', description: 'Example science curriculum for adaptive game development.', orderIndex: 1 },
  });

  const chapter = await prisma.chapter.upsert({
    where: { subjectId_orderIndex: { subjectId: subject.id, orderIndex: 1 } },
    update: { title: 'Matter', description: 'Introduction to matter and its basic properties.' },
    create: { subjectId: subject.id, title: 'Matter', description: 'Introduction to matter and its basic properties.', orderIndex: 1 },
  });

  const topic = await prisma.topic.upsert({
    where: { chapterId_orderIndex: { chapterId: chapter.id, orderIndex: 1 } },
    update: { title: 'What is Matter?', description: 'Understand what matter is and identify examples.' },
    create: { chapterId: chapter.id, title: 'What is Matter?', description: 'Understand what matter is and identify examples.', orderIndex: 1 },
  });

  const subtopics = [
    ['Definition of Matter', 'Matter is anything that has mass and occupies space.', 1],
    ['Mass and Volume', 'Mass describes the amount of matter and volume describes the space occupied.', 2],
    ['States of Matter', 'Solids, liquids and gases have different observable properties.', 3],
  ];

  for (const [title, description, orderIndex] of subtopics) {
    const subtopic = await prisma.subtopic.upsert({
      where: { topicId_orderIndex: { topicId: topic.id, orderIndex } },
      update: { title, description },
      create: { topicId: topic.id, title, description, orderIndex },
    });

    await prisma.learningObjective.upsert({
      where: { topicId_orderIndex: { topicId: topic.id, orderIndex } },
      update: { subtopicId: subtopic.id, statement: `Explain ${title.toLowerCase()} using an everyday example.` },
      create: { topicId: topic.id, subtopicId: subtopic.id, statement: `Explain ${title.toLowerCase()} using an everyday example.`, orderIndex },
    });
  }

  console.log(`Seeded adaptive learning data for course: ${course.title}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

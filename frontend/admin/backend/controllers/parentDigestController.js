const prisma = require('../lib/prisma');

async function generateDigestForStudent(student) {
  const masteries = await prisma.studentTopicMastery.findMany({
    where: { studentId: student.id },
    include: { topic: { select: { title: true } } }
  });

  const topicCount = masteries.length;
  const averageMastery = topicCount === 0
    ? null
    : masteries.reduce((sum, m) => sum + m.masteryScore, 0) / topicCount;

  const weakTopics = masteries
    .filter(m => m.masteryScore < 40)
    .map(m => m.topic.title);

  let tip;
  if (topicCount === 0) {
    tip = `${student.name} hasn't started any topics yet this week.`;
  } else if (weakTopics.length > 0) {
    tip = `Consider reviewing: ${weakTopics.join(', ')}.`;
  } else {
    tip = `${student.name} is doing well across all covered topics — keep it up!`;
  }

  return {
    studentName: student.name,
    parentEmail: student.parentEmail,
    topicsCovered: topicCount,
    averageMastery,
    tip
  };
}

async function runWeeklyDigest(req, res) {
  try {
    const students = await prisma.user.findMany({
      where: {
        schoolId: req.user.schoolId,
        role: 'STUDENT',
        parentEmail: { not: null }
      }
    });

    if (students.length === 0) {
      return res.status(400).json({ error: 'No students with a parentEmail on file' });
    }

    const digests = [];

    for (const student of students) {
      const digest = await generateDigestForStudent(student);
      digests.push(digest);

      await prisma.engagementLog.create({
        data: {
          userId: student.id,
          action: 'PARENT_DIGEST_LOGGED',
          metadata: digest
        }
      });
    }

    res.json({
      message: `Digest generated and logged for ${digests.length} student(s)`,
      digests
    });
  } catch (err) {
    console.error('Run weekly digest error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { runWeeklyDigest };
const prisma = require('../lib/prisma');

async function getAdoptionMetrics(req, res) {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const schoolUsers = await prisma.user.findMany({
      where: { schoolId: req.user.schoolId },
      select: { id: true }
    });
    const userIds = schoolUsers.map(u => u.id);

    const dailyLogins = await prisma.engagementLog.findMany({
      where: {
        userId: { in: userIds },
        action: 'LOGIN',
        createdAt: { gte: startOfToday }
      },
      select: { userId: true }
    });

    const monthlyLogins = await prisma.engagementLog.findMany({
      where: {
        userId: { in: userIds },
        action: 'LOGIN',
        createdAt: { gte: thirtyDaysAgo }
      },
      select: { userId: true }
    });

    const dau = new Set(dailyLogins.map(l => l.userId)).size;
    const mau = new Set(monthlyLogins.map(l => l.userId)).size;

    res.json({
      dau,
      mau,
      totalLoginEventsToday: dailyLogins.length,
      totalLoginEventsLast30Days: monthlyLogins.length
    });
  } catch (err) {
    console.error('Get adoption metrics error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}
async function getGradeMasteryComparison(req, res) {
  try {
    const classes = await prisma.schoolClass.findMany({
      where: { schoolId: req.user.schoolId },
      select: { id: true, grade: true }
    });

    const gradeToClassIds = {};
    for (const c of classes) {
      if (!gradeToClassIds[c.grade]) gradeToClassIds[c.grade] = [];
      gradeToClassIds[c.grade].push(c.id);
    }

    const results = [];

    for (const [grade, classIds] of Object.entries(gradeToClassIds)) {
      const students = await prisma.user.findMany({
        where: { classId: { in: classIds }, role: 'STUDENT' },
        select: { id: true }
      });
      const studentIds = students.map(s => s.id);

      if (studentIds.length === 0) {
        results.push({ grade, studentCount: 0, averageMastery: null });
        continue;
      }

      const masteries = await prisma.studentTopicMastery.findMany({
        where: { studentId: { in: studentIds } },
        select: { masteryScore: true }
      });

      const averageMastery = masteries.length === 0
        ? null
        : masteries.reduce((sum, m) => sum + m.masteryScore, 0) / masteries.length;

      results.push({ grade, studentCount: studentIds.length, averageMastery });
    }

    results.sort((a, b) => a.grade.localeCompare(b.grade));

    res.json({ grades: results });
  } catch (err) {
    console.error('Get grade mastery comparison error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { getAdoptionMetrics, getGradeMasteryComparison };
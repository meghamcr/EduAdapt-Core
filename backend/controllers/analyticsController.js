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
async function getAtRiskClasses(req, res) {
  try {
    const MASTERY_THRESHOLD = 40;
    const ENGAGEMENT_RATIO_THRESHOLD = 0.5;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const classes = await prisma.schoolClass.findMany({
      where: { schoolId: req.user.schoolId },
      select: { id: true, grade: true, section: true }
    });

    const results = [];

    for (const cls of classes) {
      const students = await prisma.user.findMany({
        where: { classId: cls.id, role: 'STUDENT' },
        select: { id: true }
      });
      const studentIds = students.map(s => s.id);

      if (studentIds.length === 0) {
        results.push({
          classId: cls.id,
          grade: cls.grade,
          section: cls.section,
          studentCount: 0,
          averageMastery: null,
          engagedStudentRatio: null,
          atRisk: false,
          reason: 'No students enrolled'
        });
        continue;
      }

      const masteries = await prisma.studentTopicMastery.findMany({
        where: { studentId: { in: studentIds } },
        select: { masteryScore: true }
      });

      const averageMastery = masteries.length === 0
        ? null
        : masteries.reduce((sum, m) => sum + m.masteryScore, 0) / masteries.length;

      const engagedLogs = await prisma.engagementLog.findMany({
        where: { userId: { in: studentIds }, createdAt: { gte: thirtyDaysAgo } },
        select: { userId: true }
      });
      const engagedStudentCount = new Set(engagedLogs.map(l => l.userId)).size;
      const engagedStudentRatio = engagedStudentCount / studentIds.length;

      let atRisk = false;
      let reason = 'Within normal range';

      if (averageMastery === null && engagedLogs.length === 0) {
        reason = 'Insufficient data';
      } else if (averageMastery !== null && averageMastery < MASTERY_THRESHOLD) {
        atRisk = true;
        reason = 'Low average mastery score';
      } else if (engagedStudentRatio < ENGAGEMENT_RATIO_THRESHOLD) {
        atRisk = true;
        reason = 'Low student engagement';
      }

      results.push({
        classId: cls.id,
        grade: cls.grade,
        section: cls.section,
        studentCount: studentIds.length,
        averageMastery,
        engagedStudentRatio,
        atRisk,
        reason
      });
    }

    res.json({ classes: results });
  } catch (err) {
    console.error('Get at-risk classes error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { getAdoptionMetrics, getGradeMasteryComparison, getAtRiskClasses };
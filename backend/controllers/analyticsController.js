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

module.exports = { getAdoptionMetrics };
const prisma = require('../lib/prisma');

const ADMIN_ACTIONS = [
  'TEACHER_VERIFICATION_UPDATED',
  'CLASS_TEACHER_ASSIGNED',
  'USER_ROLE_UPDATED',
  'USER_REACTIVATED',
  'USER_ACCESS_REVOKED',
  'LOGIN'
];

async function getAuditLogs(req, res) {
  try {
    const schoolAdmins = await prisma.user.findMany({
      where: { schoolId: req.user.schoolId, role: 'ADMIN' },
      select: { id: true, name: true, email: true }
    });
    const adminMap = new Map(schoolAdmins.map(a => [a.id, a]));
    const adminIds = schoolAdmins.map(a => a.id);

    const logs = await prisma.engagementLog.findMany({
      where: {
        userId: { in: adminIds },
        action: { in: ADMIN_ACTIONS }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const enriched = logs.map(log => ({
      id: log.id,
      action: log.action,
      performedBy: adminMap.get(log.userId) || null,
      metadata: log.metadata,
      createdAt: log.createdAt
    }));

    res.json({ logs: enriched });
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { getAuditLogs };
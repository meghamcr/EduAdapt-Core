const prisma = require('../lib/prisma');

async function updateUserRole(req, res) {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['STUDENT', 'TEACHER', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'role must be STUDENT, TEACHER, or ADMIN' });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || user.schoolId !== req.user.schoolId) {
      return res.status(404).json({ error: 'User not found in your school' });
    }

    if (user.id === req.user.userId) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true, isActive: true, schoolId: true }
    });

    await prisma.engagementLog.create({
      data: {
        userId: req.user.userId,
        action: 'USER_ROLE_UPDATED',
        metadata: { targetUserId: id, targetName: updated.name, oldRole: user.role, newRole: role }
      }
    });

    res.json({ message: 'Role updated', user: updated });
  } catch (err) {
    console.error('Update role error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function setUserActiveStatus(req, res) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive must be true or false' });
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user || user.schoolId !== req.user.schoolId) {
      return res.status(404).json({ error: 'User not found in your school' });
    }

    if (user.id === req.user.userId) {
      return res.status(400).json({ error: 'You cannot revoke your own access' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, name: true, email: true, role: true, isActive: true, schoolId: true }
    });

    await prisma.engagementLog.create({
      data: {
        userId: req.user.userId,
        action: isActive ? 'USER_REACTIVATED' : 'USER_ACCESS_REVOKED',
        metadata: { targetUserId: id, targetName: updated.name }
      }
    });

    res.json({ message: isActive ? 'User reactivated' : 'User access revoked', user: updated });
  } catch (err) {
    console.error('Set active status error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { updateUserRole, setUserActiveStatus };

const prisma = require('../lib/prisma');

async function sendBroadcast(req, res) {
  try {
    const { message, target, classId } = req.body;

    if (!message || !target) {
      return res.status(400).json({ error: 'message and target are required' });
    }

    const validTargets = ['ALL', 'STUDENT', 'TEACHER', 'ADMIN', 'CLASS'];
    if (!validTargets.includes(target)) {
      return res.status(400).json({ error: 'target must be one of: ALL, STUDENT, TEACHER, ADMIN, CLASS' });
    }

    if (target === 'CLASS' && !classId) {
      return res.status(400).json({ error: 'classId is required when target is CLASS' });
    }

    const where = { schoolId: req.user.schoolId };

    if (target === 'CLASS') {
      const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId } });
      if (!schoolClass || schoolClass.schoolId !== req.user.schoolId) {
        return res.status(404).json({ error: 'Class not found in your school' });
      }
      where.classId = classId;
      where.role = 'STUDENT';
    } else if (target !== 'ALL') {
      where.role = target;
    }

    const recipients = await prisma.user.findMany({ where, select: { id: true } });

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No matching recipients found' });
    }

    await prisma.notification.createMany({
      data: recipients.map(r => ({ userId: r.id, message }))
    });

    res.status(201).json({
      message: 'Broadcast sent',
      recipientCount: recipients.length
    });
  } catch (err) {
    console.error('Send broadcast error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { sendBroadcast };
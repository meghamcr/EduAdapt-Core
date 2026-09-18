const prisma = require('../lib/prisma');

async function getTeacherQueue(req, res) {
  try {
    const teachers = await prisma.user.findMany({
      where: {
        schoolId: req.user.schoolId,
        role: 'TEACHER'
      },
      select: {
        id: true,
        name: true,
        email: true,
        verificationStatus: true,
        createdAt: true,
        classTeacherOf: { select: { id: true, grade: true, section: true } },
        courses: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ teachers });
  } catch (err) {
    console.error('Get teacher queue error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function updateVerificationStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'status must be PENDING, APPROVED, or REJECTED' });
    }

    const teacher = await prisma.user.findUnique({ where: { id } });

    if (!teacher || teacher.role !== 'TEACHER' || teacher.schoolId !== req.user.schoolId) {
      return res.status(404).json({ error: 'Teacher not found in your school' });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { verificationStatus: status },
      select: { id: true, name: true, email: true, role: true, verificationStatus: true, schoolId: true, classId: true, createdAt: true }
    });

    await prisma.engagementLog.create({
      data: {
        userId: req.user.userId,
        action: 'TEACHER_VERIFICATION_UPDATED',
        metadata: { targetUserId: id, targetName: updated.name, newStatus: status }
      }
    });

    res.json({ message: `Teacher ${status.toLowerCase()}`, teacher: updated });
  } catch (err) {
    console.error('Update verification error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function assignClassTeacher(req, res) {
  try {
    const { id } = req.params; // teacher id
    const { classId } = req.body;

    const teacher = await prisma.user.findUnique({ where: { id } });

    if (!teacher || teacher.role !== 'TEACHER' || teacher.schoolId !== req.user.schoolId) {
      return res.status(404).json({ error: 'Teacher not found in your school' });
    }

    if (teacher.verificationStatus !== 'APPROVED') {
      return res.status(400).json({ error: 'Teacher must be APPROVED before being assigned as Class Teacher' });
    }

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId } });

    if (!schoolClass || schoolClass.schoolId !== req.user.schoolId) {
      return res.status(404).json({ error: 'Class not found in your school' });
    }

    const updated = await prisma.schoolClass.update({
      where: { id: classId },
      data: { classTeacherId: id }
    });

    await prisma.engagementLog.create({
      data: {
        userId: req.user.userId,
        action: 'CLASS_TEACHER_ASSIGNED',
        metadata: { teacherId: id, teacherName: teacher.name, classId, grade: updated.grade, section: updated.section }
      }
    });

    res.json({ message: 'Class Teacher assigned', class: updated });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This teacher is already the Class Teacher of another class' });
    }
    console.error('Assign class teacher error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { getTeacherQueue, updateVerificationStatus, assignClassTeacher };
const prisma = require('../lib/prisma');

async function getStudents(req, res) {
  try {
    const { classId, search } = req.query;

    const where = {
      schoolId: req.user.schoolId,
      role: 'STUDENT'
    };

    if (classId) {
      where.classId = classId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const students = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        classId: true,
        createdAt: true,
        studentClass: { select: { id: true, grade: true, section: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json({ count: students.length, students });
  } catch (err) {
    console.error('Get students error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { getStudents };
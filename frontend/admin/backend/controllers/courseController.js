const prisma = require('../lib/prisma');

async function createCourse(req, res) {
  try {
    const { title, teacherId } = req.body;

    if (!title || !teacherId) {
      return res.status(400).json({ error: 'Title and teacherId are required' });
    }

    const teacher = await prisma.user.findUnique({ where: { id: teacherId } });

    if (!teacher || teacher.role !== 'TEACHER' || teacher.schoolId !== req.user.schoolId) {
      return res.status(400).json({ error: 'teacherId must belong to a TEACHER in your school' });
    }

    const course = await prisma.course.create({
      data: {
        title,
        teacherId,
        schoolId: req.user.schoolId
      }
    });

    res.status(201).json({ message: 'Course created', course });
  } catch (err) {
    console.error('Create course error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function getCourses(req, res) {
  try {
    const courses = await prisma.course.findMany({
      where: { schoolId: req.user.schoolId },
      include: { teacher: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ courses });
  } catch (err) {
    console.error('Get courses error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { createCourse, getCourses };
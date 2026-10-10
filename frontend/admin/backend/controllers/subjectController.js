const prisma = require('../lib/prisma');

async function createSubject(req, res) {
  try {
    const { courseId, name, code, description, orderIndex } = req.body;

    if (!courseId || !name || !code || orderIndex === undefined) {
      return res.status(400).json({ error: 'courseId, name, code, and orderIndex are required' });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId } });

    if (!course || course.schoolId !== req.user.schoolId) {
      return res.status(400).json({ error: 'courseId must belong to a course in your school' });
    }

    const subject = await prisma.subject.create({
      data: { courseId, name, code, description, orderIndex }
    });

    res.status(201).json({ message: 'Subject created', subject });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A subject with this code or orderIndex already exists for this course' });
    }
    console.error('Create subject error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function getSubjectsByCourse(req, res) {
  try {
    const { courseId } = req.params;

    const course = await prisma.course.findUnique({ where: { id: courseId } });

    if (!course || course.schoolId !== req.user.schoolId) {
      return res.status(400).json({ error: 'courseId must belong to a course in your school' });
    }

    const subjects = await prisma.subject.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' }
    });

    res.json({ subjects });
  } catch (err) {
    console.error('Get subjects error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { createSubject, getSubjectsByCourse };
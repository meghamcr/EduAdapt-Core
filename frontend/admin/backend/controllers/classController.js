const prisma = require('../lib/prisma');

async function createClass(req, res) {
  try {
    const { grade, section } = req.body;

    if (!grade || !section) {
      return res.status(400).json({ error: 'Grade and section are required' });
    }

    const newClass = await prisma.schoolClass.create({
      data: {
        schoolId: req.user.schoolId,
        grade,
        section
      }
    });

    res.status(201).json({ message: 'Class created', class: newClass });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This grade and section already exists for your school' });
    }
    console.error('Create class error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function getClasses(req, res) {
  try {
    const classes = await prisma.schoolClass.findMany({
      where: { schoolId: req.user.schoolId },
      orderBy: [{ grade: 'asc' }, { section: 'asc' }]
    });

    res.json({ classes });
  } catch (err) {
    console.error('Get classes error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { createClass, getClasses };
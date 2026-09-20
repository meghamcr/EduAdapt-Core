const prisma = require('../lib/prisma');
const crypto = require('crypto');

function generateSchoolCode() {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `SCH-${random}`;
}

async function getSchoolInfo(req, res) {
  try {
    const school = await prisma.school.findUnique({
      where: { id: req.user.schoolId }
    });

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json({ school });
  } catch (err) {
    console.error('Get school info error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

async function regenerateSchoolCode(req, res) {
  try {
    const newCode = generateSchoolCode();

    const updated = await prisma.school.update({
      where: { id: req.user.schoolId },
      data: { code: newCode }
    });

    res.json({ message: 'School code regenerated', school: updated });
  } catch (err) {
    console.error('Regenerate school code error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { getSchoolInfo, regenerateSchoolCode };
const prisma = require('../lib/prisma');
const { stringify } = require('csv-stringify');

async function exportLearningOutcomes(req, res) {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.user.schoolId } });

    const masteries = await prisma.studentTopicMastery.findMany({
      where: {
        student: { schoolId: req.user.schoolId }
      },
      include: {
        student: {
          select: {
            name: true,
            email: true,
            studentClass: { select: { grade: true, section: true } }
          }
        },
        topic: {
          select: {
            title: true,
            chapter: { select: { title: true, subject: { select: { name: true } } } }
          }
        }
      }
    });

    const rows = masteries.map(m => ({
      StudentName: m.student.name,
      StudentEmail: m.student.email,
      Grade: m.student.studentClass ? m.student.studentClass.grade : '',
      Section: m.student.studentClass ? m.student.studentClass.section : '',
      Subject: m.topic.chapter.subject.name,
      Chapter: m.topic.chapter.title,
      Topic: m.topic.title,
      MasteryScore: m.masteryScore,
      Accuracy: m.accuracy,
      Attempts: m.attempts,
      CurrentDifficulty: m.currentDifficulty
    }));

    const columns = [
      'StudentName', 'StudentEmail', 'Grade', 'Section',
      'Subject', 'Chapter', 'Topic',
      'MasteryScore', 'Accuracy', 'Attempts', 'CurrentDifficulty'
    ];

    stringify(rows, { header: true, columns }, (err, output) => {
      if (err) {
        console.error('CSV generation error:', err);
        return res.status(500).json({ error: 'Failed to generate export' });
      }

      const filename = `${school.name.replace(/\s+/g, '_')}_learning_outcomes.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(output);
    });
  } catch (err) {
    console.error('Export learning outcomes error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

module.exports = { exportLearningOutcomes };
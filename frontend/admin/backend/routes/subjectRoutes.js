const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { createSubject, getSubjectsByCourse } = require('../controllers/subjectController');

router.post('/subjects', requireAdmin, createSubject);
router.get('/courses/:courseId/subjects', requireAdmin, getSubjectsByCourse);

module.exports = router;
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { createCourse, getCourses } = require('../controllers/courseController');

router.post('/courses', requireAdmin, createCourse);
router.get('/courses', requireAdmin, getCourses);

module.exports = router;

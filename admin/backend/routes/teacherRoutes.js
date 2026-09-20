const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { getTeacherQueue, updateVerificationStatus, assignClassTeacher } = require('../controllers/teacherController');

router.get('/teachers', requireAdmin, getTeacherQueue);
router.patch('/teachers/:id/verification', requireAdmin, updateVerificationStatus);
router.patch('/teachers/:id/assign-class', requireAdmin, assignClassTeacher);

module.exports = router;
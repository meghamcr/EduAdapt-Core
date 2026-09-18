const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { getStudents } = require('../controllers/studentController');

router.get('/students', requireAdmin, getStudents);

module.exports = router;
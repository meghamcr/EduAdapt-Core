const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { createClass, getClasses } = require('../controllers/classController');

router.post('/classes', requireAdmin, createClass);
router.get('/classes', requireAdmin, getClasses);

module.exports = router;
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { exportLearningOutcomes } = require('../controllers/exportController');

router.get('/export/learning-outcomes', requireAdmin, exportLearningOutcomes);

module.exports = router;

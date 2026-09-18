const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { getAdoptionMetrics, getGradeMasteryComparison } = require('../controllers/analyticsController');

router.get('/analytics/adoption', requireAdmin, getAdoptionMetrics);
router.get('/analytics/grade-mastery', requireAdmin, getGradeMasteryComparison);

module.exports = router;
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { getAdoptionMetrics, getGradeMasteryComparison, getAtRiskClasses } = require('../controllers/analyticsController');

router.get('/analytics/adoption', requireAdmin, getAdoptionMetrics);
router.get('/analytics/grade-mastery', requireAdmin, getGradeMasteryComparison);
router.get('/analytics/at-risk-classes', requireAdmin, getAtRiskClasses);

module.exports = router;
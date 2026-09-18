const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { getAdoptionMetrics } = require('../controllers/analyticsController');

router.get('/analytics/adoption', requireAdmin, getAdoptionMetrics);

module.exports = router;
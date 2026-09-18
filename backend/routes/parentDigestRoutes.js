const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { runWeeklyDigest } = require('../controllers/parentDigestController');

router.post('/parent-digest/run', requireAdmin, runWeeklyDigest);

module.exports = router;
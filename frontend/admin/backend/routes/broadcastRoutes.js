const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { sendBroadcast } = require('../controllers/broadcastController');

router.post('/broadcast', requireAdmin, sendBroadcast);

module.exports = router;
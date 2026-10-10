const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { getAuditLogs } = require('../controllers/auditController');

router.get('/audit-logs', requireAdmin, getAuditLogs);

module.exports = router;
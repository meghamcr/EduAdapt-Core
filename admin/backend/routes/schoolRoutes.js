const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { getSchoolInfo, regenerateSchoolCode } = require('../controllers/schoolController');

router.get('/school', requireAdmin, getSchoolInfo);
router.post('/school/regenerate-code', requireAdmin, regenerateSchoolCode);

module.exports = router;
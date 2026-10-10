const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/authMiddleware');
const { updateUserRole, setUserActiveStatus } = require('../controllers/rbacController');

router.patch('/users/:id/role', requireAdmin, updateUserRole);
router.patch('/users/:id/active-status', requireAdmin, setUserActiveStatus);

module.exports = router;
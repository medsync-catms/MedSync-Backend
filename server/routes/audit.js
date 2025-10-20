const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { requireAdmin } = require('../middleware/auth');

// Routes - Audit logs require admin role
router.get('/audit-log', requireAdmin, auditController.getAuditLog);

module.exports = router;

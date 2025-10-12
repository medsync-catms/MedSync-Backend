const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { requireAdmin } = require('../middleware/auth');

// Middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes - Audit logs require admin role
router.get('/audit-log', requireAdmin, auditController.getAuditLog);

module.exports = router;

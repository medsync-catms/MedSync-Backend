const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { requireAuth } = require('../middleware/auth');

// Middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/audit-log', requireAuth, auditController.getAuditLog);

module.exports = router;

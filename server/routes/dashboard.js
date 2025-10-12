const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/stats', requireAuth, dashboardController.getDashboardStats);
router.get('/upcoming', requireAuth, dashboardController.getUpcomingAppointments);

module.exports = router;


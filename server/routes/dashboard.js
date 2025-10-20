const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/auth');

// Routes
router.get('/stats', requireAuth, dashboardController.getDashboardStats);
router.get('/upcoming', requireAuth, dashboardController.getUpcomingAppointments);

module.exports = router;


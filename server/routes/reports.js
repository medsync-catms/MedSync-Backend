const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { requireManagerOrAdmin } = require('../middleware/auth');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes - Reports require manager or admin role
router.get('/branch-summary', requireManagerOrAdmin, reportsController.getBranchSummary);
router.get('/doctor-revenue', requireManagerOrAdmin, reportsController.getDoctorRevenue);
router.get('/outstanding-balances', requireManagerOrAdmin, reportsController.getOutstandingBalances);
router.get('/treatment-analysis', requireManagerOrAdmin, reportsController.getTreatmentAnalysis);

module.exports = router;


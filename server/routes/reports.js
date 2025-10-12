const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { requireAuth } = require('../middleware/auth');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/branch-summary', requireAuth, reportsController.getBranchSummary);
router.get('/doctor-revenue', requireAuth, reportsController.getDoctorRevenue);
router.get('/outstanding-balances', requireAuth, reportsController.getOutstandingBalances);
router.get('/treatment-analysis', requireAuth, reportsController.getTreatmentAnalysis);

module.exports = router;


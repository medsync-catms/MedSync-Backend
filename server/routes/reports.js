const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { requireManagerOrAdmin } = require('../middleware/auth');

// Routes - Reports require manager or admin role
router.get('/branch-summary', requireManagerOrAdmin, reportsController.getBranchSummary);
router.get('/doctor-revenue', requireManagerOrAdmin, reportsController.getDoctorRevenue);
router.get('/outstanding-balances', requireManagerOrAdmin, reportsController.getOutstandingBalances);
router.get('/treatment-analysis', requireManagerOrAdmin, reportsController.getTreatmentAnalysis);

// New report endpoints using database views
router.get('/insurance-claim-analytics', requireManagerOrAdmin, reportsController.getInsuranceClaimAnalytics);
router.get('/appointment-analytics', requireManagerOrAdmin, reportsController.getAppointmentAnalytics);
router.get('/daily-appointment-summary', requireManagerOrAdmin, reportsController.getDailyAppointmentSummary);
router.get('/revenue-analytics', requireManagerOrAdmin, reportsController.getRevenueAnalytics);
router.get('/reconciliation', requireManagerOrAdmin, reportsController.getReconciliationReport);
router.get('/notification-report', requireManagerOrAdmin, reportsController.getNotificationReport);

module.exports = router;


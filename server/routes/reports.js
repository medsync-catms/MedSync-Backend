const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const { requireManagerOrAdmin } = require('../middleware/auth');

// Routes - Reports require manager or admin role
router.get('/branch-summary', requireManagerOrAdmin, reportsController.getBranchSummary);
router.get('/doctor-revenue', requireManagerOrAdmin, reportsController.getDoctorRevenue);
router.get('/outstanding-balances', requireManagerOrAdmin, reportsController.getOutstandingBalances);
router.get('/treatment-analysis', requireManagerOrAdmin, reportsController.getTreatmentAnalysis);
router.get('/insurance-coverage', requireManagerOrAdmin, reportsController.getInsuranceCoverageReport);

// New report endpoints using database views
router.get('/insurance-claim-analytics', requireManagerOrAdmin, reportsController.getInsuranceClaimAnalytics);
router.get('/appointment-analytics', requireManagerOrAdmin, reportsController.getAppointmentAnalytics);
router.get('/daily-appointment-summary', requireManagerOrAdmin, reportsController.getDailyAppointmentSummary);
router.get('/revenue-analytics', requireManagerOrAdmin, reportsController.getRevenueAnalytics);
router.get('/reconciliation', requireManagerOrAdmin, reportsController.getReconciliationReport);
router.get('/notification-report', requireManagerOrAdmin, reportsController.getNotificationReport);

// Export routes
router.post('/branch-summary/export', requireManagerOrAdmin, reportsController.exportBranchSummary);
router.post('/doctor-revenue/export', requireManagerOrAdmin, reportsController.exportDoctorRevenue);
router.post('/outstanding-balances/export', requireManagerOrAdmin, reportsController.exportOutstandingBalances);
router.post('/treatment-analysis/export', requireManagerOrAdmin, reportsController.exportTreatmentAnalysis);
router.post('/insurance-coverage/export', requireManagerOrAdmin, reportsController.exportInsuranceCoverageReport);

module.exports = router;


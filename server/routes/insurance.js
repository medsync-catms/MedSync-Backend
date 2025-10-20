const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { requireAuth, requireStaffOrAbove, requireManagerOrAdmin } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Insurance Provider Routes - all authenticated users can view
router.get('/providers', requireAuth, insuranceController.getAllProviders);
router.get('/providers/:id', requireAuth, insuranceController.getProviderById);

// Claim Routes - require staff or above
router.get('/claims', requireAuth, insuranceController.getAllClaims);
router.get('/claims/stats', requireAuth, insuranceController.getClaimStats);
router.get('/claims/:id', requireAuth, insuranceController.getClaimById);
router.post('/claims', requireStaffOrAbove, setAuditUser, insuranceController.createClaim);
router.put('/claims/:id', requireStaffOrAbove, setAuditUser, insuranceController.updateClaim);
router.delete('/claims/:id', requireStaffOrAbove, setAuditUser, insuranceController.deleteClaim);

// Claim actions - require manager or admin
router.put('/claims/:id/approve', requireManagerOrAdmin, setAuditUser, insuranceController.approveClaim);
router.put('/claims/:id/reject', requireManagerOrAdmin, setAuditUser, insuranceController.rejectClaim);
router.put('/claims/:id/pay', requireManagerOrAdmin, setAuditUser, insuranceController.processClaimPayment);
router.post('/claims/:id/resubmit', requireStaffOrAbove, setAuditUser, insuranceController.resubmitClaim);

// Policy management routes
router.get('/policies/expiring', requireAuth, insuranceController.checkExpiringPolicies);

module.exports = router;


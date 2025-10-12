const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { requireAuth, requireStaffOrAbove, requireManagerOrAdmin } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

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
router.post('/claims/:id/resubmit', requireStaffOrAbove, setAuditUser, insuranceController.resubmitClaim);

module.exports = router;


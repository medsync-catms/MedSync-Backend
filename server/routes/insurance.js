const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { requireAuth } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/claims', requireAuth, insuranceController.getAllClaims);
router.get('/claims/stats', requireAuth, insuranceController.getClaimStats);
router.get('/claims/:id', requireAuth, insuranceController.getClaimById);
router.post('/claims', requireAuth, setAuditUser, insuranceController.createClaim);
router.put('/claims/:id', requireAuth, setAuditUser, insuranceController.updateClaim);
router.delete('/claims/:id', requireAuth, setAuditUser, insuranceController.deleteClaim);

module.exports = router;


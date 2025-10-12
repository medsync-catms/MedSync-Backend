const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { requireAuth, requireManagerOrAdmin, requireBranchAccess } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes - Staff management requires manager or admin role
router.get('/', requireAuth, staffController.getAllStaff);
router.get('/specialties', requireAuth, staffController.getAllSpecialties);
router.post('/', requireManagerOrAdmin, requireBranchAccess, setAuditUser, staffController.createStaff);
router.get('/:id', requireAuth, staffController.getStaffById);
router.put('/:id', requireManagerOrAdmin, setAuditUser, staffController.updateStaff);
router.delete('/:id', requireManagerOrAdmin, setAuditUser, staffController.deleteStaff);

module.exports = router;


const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const staffController = require('../controllers/staffController');
const { requireAuth } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/', requireAuth, staffController.getAllStaff);
router.get('/:id', requireAuth, staffController.getStaffById);
router.post('/', requireAuth, setAuditUser, staffController.createStaff);
router.put('/:id', requireAuth, setAuditUser, staffController.updateStaff);
router.delete('/:id', requireAuth, setAuditUser, staffController.deleteStaff);

module.exports = router;


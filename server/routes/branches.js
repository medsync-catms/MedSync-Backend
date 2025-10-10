const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { requireAuth } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/', requireAuth, branchController.getAllBranches);
router.get('/:id', requireAuth, branchController.getBranchById);
router.post('/', requireAuth, setAuditUser, branchController.createBranch);
router.put('/:id', requireAuth, setAuditUser, branchController.updateBranch);
router.delete('/:id', requireAuth, setAuditUser, branchController.deleteBranch);

module.exports = router;

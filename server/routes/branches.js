const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Routes - Branch management requires admin role
router.get('/', requireAuth, branchController.getAllBranches);
router.get('/:id', requireAuth, branchController.getBranchById);
router.post('/', requireAdmin, setAuditUser, branchController.createBranch);
router.put('/:id', requireAdmin, setAuditUser, branchController.updateBranch);
router.delete('/:id', requireAdmin, setAuditUser, branchController.deleteBranch);

module.exports = router;

const express = require('express');
const router = express.Router();
const treatmentController = require('../controllers/treatmentController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Routes - Treatment management requires doctor or manager role
router.get('/categories', requireAuth, treatmentController.getTreatmentCategories);
router.get('/', requireAuth, treatmentController.getAllTreatments);
router.get('/:id', requireAuth, treatmentController.getTreatmentById);
router.post('/', requireRole('doctor', 'manager', 'admin'), setAuditUser, treatmentController.createTreatment);
router.put('/:id', requireRole('doctor', 'manager', 'admin'), setAuditUser, treatmentController.updateTreatment);
router.delete('/:id', requireRole('doctor', 'manager', 'admin'), setAuditUser, treatmentController.deleteTreatment);

module.exports = router;

const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { requireAuth, requireStaffOrAbove, requireManagerOrAdmin } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Routes - Patient management requires staff role or above
router.get('/', requireAuth, patientController.getAllPatients);
router.get('/search', requireAuth, patientController.searchPatients);
router.get('/:id/outstanding', requireAuth, patientController.getPatientOutstanding);
router.get('/:id', requireAuth, patientController.getPatientById);
router.post('/', requireStaffOrAbove, setAuditUser, patientController.registerPatient);
router.put('/:id', requireStaffOrAbove, setAuditUser, patientController.updatePatient);
router.delete('/:id', requireManagerOrAdmin, setAuditUser, patientController.deletePatient);

// Patient Insurance Routes - require staff or above
router.post('/:id/insurance', requireStaffOrAbove, setAuditUser, patientController.addPatientInsurance);
router.put('/:id/insurance/:insuranceId', requireStaffOrAbove, setAuditUser, patientController.updatePatientInsurance);
router.delete('/:id/insurance/:insuranceId', requireStaffOrAbove, setAuditUser, patientController.deletePatientInsurance);

module.exports = router;
const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { requireAuth, requireStaffOrAbove } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes - Appointment management requires staff role or above
router.get('/', requireAuth, appointmentController.getAllAppointments);
router.get('/available-slots', requireAuth, appointmentController.getAvailableSlots);
router.get('/:id', requireAuth, appointmentController.getAppointmentById);
router.post('/', requireStaffOrAbove, setAuditUser, appointmentController.createAppointment);
router.put('/:id', requireStaffOrAbove, setAuditUser, appointmentController.updateAppointment);
router.put('/:id/no-show', requireStaffOrAbove, setAuditUser, appointmentController.markNoShow);
router.put('/:id/cancel', requireStaffOrAbove, setAuditUser, appointmentController.cancelWithReason);
router.delete('/:id', requireStaffOrAbove, setAuditUser, appointmentController.deleteAppointment);

// Treatment Records Routes - require staff or above
router.get('/:id/treatments', requireAuth, appointmentController.getTreatmentRecords);
router.post('/:id/treatments', requireStaffOrAbove, setAuditUser, appointmentController.addTreatmentRecord);
router.put('/:id/treatments/:treatmentRecordId', requireStaffOrAbove, setAuditUser, appointmentController.updateTreatmentRecord);
router.delete('/:id/treatments/:treatmentRecordId', requireStaffOrAbove, setAuditUser, appointmentController.deleteTreatmentRecord);

// Complete Appointment with Invoice - requires staff or above
router.post('/:id/complete', requireStaffOrAbove, setAuditUser, appointmentController.completeAppointmentWithInvoice);

module.exports = router;

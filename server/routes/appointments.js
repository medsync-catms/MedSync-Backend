const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { requireAuth } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/', requireAuth, appointmentController.getAllAppointments);
router.get('/:id', requireAuth, appointmentController.getAppointmentById);
router.post('/', requireAuth, setAuditUser, appointmentController.createAppointment);
router.put('/:id', requireAuth, setAuditUser, appointmentController.updateAppointment);
router.delete('/:id', requireAuth, setAuditUser, appointmentController.deleteAppointment);

module.exports = router;

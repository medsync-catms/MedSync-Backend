const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { requireAuth } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/', requireAuth, patientController.getAllPatients);
router.get('/:id', requireAuth, patientController.getPatientById);
router.get('/:id/outstanding', requireAuth, patientController.getPatientOutstanding);
router.post('/', requireAuth, setAuditUser, patientController.registerPatient);
router.put('/:id', requireAuth, setAuditUser, patientController.updatePatient);
router.delete('/:id', requireAuth, setAuditUser, patientController.deletePatient);

module.exports = router;
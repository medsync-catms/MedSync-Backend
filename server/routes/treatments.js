const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const treatmentController = require('../controllers/treatmentController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes - Treatment management requires doctor or manager role
router.get('/categories', requireAuth, treatmentController.getTreatmentCategories);
router.get('/', requireAuth, treatmentController.getAllTreatments);
router.get('/:id', requireAuth, treatmentController.getTreatmentById);
router.post('/', requireRole('doctor', 'manager', 'admin'), setAuditUser, treatmentController.createTreatment);
router.put('/:id', requireRole('doctor', 'manager', 'admin'), setAuditUser, treatmentController.updateTreatment);
router.delete('/:id', requireRole('doctor', 'manager', 'admin'), setAuditUser, treatmentController.deleteTreatment);

module.exports = router;

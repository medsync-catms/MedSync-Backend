const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const treatmentController = require('../controllers/treatmentController');
const { requireAuth } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/categories', requireAuth, treatmentController.getTreatmentCategories);
router.get('/', requireAuth, treatmentController.getAllTreatments);
router.get('/:id', requireAuth, treatmentController.getTreatmentById);
router.post('/', requireAuth, setAuditUser, treatmentController.createTreatment);
router.put('/:id', requireAuth, setAuditUser, treatmentController.updateTreatment);
router.delete('/:id', requireAuth, setAuditUser, treatmentController.deleteTreatment);

module.exports = router;

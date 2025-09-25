const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const patientController = require('../controllers/patientController');

router.use(express.json());

// Routes
router.get('/patients', patientController.getAllPatients);
router.post('/register', patientController.registerPatient);

module.exports = router;
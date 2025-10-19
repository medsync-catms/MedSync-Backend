const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Appointment Management Integration Tests', () => {
  let agent;
  let seedData;
  let testPatientId;
  let testDoctorId;
  let testBranchId;

  beforeAll(async () => {
    // Get seed data for testing
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id; // Dr. Silva
    testBranchId = seedData.branches[0].id; // Colombo Branch
  });

  beforeEach(async () => {
    // Login as receptionist for appointment operations
    const { agent: authenticatedAgent } = await authHelper.loginAs('receptionist');
    agent = authenticatedAgent;

    // Create a test patient for appointment tests
    const patientData = dataHelper.generatePatientData({
      firstName: "AppointmentTest",
      lastName: "Patient"
    });
    
    const response = await agent
      .post('/api/patients')
      .send({
        ...patientData,
        hasInsurance: false
      })
      .expect(201);

    testPatientId = response.body.patient.id;
    global.trackTestData('patients', testPatientId);
    global.trackTestData('addresses', response.body.patient.address_id);
  });

  describe('Appointment Booking', () => {
    
    test('should book appointment with valid data', async () => {
      const appointmentData = dataHelper.generateAppointmentData(testPatientId);
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.id).toBeDefined();
      expect(response.body.appointment.patient_id).toBe(testPatientId);
      expect(response.body.appointment.doctor_id).toBe(testDoctorId);
      expect(response.body.appointment.branch_id).toBe(testBranchId);
      expect(response.body.appointment.status).toBe('Scheduled');

      global.trackTestData('appointments', response.body.appointment.id);
    });

    test('should book appointment with exact test data', async () => {
      const tomorrow = dataHelper.createTomorrowAtTime(10, 0); // 10:00 AM tomorrow
      
      const exactAppointmentData = {
        patientId: testPatientId,
        doctorId: testDoctorId,
        branchId: testBranchId,
        appointmentDatetime: tomorrow,
        type: "Regular",
        notes: "Integration test appointment"
      };
      
      const response = await agent
        .post('/api/appointments')
        .send(exactAppointmentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.patient_id).toBe(testPatientId);
      expect(response.body.appointment.doctor_id).toBe(testDoctorId);
      expect(response.body.appointment.branch_id).toBe(testBranchId);
      expect(response.body.appointment.type).toBe('Regular');
      expect(response.body.appointment.notes).toBe('Integration test appointment');

      global.trackTestData('appointments', response.body.appointment.id);
    });

    test('should book walk-in appointment', async () => {
      const walkInData = dataHelper.generateWalkInData(testPatientId);
      
      const response = await agent
        .post('/api/appointments/walk-in')
        .send(walkInData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.id).toBeDefined();
      expect(response.body.appointment.type).toBe('Walk-in');
      expect(response.body.appointment.status).toBe('In Progress');

      global.trackTestData('appointments', response.body.appointment.id);
    });

    test('should filter doctors by specialty', async () => {
      const response = await agent
        .get('/api/appointments/doctors?specialty=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.doctors).toBeDefined();
      expect(Array.isArray(response.body.doctors)).toBe(true);
    });

    test('should get all doctors when no specialty filter', async () => {
      const response = await agent
        .get('/api/appointments/doctors')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.doctors).toBeDefined();
      expect(Array.isArray(response.body.doctors)).toBe(true);
    });
  });

  describe('Appointment Management', () => {
    let testAppointmentId;

    beforeEach(async () => {
      // Create a test appointment for management tests
      const appointmentData = dataHelper.generateAppointmentData(testPatientId);
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      testAppointmentId = response.body.appointment.id;
      global.trackTestData('appointments', testAppointmentId);
    });

    test('should get appointment by ID', async () => {
      const response = await agent
        .get(`/api/appointments/${testAppointmentId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.id).toBe(testAppointmentId);
      expect(response.body.appointment.patient_id).toBe(testPatientId);
    });

    test('should get all appointments', async () => {
      const response = await agent
        .get('/api/appointments')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointments).toBeDefined();
      expect(Array.isArray(response.body.appointments)).toBe(true);
    });

    test('should update appointment status', async () => {
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/status`)
        .send({ status: 'Confirmed' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.status).toBe('Confirmed');
    });

    test('should cancel appointment with reason', async () => {
      const cancelData = {
        status: 'Cancelled',
        cancellationReason: 'Patient requested cancellation'
      };

      const response = await agent
        .put(`/api/appointments/${testAppointmentId}`)
        .send(cancelData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.status).toBe('Cancelled');
      expect(response.body.appointment.cancellation_reason).toBe('Patient requested cancellation');
    });

    test('should mark appointment as no-show', async () => {
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/no-show`)
        .send({ notes: 'Patient did not arrive' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.status).toBe('No Show');
    });

    test('should complete appointment', async () => {
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.status).toBe('Completed');
    });
  });

  describe('Validation Tests', () => {
    
    test('should reject appointment booking with doctor conflict', async () => {
      const baseTime = dataHelper.createTomorrowAtTime(10, 0); // 10:00 AM tomorrow
      
      // Book first appointment
      const appointmentData1 = dataHelper.generateAppointmentData(testPatientId, {
        appointmentDatetime: baseTime
      });
      
      await agent
        .post('/api/appointments')
        .send(appointmentData1)
        .expect(201);

      // Try to book conflicting appointment (15 minutes later)
      const conflictTime = dataHelper.createTomorrowAtTime(10, 15);
      const appointmentData2 = dataHelper.generateAppointmentData(testPatientId, {
        appointmentDatetime: conflictTime
      });
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData2)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('conflicting appointment');
    });

    test('should reject appointment booking outside clinic hours', async () => {
      const outsideHoursTime = dataHelper.createTomorrowAtTime(7, 0); // 7:00 AM (before opening)
      
      const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
        appointmentDatetime: outsideHoursTime
      });
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('clinic hours');
    });

    test('should reject appointment booking with invalid patient data', async () => {
      const appointmentData = dataHelper.generateAppointmentData(99999); // Non-existent patient
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject appointment booking with past date', async () => {
      const pastDate = dataHelper.createPastDate(1); // Yesterday
      
      const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
        appointmentDatetime: pastDate
      });
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('past');
    });

    test('should reject appointment booking with invalid datetime format', async () => {
      const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
        appointmentDatetime: 'invalid-datetime'
      });
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject appointment booking with non-existent doctor', async () => {
      const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
        doctorId: 99999
      });
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject appointment booking with non-existent branch', async () => {
      const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
        branchId: 99999
      });
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Access Control', () => {
    
    test('should allow doctor to access appointment operations', async () => {
      const doctorAgent = await authHelper.getAuthenticatedAgent('doctor');
      
      await doctorAgent.get('/api/appointments').expect(200);
      await doctorAgent.post('/api/appointments').expect(400); // Validation error expected
    });

    test('should allow nurse to access appointment operations', async () => {
      const nurseAgent = await authHelper.getAuthenticatedAgent('nurse');
      
      await nurseAgent.get('/api/appointments').expect(200);
      await nurseAgent.post('/api/appointments').expect(400); // Validation error expected
    });

    test('should allow manager to access appointment operations', async () => {
      const managerAgent = await authHelper.getAuthenticatedAgent('manager');
      
      await managerAgent.get('/api/appointments').expect(200);
      await managerAgent.post('/api/appointments').expect(400); // Validation error expected
    });

    test('should deny access to unauthenticated users', async () => {
      const unauthenticatedAgent = request(app);
      
      await unauthenticatedAgent.get('/api/appointments').expect(401);
      await unauthenticatedAgent.post('/api/appointments').expect(401);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle appointment not found', async () => {
      const response = await agent
        .get('/api/appointments/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle invalid appointment ID format', async () => {
      const response = await agent
        .get('/api/appointments/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed request data', async () => {
      const response = await agent
        .post('/api/appointments')
        .send('invalid json')
        .expect(400);
    });

    test('should handle invalid status update', async () => {
      const appointmentData = dataHelper.generateAppointmentData(testPatientId);
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      const appointmentId = response.body.appointment.id;
      global.trackTestData('appointments', appointmentId);

      // Try to update to invalid status
      await agent
        .put(`/api/appointments/${appointmentId}/status`)
        .send({ status: 'InvalidStatus' })
        .expect(400);
    });
  });

  describe('Appointment Status Workflow', () => {
    let testAppointmentId;

    beforeEach(async () => {
      // Create a test appointment for workflow tests
      const appointmentData = dataHelper.generateAppointmentData(testPatientId);
      
      const response = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      testAppointmentId = response.body.appointment.id;
      global.trackTestData('appointments', testAppointmentId);
    });

    test('should follow complete appointment lifecycle', async () => {
      // 1. Start with Scheduled status
      let response = await agent
        .get(`/api/appointments/${testAppointmentId}`)
        .expect(200);
      expect(response.body.appointment.status).toBe('Scheduled');

      // 2. Confirm appointment
      response = await agent
        .put(`/api/appointments/${testAppointmentId}/status`)
        .send({ status: 'Confirmed' })
        .expect(200);
      expect(response.body.appointment.status).toBe('Confirmed');

      // 3. Start consultation (In Progress)
      response = await agent
        .put(`/api/appointments/${testAppointmentId}/status`)
        .send({ status: 'In Progress' })
        .expect(200);
      expect(response.body.appointment.status).toBe('In Progress');

      // 4. Complete appointment
      response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);
      expect(response.body.appointment.status).toBe('Completed');
    });

    test('should prevent invalid status transitions', async () => {
      // Try to go directly from Scheduled to Completed
      await agent
        .put(`/api/appointments/${testAppointmentId}/status`)
        .send({ status: 'Completed' })
        .expect(400);

      // Try to go from Completed back to Scheduled
      await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      await agent
        .put(`/api/appointments/${testAppointmentId}/status`)
        .send({ status: 'Scheduled' })
        .expect(400);
    });
  });
});

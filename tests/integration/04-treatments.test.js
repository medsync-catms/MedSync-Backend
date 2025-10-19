const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Treatment Management Integration Tests', () => {
  let doctorAgent;
  let receptionistAgent;
  let seedData;
  let testPatientId;
  let testAppointmentId;
  let testDoctorId;

  beforeAll(async () => {
    // Get seed data for testing
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id; // Dr. Silva
  });

  beforeEach(async () => {
    // Login as receptionist to create patient and appointment
    const { agent: receptionistAuth } = await authHelper.loginAs('receptionist');
    receptionistAgent = receptionistAuth;

    // Login as doctor for treatment operations
    const { agent: doctorAuth } = await authHelper.loginAs('doctor');
    doctorAgent = doctorAuth;

    // Create a test patient
    const patientData = dataHelper.generatePatientData({
      firstName: "TreatmentTest",
      lastName: "Patient"
    });
    
    const response = await receptionistAgent
      .post('/api/patients')
      .send({
        ...patientData,
        hasInsurance: false
      })
      .expect(201);

    testPatientId = response.body.patient.id;
    global.trackTestData('patients', testPatientId);
    global.trackTestData('addresses', response.body.patient.address_id);

    // Create a test appointment
    const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
      doctorId: testDoctorId,
      status: 'In Progress'
    });
    
    const appointmentResponse = await receptionistAgent
      .post('/api/appointments')
      .send(appointmentData)
      .expect(201);

    testAppointmentId = appointmentResponse.body.appointment.id;
    global.trackTestData('appointments', testAppointmentId);
  });

  describe('Treatment Recording', () => {
    
    test('should record single treatment', async () => {
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1, // General Consultation
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Patient presented with mild symptoms"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments).toBeDefined();
      expect(response.body.treatments.length).toBe(1);
      expect(response.body.treatments[0].treatment_id).toBe(1);
      expect(response.body.treatments[0].quantity).toBe(1);
      expect(response.body.treatments[0].unit_price).toBe(2500.00);
      expect(response.body.treatments[0].total_price).toBe(2500.00);

      global.trackTestData('treatments', response.body.treatments[0].id);
    });

    test('should record multiple treatments', async () => {
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1, // General Consultation
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Patient presented with mild symptoms"
          },
          {
            treatmentId: 3, // Blood Test
            quantity: 1,
            unitPrice: 3500.00,
            consultationNotes: "Full blood panel ordered"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments).toBeDefined();
      expect(response.body.treatments.length).toBe(2);
      expect(response.body.treatments[0].total_price).toBe(2500.00);
      expect(response.body.treatments[1].total_price).toBe(3500.00);

      // Track for cleanup
      response.body.treatments.forEach(treatment => {
        global.trackTestData('treatments', treatment.id);
      });
    });

    test('should record treatment with exact test data', async () => {
      const exactTreatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1, // General Consultation
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Patient presented with mild symptoms"
          },
          {
            treatmentId: 3, // Blood Test
            quantity: 1,
            unitPrice: 3500.00,
            consultationNotes: "Full blood panel ordered"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(exactTreatmentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments.length).toBe(2);
      expect(response.body.treatments[0].consultation_notes).toBe("Patient presented with mild symptoms");
      expect(response.body.treatments[1].consultation_notes).toBe("Full blood panel ordered");

      // Track for cleanup
      response.body.treatments.forEach(treatment => {
        global.trackTestData('treatments', treatment.id);
      });
    });

    test('should record treatment with custom quantity and price', async () => {
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1, // General Consultation
            quantity: 2,
            unitPrice: 2500.00,
            consultationNotes: "Extended consultation"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments[0].quantity).toBe(2);
      expect(response.body.treatments[0].unit_price).toBe(2500.00);
      expect(response.body.treatments[0].total_price).toBe(5000.00);

      global.trackTestData('treatments', response.body.treatments[0].id);
    });
  });

  describe('Treatment Retrieval and Management', () => {
    let testTreatmentId;

    beforeEach(async () => {
      // Create a test treatment
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Test treatment"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      testTreatmentId = response.body.treatments[0].id;
      global.trackTestData('treatments', testTreatmentId);
    });

    test('should get treatment by ID', async () => {
      const response = await doctorAgent
        .get(`/api/treatments/${testTreatmentId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatment.id).toBe(testTreatmentId);
      expect(response.body.treatment.appointment_id).toBe(testAppointmentId);
    });

    test('should get treatments by appointment ID', async () => {
      const response = await doctorAgent
        .get(`/api/treatments/appointment/${testAppointmentId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments).toBeDefined();
      expect(Array.isArray(response.body.treatments)).toBe(true);
      expect(response.body.treatments.length).toBeGreaterThan(0);
    });

    test('should update treatment consultation notes', async () => {
      const updateData = {
        consultationNotes: "Updated consultation notes"
      };

      const response = await doctorAgent
        .put(`/api/treatments/${testTreatmentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatment.consultation_notes).toBe("Updated consultation notes");
    });

    test('should get all treatments', async () => {
      const response = await doctorAgent
        .get('/api/treatments')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments).toBeDefined();
      expect(Array.isArray(response.body.treatments)).toBe(true);
    });
  });

  describe('Treatment Catalog', () => {
    
    test('should get all treatments catalog', async () => {
      const response = await doctorAgent
        .get('/api/treatments/catalog')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments).toBeDefined();
      expect(Array.isArray(response.body.treatments)).toBe(true);
      expect(response.body.treatments.length).toBeGreaterThan(0);
    });

    test('should get treatments by category', async () => {
      const response = await doctorAgent
        .get('/api/treatments/catalog?category=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments).toBeDefined();
      expect(Array.isArray(response.body.treatments)).toBe(true);
    });

    test('should search treatments by name', async () => {
      const response = await doctorAgent
        .get('/api/treatments/catalog?search=consultation')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatments).toBeDefined();
      expect(Array.isArray(response.body.treatments)).toBe(true);
    });
  });

  describe('Validation Tests', () => {
    
    test('should reject treatment recording on cancelled appointment', async () => {
      // First, cancel the appointment
      await receptionistAgent
        .put(`/api/appointments/${testAppointmentId}`)
        .send({
          status: 'Cancelled',
          cancellationReason: 'Test cancellation'
        })
        .expect(200);

      // Try to record treatment on cancelled appointment
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Should not work"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('cancelled');
    });

    test('should reject treatment recording on completed appointment', async () => {
      // First, complete the appointment
      await receptionistAgent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      // Try to record treatment on completed appointment
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Should not work"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('completed');
    });

    test('should reject treatment recording with invalid treatment ID', async () => {
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 99999, // Non-existent treatment
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Should not work"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject treatment recording with negative quantity', async () => {
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: -1, // Invalid quantity
            unitPrice: 2500.00,
            consultationNotes: "Should not work"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject treatment recording with negative price', async () => {
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: -100.00, // Invalid price
            consultationNotes: "Should not work"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject treatment recording with zero quantity', async () => {
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 0, // Invalid quantity
            unitPrice: 2500.00,
            consultationNotes: "Should not work"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Access Control', () => {
    
    test('should allow doctor to access all treatment operations', async () => {
      await doctorAgent.get('/api/treatments/catalog').expect(200);
      await doctorAgent.get('/api/treatments').expect(200);
      await doctorAgent.post('/api/treatments').expect(400); // Validation error expected
    });

    test('should allow nurse to view treatments but not record', async () => {
      const nurseAgent = await authHelper.getAuthenticatedAgent('nurse');
      
      await nurseAgent.get('/api/treatments/catalog').expect(200);
      await nurseAgent.get('/api/treatments').expect(200);
      
      // Should not be able to record treatments
      await nurseAgent.post('/api/treatments').expect(403);
    });

    test('should allow receptionist to view treatments but not record', async () => {
      await receptionistAgent.get('/api/treatments/catalog').expect(200);
      await receptionistAgent.get('/api/treatments').expect(200);
      
      // Should not be able to record treatments
      await receptionistAgent.post('/api/treatments').expect(403);
    });

    test('should deny access to unauthenticated users', async () => {
      const unauthenticatedAgent = request(app);
      
      await unauthenticatedAgent.get('/api/treatments/catalog').expect(401);
      await unauthenticatedAgent.get('/api/treatments').expect(401);
      await unauthenticatedAgent.post('/api/treatments').expect(401);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle treatment not found', async () => {
      const response = await doctorAgent
        .get('/api/treatments/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle invalid treatment ID format', async () => {
      const response = await doctorAgent
        .get('/api/treatments/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed request data', async () => {
      const response = await doctorAgent
        .post('/api/treatments')
        .send('invalid json')
        .expect(400);
    });

    test('should handle missing appointment ID', async () => {
      const treatmentData = {
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Missing appointment ID"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Treatment Lock After Invoice', () => {
    let testTreatmentId;

    beforeEach(async () => {
      // Create a test treatment
      const treatmentData = {
        appointmentId: testAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Test treatment for invoice"
          }
        ]
      };
      
      const response = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      testTreatmentId = response.body.treatments[0].id;
      global.trackTestData('treatments', testTreatmentId);
    });

    test('should lock treatments after invoice generation', async () => {
      // Complete appointment to trigger invoice generation
      await receptionistAgent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      // Try to update treatment details (should fail)
      const updateData = {
        quantity: 2,
        unitPrice: 3000.00
      };

      const response = await doctorAgent
        .put(`/api/treatments/${testTreatmentId}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('invoice');
    });

    test('should allow updating consultation notes after invoice', async () => {
      // Complete appointment to trigger invoice generation
      await receptionistAgent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      // Try to update consultation notes (should work)
      const updateData = {
        consultationNotes: "Updated notes after invoice"
      };

      const response = await doctorAgent
        .put(`/api/treatments/${testTreatmentId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.treatment.consultation_notes).toBe("Updated notes after invoice");
    });
  });
});

const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Patient Management Integration Tests', () => {
  let agent;
  let seedData;

  beforeAll(async () => {
    // Get seed data for testing
    seedData = await dbHelper.getSeedData();
  });

  beforeEach(async () => {
    // Login as receptionist for patient operations
    const { agent: authenticatedAgent } = await authHelper.loginAs('receptionist');
    agent = authenticatedAgent;
  });

  describe('Patient Registration', () => {
    
    test('should register patient without insurance', async () => {
      const patientData = dataHelper.generatePatientData();
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: false
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.patient.id).toBeDefined();
      expect(response.body.patient.first_name).toBe(patientData.firstName);
      expect(response.body.patient.last_name).toBe(patientData.lastName);
      expect(response.body.patient.phone).toBe(patientData.phone);
      expect(response.body.patient.email).toBe(patientData.email);
      expect(response.body.patient.insurance).toBeUndefined();

      // Track for cleanup
      global.trackTestData('patients', response.body.patient.id);
      global.trackTestData('addresses', response.body.patient.address_id);
    });

    test('should register patient with insurance', async () => {
      const patientData = dataHelper.generatePatientWithInsuranceData();
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: true
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.patient.id).toBeDefined();
      expect(response.body.patient.first_name).toBe(patientData.firstName);
      expect(response.body.patient.last_name).toBe(patientData.lastName);
      expect(response.body.patient.insurance).toBeDefined();
      expect(response.body.patient.insurance.policy_number).toBe(patientData.insurance.policyNumber);

      // Track for cleanup
      global.trackTestData('patients', response.body.patient.id);
      global.trackTestData('addresses', response.body.patient.address_id);
      global.trackTestData('insurance', response.body.patient.insurance.id);
    });

    test('should register patient with exact test data', async () => {
      const exactPatientData = {
        firstName: "Integration",
        lastName: "TestPatient",
        dateOfBirth: "1988-06-15",
        gender: "Male",
        phone: "+94771234567",
        email: "test.patient@integration.test",
        address: {
          line1: "123 Integration Test Street",
          line2: "Apartment 4B",
          city: "Colombo",
          state: "Western Province",
          postalCode: "00700"
        },
        emergencyContact: {
          name: "Emergency Contact Person",
          phone: "+94779876543",
          relation: "Spouse"
        },
        insurance: {
          providerId: 1, // Lanka Health Insurance
          policyNumber: "TEST-INT-2025-001",
          coveragePercentage: 80,
          deductible: 5000,
          maxClaim: 500000,
          expirationDate: "2026-12-31"
        },
        hasInsurance: true
      };
      
      const response = await agent
        .post('/api/patients')
        .send(exactPatientData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.patient.first_name).toBe("Integration");
      expect(response.body.patient.last_name).toBe("TestPatient");
      expect(response.body.patient.phone).toBe("+94771234567");
      expect(response.body.patient.email).toBe("test.patient@integration.test");
      expect(response.body.patient.insurance.policy_number).toBe("TEST-INT-2025-001");

      // Track for cleanup
      global.trackTestData('patients', response.body.patient.id);
      global.trackTestData('addresses', response.body.patient.address_id);
      global.trackTestData('insurance', response.body.patient.insurance.id);
    });
  });

  describe('Patient Search and Retrieval', () => {
    let testPatientId;

    beforeEach(async () => {
      // Create a test patient for search tests
      const patientData = dataHelper.generatePatientData({
        firstName: "SearchTest",
        lastName: "Patient",
        phone: "+94771234599"
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

    test('should search patients by name', async () => {
      const response = await agent
        .get('/api/patients/search?query=SearchTest')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patients).toBeDefined();
      expect(response.body.patients.length).toBeGreaterThan(0);
      expect(response.body.patients[0].first_name).toContain('SearchTest');
    });

    test('should search patients by phone', async () => {
      const response = await agent
        .get('/api/patients/search?query=94771234599')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patients).toBeDefined();
      expect(response.body.patients.length).toBeGreaterThan(0);
      expect(response.body.patients[0].phone).toContain('94771234599');
    });

    test('should get patient by ID', async () => {
      const response = await agent
        .get(`/api/patients/${testPatientId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patient.id).toBe(testPatientId);
      expect(response.body.patient.first_name).toBe('SearchTest');
    });

    test('should get all patients', async () => {
      const response = await agent
        .get('/api/patients')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patients).toBeDefined();
      expect(Array.isArray(response.body.patients)).toBe(true);
    });

    test('should return empty search results for non-existent patient', async () => {
      const response = await agent
        .get('/api/patients/search?query=NonexistentPatient123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patients).toBeDefined();
      expect(response.body.patients.length).toBe(0);
    });
  });

  describe('Patient Information Updates', () => {
    let testPatientId;

    beforeEach(async () => {
      // Create a test patient for update tests
      const patientData = dataHelper.generatePatientData({
        firstName: "UpdateTest",
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

    test('should update patient basic information', async () => {
      const updateData = {
        firstName: "UpdatedFirstName",
        lastName: "UpdatedLastName",
        phone: "+94779999999",
        email: "updated@test.com"
      };

      const response = await agent
        .put(`/api/patients/${testPatientId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patient.first_name).toBe("UpdatedFirstName");
      expect(response.body.patient.last_name).toBe("UpdatedLastName");
      expect(response.body.patient.phone).toBe("+94779999999");
      expect(response.body.patient.email).toBe("updated@test.com");
    });

    test('should add insurance to existing patient', async () => {
      const insuranceData = {
        providerId: 1,
        policyNumber: "ADD-INSURANCE-001",
        coveragePercentage: 75,
        deductible: 3000,
        maxClaim: 300000,
        expirationDate: "2025-12-31"
      };

      const response = await agent
        .post(`/api/patients/${testPatientId}/insurance`)
        .send(insuranceData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.insurance.policy_number).toBe("ADD-INSURANCE-001");
      expect(response.body.insurance.coverage_percentage).toBe(75);

      global.trackTestData('insurance', response.body.insurance.id);
    });

    test('should update patient emergency contact', async () => {
      const emergencyContactData = {
        name: "Updated Emergency Contact",
        phone: "+94778888888",
        relation: "Parent"
      };

      const response = await agent
        .put(`/api/patients/${testPatientId}/emergency-contact`)
        .send(emergencyContactData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.patient.Emergency_contact_name).toBe("Updated Emergency Contact");
      expect(response.body.patient.Emergency_contact_phone).toBe("+94778888888");
      expect(response.body.patient.Emergency_contact_relation).toBe("Parent");
    });
  });

  describe('Validation Tests', () => {
    
    test('should reject patient registration with missing required fields', async () => {
      const invalidData = dataHelper.generateInvalidPatientData();
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...invalidData,
          hasInsurance: false
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('should reject patient registration with invalid phone format', async () => {
      const patientData = dataHelper.generatePatientData({
        phone: "invalid-phone-format"
      });
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: false
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject patient registration with invalid date of birth', async () => {
      const patientData = dataHelper.generatePatientData({
        dateOfBirth: "invalid-date"
      });
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: false
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject patient registration with invalid email format', async () => {
      const patientData = dataHelper.generatePatientData({
        email: "invalid-email-format"
      });
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: false
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject patient registration with future date of birth', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      
      const patientData = dataHelper.generatePatientData({
        dateOfBirth: futureDate.toISOString().split('T')[0]
      });
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: false
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject patient registration with duplicate phone number', async () => {
      // First, create a patient
      const patientData1 = dataHelper.generatePatientData({
        phone: "+94771234555"
      });
      
      await agent
        .post('/api/patients')
        .send({
          ...patientData1,
          hasInsurance: false
        })
        .expect(201);

      // Try to create another patient with same phone
      const patientData2 = dataHelper.generatePatientData({
        phone: "+94771234555"
      });
      
      const response = await agent
        .post('/api/patients')
        .send({
          ...patientData2,
          hasInsurance: false
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Access Control', () => {
    
    test('should allow admin to access all patient operations', async () => {
      const adminAgent = await authHelper.getAuthenticatedAgent('admin');
      
      await adminAgent.get('/api/patients').expect(200);
      await adminAgent.post('/api/patients').expect(400); // Validation error expected
    });

    test('should allow doctor to access patient operations', async () => {
      const doctorAgent = await authHelper.getAuthenticatedAgent('doctor');
      
      await doctorAgent.get('/api/patients').expect(200);
      await doctorAgent.post('/api/patients').expect(400); // Validation error expected
    });

    test('should allow nurse to access patient operations', async () => {
      const nurseAgent = await authHelper.getAuthenticatedAgent('nurse');
      
      await nurseAgent.get('/api/patients').expect(200);
      await nurseAgent.post('/api/patients').expect(400); // Validation error expected
    });

    test('should deny access to unauthenticated users', async () => {
      const unauthenticatedAgent = request(app);
      
      await unauthenticatedAgent.get('/api/patients').expect(401);
      await unauthenticatedAgent.post('/api/patients').expect(401);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle patient not found', async () => {
      const response = await agent
        .get('/api/patients/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle invalid patient ID format', async () => {
      const response = await agent
        .get('/api/patients/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed request data', async () => {
      const response = await agent
        .post('/api/patients')
        .send('invalid json')
        .expect(400);
    });
  });
});

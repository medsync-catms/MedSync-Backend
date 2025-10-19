const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Insurance Claims Integration Tests', () => {
  let agent;
  let seedData;
  let testPatientId;
  let testAppointmentId;
  let testInvoiceId;
  let testInsuranceId;
  let testDoctorId;

  beforeAll(async () => {
    // Get seed data for testing
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id; // Dr. Silva
  });

  beforeEach(async () => {
    // Login as admin for insurance operations
    const { agent: authenticatedAgent } = await authHelper.loginAs('admin');
    agent = authenticatedAgent;

    // Create a test patient with insurance
    const patientData = dataHelper.generatePatientWithInsuranceData({
      firstName: "InsuranceTest",
      lastName: "Patient"
    });
    
    const patientResponse = await agent
      .post('/api/patients')
      .send({
        ...patientData,
        hasInsurance: true
      })
      .expect(201);

    testPatientId = patientResponse.body.patient.id;
    testInsuranceId = patientResponse.body.patient.insurance.id;
    global.trackTestData('patients', testPatientId);
    global.trackTestData('addresses', patientResponse.body.patient.address_id);
    global.trackTestData('insurance', testInsuranceId);

    // Create a test appointment
    const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
      doctorId: testDoctorId,
      status: 'In Progress'
    });
    
    const appointmentResponse = await agent
      .post('/api/appointments')
      .send(appointmentData)
      .expect(201);

    testAppointmentId = appointmentResponse.body.appointment.id;
    global.trackTestData('appointments', testAppointmentId);

    // Create test treatments
    const treatmentData = {
      appointmentId: testAppointmentId,
      treatments: [
        {
          treatmentId: 1, // General Consultation
          quantity: 1,
          unitPrice: 2500.00,
          consultationNotes: "Patient consultation"
        },
        {
          treatmentId: 3, // Blood Test
          quantity: 1,
          unitPrice: 3500.00,
          consultationNotes: "Blood test ordered"
        }
      ]
    };
    
    const treatmentResponse = await agent
      .post('/api/treatments')
      .send(treatmentData)
      .expect(201);

    global.trackTestData('treatments', treatmentResponse.body.treatments[0].id);
    global.trackTestData('treatments', treatmentResponse.body.treatments[1].id);

    // Complete appointment to generate invoice
    const invoiceResponse = await agent
      .put(`/api/appointments/${testAppointmentId}/complete`)
      .expect(200);

    testInvoiceId = invoiceResponse.body.invoice.id;
    global.trackTestData('invoices', testInvoiceId);
  });

  describe('Insurance Claim Submission', () => {
    
    test('should submit insurance claim', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-TEST-001',
        claimAmount: 4800.00, // 80% of 6000
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.id).toBeDefined();
      expect(response.body.claim.invoice_id).toBe(testInvoiceId);
      expect(response.body.claim.patient_insurance_id).toBe(testInsuranceId);
      expect(response.body.claim.claim_number).toBe('CLM-TEST-001');
      expect(response.body.claim.claim_amount).toBe(4800.00);
      expect(response.body.claim.status).toBe('Submitted');

      global.trackTestData('claims', response.body.claim.id);
    });

    test('should submit claim with exact test data', async () => {
      const exactClaimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-INT-2025-001',
        claimAmount: 4800.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(exactClaimData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.claim_number).toBe('CLM-INT-2025-001');
      expect(response.body.claim.claim_amount).toBe(4800.00);
      expect(response.body.claim.status).toBe('Submitted');

      global.trackTestData('claims', response.body.claim.id);
    });

    test('should auto-generate unique claim number', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimAmount: 4800.00,
        status: 'Submitted'
        // No claim_number provided - should be auto-generated
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.claim_number).toBeDefined();
      expect(response.body.claim.claim_number).toMatch(/^CLM-\d{8}-\d{4}$/);

      global.trackTestData('claims', response.body.claim.id);
    });
  });

  describe('Insurance Claim Processing', () => {
    let testClaimId;

    beforeEach(async () => {
      // Create a test claim
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-PROCESS-001',
        claimAmount: 4800.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      testClaimId = response.body.claim.id;
      global.trackTestData('claims', testClaimId);
    });

    test('should approve insurance claim', async () => {
      const approveData = {
        status: 'Approved',
        approvedAmount: 4800.00,
        rejectionReason: null
      };

      const response = await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send(approveData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.status).toBe('Approved');
      expect(response.body.claim.approved_amount).toBe(4800.00);
      expect(response.body.claim.rejection_reason).toBeNull();
    });

    test('should reject insurance claim with reason', async () => {
      const rejectData = {
        status: 'Rejected',
        approvedAmount: 0.00,
        rejectionReason: 'Treatment not covered under policy'
      };

      const response = await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send(rejectData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.status).toBe('Rejected');
      expect(response.body.claim.approved_amount).toBe(0.00);
      expect(response.body.claim.rejection_reason).toBe('Treatment not covered under policy');
    });

    test('should process claim payment', async () => {
      // First approve the claim
      await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Approved',
          approvedAmount: 4800.00
        })
        .expect(200);

      // Then process payment
      const paymentData = {
        status: 'Paid',
        approvedAmount: 4800.00
      };

      const response = await agent
        .put(`/api/insurance/claims/${testClaimId}/payment`)
        .send(paymentData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.status).toBe('Paid');
    });

    test('should get claim by ID', async () => {
      const response = await agent
        .get(`/api/insurance/claims/${testClaimId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.id).toBe(testClaimId);
      expect(response.body.claim.invoice_id).toBe(testInvoiceId);
      expect(response.body.claim.patient_insurance_id).toBe(testInsuranceId);
    });

    test('should get all claims', async () => {
      const response = await agent
        .get('/api/insurance/claims')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claims).toBeDefined();
      expect(Array.isArray(response.body.claims)).toBe(true);
      expect(response.body.claims.length).toBeGreaterThan(0);
    });

    test('should get claims by status', async () => {
      const response = await agent
        .get('/api/insurance/claims?status=Submitted')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claims).toBeDefined();
      expect(Array.isArray(response.body.claims)).toBe(true);
      
      // All returned claims should have Submitted status
      response.body.claims.forEach(claim => {
        expect(claim.status).toBe('Submitted');
      });
    });

    test('should get claims by patient ID', async () => {
      const response = await agent
        .get(`/api/insurance/claims/patient/${testPatientId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claims).toBeDefined();
      expect(Array.isArray(response.body.claims)).toBe(true);
    });
  });

  describe('Insurance Claim Validation', () => {
    
    test('should reject claim with amount exceeding invoice total', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-EXCEED-001',
        claimAmount: 7000.00, // Exceeds invoice total of 6000
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('exceed');
    });

    test('should reject claim with amount exceeding policy max', async () => {
      // Create a claim that exceeds policy maximum
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-POLICY-MAX-001',
        claimAmount: 600000.00, // Exceeds policy max of 500000
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('maximum');
    });

    test('should reject claim with expired insurance policy', async () => {
      // Create patient with expired insurance
      const expiredPatientData = dataHelper.generatePatientData({
        firstName: "ExpiredInsurance",
        lastName: "Patient"
      });
      
      const patientResponse = await agent
        .post('/api/patients')
        .send({
          ...expiredPatientData,
          hasInsurance: true,
          insurance: dataHelper.generateExpiredInsuranceData(0) // Will be set after patient creation
        })
        .expect(201);

      const expiredPatientId = patientResponse.body.patient.id;
      const expiredInsuranceId = patientResponse.body.patient.insurance.id;
      global.trackTestData('patients', expiredPatientId);
      global.trackTestData('addresses', patientResponse.body.patient.address_id);
      global.trackTestData('insurance', expiredInsuranceId);

      // Create appointment and invoice for expired insurance patient
      const appointmentData = dataHelper.generateAppointmentData(expiredPatientId, {
        doctorId: testDoctorId,
        status: 'In Progress'
      });
      
      const appointmentResponse = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      const expiredAppointmentId = appointmentResponse.body.appointment.id;
      global.trackTestData('appointments', expiredAppointmentId);

      // Add treatment and complete appointment
      const treatmentData = {
        appointmentId: expiredAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Test treatment"
          }
        ]
      };
      
      await agent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      const invoiceResponse = await agent
        .put(`/api/appointments/${expiredAppointmentId}/complete`)
        .expect(200);

      const expiredInvoiceId = invoiceResponse.body.invoice.id;
      global.trackTestData('invoices', expiredInvoiceId);

      // Try to submit claim with expired insurance
      const claimData = {
        invoiceId: expiredInvoiceId,
        patientInsuranceId: expiredInsuranceId,
        claimNumber: 'CLM-EXPIRED-001',
        claimAmount: 2000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expired');
    });

    test('should reject duplicate claim number', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-DUPLICATE-001',
        claimAmount: 4800.00,
        status: 'Submitted'
      };
      
      // Submit first claim
      await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      // Try to submit claim with same number
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('duplicate');
    });
  });

  describe('Insurance Provider Management', () => {
    
    test('should get all insurance providers', async () => {
      const response = await agent
        .get('/api/insurance/providers')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.providers).toBeDefined();
      expect(Array.isArray(response.body.providers)).toBe(true);
      expect(response.body.providers.length).toBeGreaterThan(0);
    });

    test('should get insurance provider by ID', async () => {
      const response = await agent
        .get('/api/insurance/providers/1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.provider.id).toBe(1);
      expect(response.body.provider.name).toBeDefined();
    });

    test('should add new insurance provider', async () => {
      const providerData = {
        name: 'Test Insurance Company',
        contactInfo: {
          phone: '+94112225555',
          email: 'test@insurance.lk'
        },
        processingRequirements: 'Standard processing requirements',
        isActive: true
      };
      
      const response = await agent
        .post('/api/insurance/providers')
        .send(providerData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.provider.id).toBeDefined();
      expect(response.body.provider.name).toBe('Test Insurance Company');
      expect(response.body.provider.is_active).toBe(true);

      global.trackTestData('providers', response.body.provider.id);
    });
  });

  describe('Access Control', () => {
    
    test('should allow admin to access all insurance operations', async () => {
      await agent.get('/api/insurance/claims').expect(200);
      await agent.get('/api/insurance/providers').expect(200);
      await agent.post('/api/insurance/claims').expect(400); // Validation error expected
    });

    test('should allow manager to access insurance operations', async () => {
      const managerAgent = await authHelper.getAuthenticatedAgent('manager');
      
      await managerAgent.get('/api/insurance/claims').expect(200);
      await managerAgent.get('/api/insurance/providers').expect(200);
      await managerAgent.post('/api/insurance/claims').expect(400); // Validation error expected
    });

    test('should allow doctor to submit claims but not approve', async () => {
      const doctorAgent = await authHelper.getAuthenticatedAgent('doctor');
      
      await doctorAgent.get('/api/insurance/claims').expect(200);
      await doctorAgent.post('/api/insurance/claims').expect(400); // Validation error expected
      
      // Should not be able to approve claims
      await doctorAgent.put('/api/insurance/claims/1').expect(403);
    });

    test('should deny nurse access to insurance operations', async () => {
      const nurseAgent = await authHelper.getAuthenticatedAgent('nurse');
      
      await nurseAgent.get('/api/insurance/claims').expect(403);
      await nurseAgent.post('/api/insurance/claims').expect(403);
    });

    test('should deny receptionist access to insurance operations', async () => {
      const receptionistAgent = await authHelper.getAuthenticatedAgent('receptionist');
      
      await receptionistAgent.get('/api/insurance/claims').expect(403);
      await receptionistAgent.post('/api/insurance/claims').expect(403);
    });

    test('should deny access to unauthenticated users', async () => {
      const unauthenticatedAgent = request(app);
      
      await unauthenticatedAgent.get('/api/insurance/claims').expect(401);
      await unauthenticatedAgent.post('/api/insurance/claims').expect(401);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle claim not found', async () => {
      const response = await agent
        .get('/api/insurance/claims/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle invalid claim ID format', async () => {
      const response = await agent
        .get('/api/insurance/claims/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed request data', async () => {
      const response = await agent
        .post('/api/insurance/claims')
        .send('invalid json')
        .expect(400);
    });

    test('should handle claim on non-existent invoice', async () => {
      const claimData = {
        invoiceId: 99999, // Non-existent invoice
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-NON-EXISTENT-001',
        claimAmount: 1000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});

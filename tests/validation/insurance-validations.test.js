const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Insurance Validation Tests', () => {
  let agent;
  let seedData;
  let testPatientId;
  let testInvoiceId;
  let testInsuranceId;
  let testDoctorId;

  beforeAll(async () => {
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id;
  });

  beforeEach(async () => {
    const { agent: authenticatedAgent } = await authHelper.loginAs('admin');
    agent = authenticatedAgent;

    // Create test patient with insurance
    const patientData = dataHelper.generatePatientWithInsuranceData({
      firstName: "InsuranceValidation",
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

    // Create appointment and invoice
    const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
      doctorId: testDoctorId,
      status: 'In Progress'
    });
    
    const appointmentResponse = await agent
      .post('/api/appointments')
      .send(appointmentData)
      .expect(201);

    const appointmentId = appointmentResponse.body.appointment.id;
    global.trackTestData('appointments', appointmentId);

    const treatmentData = {
      appointmentId: appointmentId,
      treatments: [
        {
          treatmentId: 1,
          quantity: 1,
          unitPrice: 5000.00,
          consultationNotes: "Insurance validation test"
        }
      ]
    };
    
    await agent
      .post('/api/treatments')
      .send(treatmentData)
      .expect(201);

    const invoiceResponse = await agent
      .put(`/api/appointments/${appointmentId}/complete`)
      .expect(200);

    testInvoiceId = invoiceResponse.body.invoice.id;
    global.trackTestData('invoices', testInvoiceId);
  });

  describe('Claim Amount Validation', () => {
    
    test('should reject claim amount exceeding invoice total', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-EXCEED-001',
        claimAmount: 6000.00, // Exceeds invoice total of 5000
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('exceed');
    });

    test('should reject claim amount exceeding policy maximum', async () => {
      // Create claim that exceeds policy maximum
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

    test('should accept valid claim amount within limits', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-VALID-001',
        claimAmount: 4000.00, // 80% of 5000, within policy limits
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.claim_amount).toBe(4000.00);
    });

    test('should reject negative claim amounts', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-NEGATIVE-001',
        claimAmount: -1000.00, // Negative amount
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject zero claim amounts', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-ZERO-001',
        claimAmount: 0.00, // Zero amount
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Insurance Policy Expiration Validation', () => {
    
    test('should reject claims with expired insurance policies', async () => {
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

      const appointmentId = appointmentResponse.body.appointment.id;
      global.trackTestData('appointments', appointmentId);

      const treatmentData = {
        appointmentId: appointmentId,
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
        .put(`/api/appointments/${appointmentId}/complete`)
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

    test('should accept claims with valid insurance policies', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-VALID-POLICY-001',
        claimAmount: 4000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Claim Number Validation', () => {
    
    test('should reject duplicate claim numbers', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-DUPLICATE-001',
        claimAmount: 4000.00,
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

    test('should accept unique claim numbers', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-UNIQUE-001',
        claimAmount: 4000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.claim_number).toBe('CLM-UNIQUE-001');
    });

    test('should auto-generate unique claim numbers when not provided', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimAmount: 4000.00,
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
    });
  });

  describe('Claim Status Validation', () => {
    let testClaimId;

    beforeEach(async () => {
      // Create a test claim
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-STATUS-TEST-001',
        claimAmount: 4000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      testClaimId = response.body.claim.id;
      global.trackTestData('claims', testClaimId);
    });

    test('should accept valid status transitions', async () => {
      // Submitted -> Under Review
      await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Under Review',
          approvedAmount: 0.00
        })
        .expect(200);

      // Under Review -> Approved
      await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Approved',
          approvedAmount: 4000.00
        })
        .expect(200);

      // Approved -> Paid
      await agent
        .put(`/api/insurance/claims/${testClaimId}/payment`)
        .send({
          status: 'Paid',
          approvedAmount: 4000.00
        })
        .expect(200);
    });

    test('should reject invalid status transitions', async () => {
      // Try to go directly from Submitted to Paid
      await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Paid',
          approvedAmount: 4000.00
        })
        .expect(400);

      // Try to go from Submitted to Cancelled
      await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Cancelled',
          approvedAmount: 0.00
        })
        .expect(400);
    });

    test('should reject invalid status values', async () => {
      await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'InvalidStatus',
          approvedAmount: 4000.00
        })
        .expect(400);
    });
  });

  describe('Approval Amount Validation', () => {
    let testClaimId;

    beforeEach(async () => {
      // Create a test claim
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-APPROVAL-TEST-001',
        claimAmount: 4000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      testClaimId = response.body.claim.id;
      global.trackTestData('claims', testClaimId);
    });

    test('should reject approval amount exceeding claim amount', async () => {
      await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Approved',
          approvedAmount: 5000.00 // Exceeds claim amount of 4000
        })
        .expect(400);
    });

    test('should accept approval amount within claim amount', async () => {
      const response = await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Approved',
          approvedAmount: 3200.00 // 80% of claim amount
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.approved_amount).toBe(3200.00);
    });

    test('should accept zero approval amount for rejected claims', async () => {
      const response = await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Rejected',
          approvedAmount: 0.00,
          rejectionReason: 'Treatment not covered'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.approved_amount).toBe(0.00);
    });
  });

  describe('Rejection Reason Validation', () => {
    let testClaimId;

    beforeEach(async () => {
      // Create a test claim
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-REJECTION-TEST-001',
        claimAmount: 4000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      testClaimId = response.body.claim.id;
      global.trackTestData('claims', testClaimId);
    });

    test('should require rejection reason for rejected claims', async () => {
      const response = await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Rejected',
          approvedAmount: 0.00,
          rejectionReason: 'Treatment not covered under policy'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.rejection_reason).toBe('Treatment not covered under policy');
    });

    test('should not require rejection reason for approved claims', async () => {
      const response = await agent
        .put(`/api/insurance/claims/${testClaimId}`)
        .send({
          status: 'Approved',
          approvedAmount: 4000.00
          // No rejection_reason needed for approved claims
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.claim.rejection_reason).toBeNull();
    });
  });

  describe('Invoice and Insurance Relationship Validation', () => {
    
    test('should reject claim for non-existent invoice', async () => {
      const claimData = {
        invoiceId: 99999, // Non-existent invoice
        patientInsuranceId: testInsuranceId,
        claimNumber: 'CLM-NON-EXISTENT-001',
        claimAmount: 4000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject claim for non-existent insurance policy', async () => {
      const claimData = {
        invoiceId: testInvoiceId,
        patientInsuranceId: 99999, // Non-existent insurance
        claimNumber: 'CLM-NON-EXISTENT-INS-001',
        claimAmount: 4000.00,
        status: 'Submitted'
      };
      
      const response = await agent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject claim for invoice without insurance', async () => {
      // Create patient without insurance
      const patientWithoutInsuranceData = dataHelper.generatePatientData({
        firstName: "NoInsurance",
        lastName: "Patient"
      });
      
      const patientResponse = await agent
        .post('/api/patients')
        .send({
          ...patientWithoutInsuranceData,
          hasInsurance: false
        })
        .expect(201);

      const patientWithoutInsuranceId = patientResponse.body.patient.id;
      global.trackTestData('patients', patientWithoutInsuranceId);
      global.trackTestData('addresses', patientResponse.body.patient.address_id);

      // Create appointment and invoice
      const appointmentData = dataHelper.generateAppointmentData(patientWithoutInsuranceId, {
        doctorId: testDoctorId,
        status: 'In Progress'
      });
      
      const appointmentResponse = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      const appointmentId = appointmentResponse.body.appointment.id;
      global.trackTestData('appointments', appointmentId);

      const treatmentData = {
        appointmentId: appointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "No insurance test"
          }
        ]
      };
      
      await agent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      const invoiceResponse = await agent
        .put(`/api/appointments/${appointmentId}/complete`)
        .expect(200);

      const invoiceWithoutInsuranceId = invoiceResponse.body.invoice.id;
      global.trackTestData('invoices', invoiceWithoutInsuranceId);

      // Try to submit claim for patient without insurance
      const claimData = {
        invoiceId: invoiceWithoutInsuranceId,
        patientInsuranceId: testInsuranceId, // Using different patient's insurance
        claimNumber: 'CLM-WRONG-PATIENT-001',
        claimAmount: 2000.00,
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

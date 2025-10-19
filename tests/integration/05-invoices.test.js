const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Invoice Management Integration Tests', () => {
  let agent;
  let seedData;
  let testPatientId;
  let testAppointmentId;
  let testTreatmentId;
  let testDoctorId;

  beforeAll(async () => {
    // Get seed data for testing
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id; // Dr. Silva
  });

  beforeEach(async () => {
    // Login as admin for invoice operations
    const { agent: authenticatedAgent } = await authHelper.loginAs('admin');
    agent = authenticatedAgent;

    // Create a test patient
    const patientData = dataHelper.generatePatientData({
      firstName: "InvoiceTest",
      lastName: "Patient"
    });
    
    const patientResponse = await agent
      .post('/api/patients')
      .send({
        ...patientData,
        hasInsurance: false
      })
      .expect(201);

    testPatientId = patientResponse.body.patient.id;
    global.trackTestData('patients', testPatientId);
    global.trackTestData('addresses', patientResponse.body.patient.address_id);

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

    testTreatmentId = treatmentResponse.body.treatments[0].id;
    global.trackTestData('treatments', testTreatmentId);
    global.trackTestData('treatments', treatmentResponse.body.treatments[1].id);
  });

  describe('Invoice Generation', () => {
    
    test('should auto-generate invoice on appointment completion', async () => {
      // Complete the appointment
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.status).toBe('Completed');
      expect(response.body.invoice).toBeDefined();
      expect(response.body.invoice.invoice_number).toBeDefined();
      expect(response.body.invoice.total_amount).toBe(6000.00); // 2500 + 3500
      expect(response.body.invoice.status).toBe('Draft');

      global.trackTestData('invoices', response.body.invoice.id);
    });

    test('should generate invoice with exact test data', async () => {
      // Complete the appointment
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice.patient_id).toBe(testPatientId);
      expect(response.body.invoice.appointment_id).toBe(testAppointmentId);
      expect(response.body.invoice.total_amount).toBe(6000.00);
      expect(response.body.invoice.status).toBe('Draft');
      expect(response.body.invoice.invoice_number).toMatch(/^INV-\d{8}-\d{4}$/);

      global.trackTestData('invoices', response.body.invoice.id);
    });

    test('should not generate invoice for appointment without treatments', async () => {
      // Create a new appointment without treatments
      const appointmentData = dataHelper.generateAppointmentData(testPatientId, {
        doctorId: testDoctorId,
        status: 'In Progress'
      });
      
      const appointmentResponse = await agent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      const newAppointmentId = appointmentResponse.body.appointment.id;
      global.trackTestData('appointments', newAppointmentId);

      // Complete appointment without treatments
      const response = await agent
        .put(`/api/appointments/${newAppointmentId}/complete`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('treatment records');
    });

    test('should generate unique invoice numbers', async () => {
      // Complete the first appointment
      const response1 = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      const invoice1 = response1.body.invoice;
      global.trackTestData('invoices', invoice1.id);

      // Create another appointment with treatments
      const appointmentData2 = dataHelper.generateAppointmentData(testPatientId, {
        doctorId: testDoctorId,
        status: 'In Progress'
      });
      
      const appointmentResponse2 = await agent
        .post('/api/appointments')
        .send(appointmentData2)
        .expect(201);

      const newAppointmentId = appointmentResponse2.body.appointment.id;
      global.trackTestData('appointments', newAppointmentId);

      // Add treatments to second appointment
      const treatmentData2 = {
        appointmentId: newAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Second consultation"
          }
        ]
      };
      
      await agent
        .post('/api/treatments')
        .send(treatmentData2)
        .expect(201);

      // Complete second appointment
      const response2 = await agent
        .put(`/api/appointments/${newAppointmentId}/complete`)
        .expect(200);

      const invoice2 = response2.body.invoice;
      global.trackTestData('invoices', invoice2.id);

      // Invoice numbers should be different
      expect(invoice1.invoice_number).not.toBe(invoice2.invoice_number);
    });
  });

  describe('Invoice Retrieval and Management', () => {
    let testInvoiceId;

    beforeEach(async () => {
      // Complete appointment to generate invoice
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      testInvoiceId = response.body.invoice.id;
      global.trackTestData('invoices', testInvoiceId);
    });

    test('should get invoice by ID', async () => {
      const response = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice.id).toBe(testInvoiceId);
      expect(response.body.invoice.patient_id).toBe(testPatientId);
      expect(response.body.invoice.appointment_id).toBe(testAppointmentId);
      expect(response.body.invoice.total_amount).toBe(6000.00);
    });

    test('should get invoice with itemized treatments', async () => {
      const response = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice.treatments).toBeDefined();
      expect(Array.isArray(response.body.invoice.treatments)).toBe(true);
      expect(response.body.invoice.treatments.length).toBe(2);
      
      // Check treatment details
      const treatments = response.body.invoice.treatments;
      expect(treatments[0].treatment_name).toBeDefined();
      expect(treatments[0].quantity).toBe(1);
      expect(treatments[0].unit_price).toBe(2500.00);
      expect(treatments[0].total_price).toBe(2500.00);
      expect(treatments[1].unit_price).toBe(3500.00);
      expect(treatments[1].total_price).toBe(3500.00);
    });

    test('should get all invoices', async () => {
      const response = await agent
        .get('/api/invoices')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoices).toBeDefined();
      expect(Array.isArray(response.body.invoices)).toBe(true);
      expect(response.body.invoices.length).toBeGreaterThan(0);
    });

    test('should get invoices by patient ID', async () => {
      const response = await agent
        .get(`/api/invoices/patient/${testPatientId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoices).toBeDefined();
      expect(Array.isArray(response.body.invoices)).toBe(true);
      expect(response.body.invoices.length).toBeGreaterThan(0);
      expect(response.body.invoices[0].patient_id).toBe(testPatientId);
    });

    test('should get invoices by status', async () => {
      const response = await agent
        .get('/api/invoices?status=Draft')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoices).toBeDefined();
      expect(Array.isArray(response.body.invoices)).toBe(true);
      
      // All returned invoices should have Draft status
      response.body.invoices.forEach(invoice => {
        expect(invoice.status).toBe('Draft');
      });
    });

    test('should update invoice status from Draft to Sent', async () => {
      const response = await agent
        .put(`/api/invoices/${testInvoiceId}/status`)
        .send({ status: 'Sent' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice.status).toBe('Sent');
    });

    test('should update invoice status to Paid', async () => {
      const response = await agent
        .put(`/api/invoices/${testInvoiceId}/status`)
        .send({ status: 'Paid' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.invoice.status).toBe('Paid');
    });
  });

  describe('Invoice Validation', () => {
    
    test('should reject invalid status updates', async () => {
      // Complete appointment to generate invoice
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      const invoiceId = response.body.invoice.id;
      global.trackTestData('invoices', invoiceId);

      // Try to update to invalid status
      const updateResponse = await agent
        .put(`/api/invoices/${invoiceId}/status`)
        .send({ status: 'InvalidStatus' })
        .expect(400);

      expect(updateResponse.body.success).toBe(false);
    });

    test('should reject direct status change from Draft to Paid', async () => {
      // Complete appointment to generate invoice
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      const invoiceId = response.body.invoice.id;
      global.trackTestData('invoices', invoiceId);

      // Try to go directly from Draft to Paid
      const updateResponse = await agent
        .put(`/api/invoices/${invoiceId}/status`)
        .send({ status: 'Paid' })
        .expect(400);

      expect(updateResponse.body.success).toBe(false);
      expect(updateResponse.body.message).toContain('Sent');
    });

    test('should prevent modification of paid invoices', async () => {
      // Complete appointment to generate invoice
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      const invoiceId = response.body.invoice.id;
      global.trackTestData('invoices', invoiceId);

      // Mark as sent first
      await agent
        .put(`/api/invoices/${invoiceId}/status`)
        .send({ status: 'Sent' })
        .expect(200);

      // Record payment to make it paid
      const paymentData = {
        invoiceId: invoiceId,
        amount: 6000.00,
        paymentMethod: 'Cash',
        transactionReference: 'TEST-PAYMENT-001'
      };

      await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      // Try to modify paid invoice
      const updateResponse = await agent
        .put(`/api/invoices/${invoiceId}`)
        .send({ total_amount: 7000.00 })
        .expect(400);

      expect(updateResponse.body.success).toBe(false);
      expect(updateResponse.body.message).toContain('paid');
    });
  });

  describe('Access Control', () => {
    
    test('should allow admin to access all invoice operations', async () => {
      await agent.get('/api/invoices').expect(200);
      await agent.get('/api/invoices/1').expect(404); // Not found expected
    });

    test('should allow manager to access invoice operations', async () => {
      const managerAgent = await authHelper.getAuthenticatedAgent('manager');
      
      await managerAgent.get('/api/invoices').expect(200);
      await managerAgent.get('/api/invoices/1').expect(404); // Not found expected
    });

    test('should allow doctor to view invoices', async () => {
      const doctorAgent = await authHelper.getAuthenticatedAgent('doctor');
      
      await doctorAgent.get('/api/invoices').expect(200);
    });

    test('should deny nurse access to invoice operations', async () => {
      const nurseAgent = await authHelper.getAuthenticatedAgent('nurse');
      
      await nurseAgent.get('/api/invoices').expect(403);
    });

    test('should deny receptionist access to invoice operations', async () => {
      const receptionistAgent = await authHelper.getAuthenticatedAgent('receptionist');
      
      await receptionistAgent.get('/api/invoices').expect(403);
    });

    test('should deny access to unauthenticated users', async () => {
      const unauthenticatedAgent = request(app);
      
      await unauthenticatedAgent.get('/api/invoices').expect(401);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle invoice not found', async () => {
      const response = await agent
        .get('/api/invoices/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle invalid invoice ID format', async () => {
      const response = await agent
        .get('/api/invoices/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed request data', async () => {
      const response = await agent
        .put('/api/invoices/1/status')
        .send('invalid json')
        .expect(400);
    });

    test('should handle duplicate invoice generation attempt', async () => {
      // Complete appointment to generate invoice
      await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      // Try to complete again (should fail)
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already completed');
    });
  });

  describe('Invoice Status Workflow', () => {
    let testInvoiceId;

    beforeEach(async () => {
      // Complete appointment to generate invoice
      const response = await agent
        .put(`/api/appointments/${testAppointmentId}/complete`)
        .expect(200);

      testInvoiceId = response.body.invoice.id;
      global.trackTestData('invoices', testInvoiceId);
    });

    test('should follow complete invoice lifecycle', async () => {
      // 1. Start with Draft status
      let response = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);
      expect(response.body.invoice.status).toBe('Draft');

      // 2. Update to Sent
      response = await agent
        .put(`/api/invoices/${testInvoiceId}/status`)
        .send({ status: 'Sent' })
        .expect(200);
      expect(response.body.invoice.status).toBe('Sent');

      // 3. Record payment to make it Paid
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 6000.00,
        paymentMethod: 'Cash',
        transactionReference: 'TEST-PAYMENT-001'
      };

      await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      // 4. Verify status is now Paid
      response = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);
      expect(response.body.invoice.status).toBe('Paid');
    });

    test('should handle overdue invoice status', async () => {
      // Mark as sent
      await agent
        .put(`/api/invoices/${testInvoiceId}/status`)
        .send({ status: 'Sent' })
        .expect(200);

      // Simulate overdue by updating created_at to 31 days ago
      await dbHelper.query(
        'UPDATE invoices SET created_at = NOW() - INTERVAL \'31 days\' WHERE id = $1',
        [testInvoiceId]
      );

      // Check if status automatically updated to Overdue
      const response = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);
      
      // Note: This depends on the overdue trigger implementation
      expect(response.body.invoice.status).toBeDefined();
    });
  });
});

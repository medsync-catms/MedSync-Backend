const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Payment Processing Integration Tests', () => {
  let agent;
  let seedData;
  let testPatientId;
  let testAppointmentId;
  let testInvoiceId;
  let testDoctorId;

  beforeAll(async () => {
    // Get seed data for testing
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id; // Dr. Silva
  });

  beforeEach(async () => {
    // Login as admin for payment operations
    const { agent: authenticatedAgent } = await authHelper.loginAs('admin');
    agent = authenticatedAgent;

    // Create a test patient
    const patientData = dataHelper.generatePatientData({
      firstName: "PaymentTest",
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

    global.trackTestData('treatments', treatmentResponse.body.treatments[0].id);
    global.trackTestData('treatments', treatmentResponse.body.treatments[1].id);

    // Complete appointment to generate invoice
    const invoiceResponse = await agent
      .put(`/api/appointments/${testAppointmentId}/complete`)
      .expect(200);

    testInvoiceId = invoiceResponse.body.invoice.id;
    global.trackTestData('invoices', testInvoiceId);
  });

  describe('Payment Recording', () => {
    
    test('should record full cash payment', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 6000.00,
        paymentMethod: 'Cash',
        transactionReference: 'CASH-001',
        notes: 'Full cash payment'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.payment.id).toBeDefined();
      expect(response.body.payment.invoice_id).toBe(testInvoiceId);
      expect(response.body.payment.amount).toBe(6000.00);
      expect(response.body.payment.payment_method).toBe('Cash');
      expect(response.body.payment.transaction_reference).toBe('CASH-001');
      expect(response.body.payment.notes).toBe('Full cash payment');

      global.trackTestData('payments', response.body.payment.id);
    });

    test('should record payment with exact test data', async () => {
      const exactPaymentData = {
        invoiceId: testInvoiceId,
        amount: 6000.00,
        paymentMethod: 'Cash',
        transactionReference: 'TEST-TXN-001',
        notes: 'Integration test payment'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(exactPaymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.payment.amount).toBe(6000.00);
      expect(response.body.payment.payment_method).toBe('Cash');
      expect(response.body.payment.transaction_reference).toBe('TEST-TXN-001');
      expect(response.body.payment.notes).toBe('Integration test payment');

      global.trackTestData('payments', response.body.payment.id);
    });

    test('should record partial payment', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 3000.00, // Partial payment
        paymentMethod: 'Credit Card',
        transactionReference: 'CC-123456789',
        notes: 'Partial payment via credit card'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.payment.amount).toBe(3000.00);
      expect(response.body.payment.payment_method).toBe('Credit Card');
      expect(response.body.payment.transaction_reference).toBe('CC-123456789');

      global.trackTestData('payments', response.body.payment.id);
    });

    test('should record payment with all payment methods', async () => {
      const paymentMethods = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Cheque'];
      
      for (let i = 0; i < paymentMethods.length; i++) {
        const paymentData = {
          invoiceId: testInvoiceId,
          amount: 1000.00,
          paymentMethod: paymentMethods[i],
          transactionReference: `REF-${i + 1}`,
          notes: `Payment via ${paymentMethods[i]}`
        };
        
        const response = await agent
          .post('/api/payments')
          .send(paymentData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.payment.payment_method).toBe(paymentMethods[i]);

        global.trackTestData('payments', response.body.payment.id);
      }
    });
  });

  describe('Multiple Payment Processing', () => {
    
    test('should handle multiple partial payments', async () => {
      // First payment: 2000
      const payment1Data = {
        invoiceId: testInvoiceId,
        amount: 2000.00,
        paymentMethod: 'Cash',
        transactionReference: 'PAY-001',
        notes: 'First partial payment'
      };
      
      const response1 = await agent
        .post('/api/payments')
        .send(payment1Data)
        .expect(201);

      expect(response1.body.success).toBe(true);
      expect(response1.body.payment.amount).toBe(2000.00);
      global.trackTestData('payments', response1.body.payment.id);

      // Second payment: 2500
      const payment2Data = {
        invoiceId: testInvoiceId,
        amount: 2500.00,
        paymentMethod: 'Credit Card',
        transactionReference: 'PAY-002',
        notes: 'Second partial payment'
      };
      
      const response2 = await agent
        .post('/api/payments')
        .send(payment2Data)
        .expect(201);

      expect(response2.body.success).toBe(true);
      expect(response2.body.payment.amount).toBe(2500.00);
      global.trackTestData('payments', response2.body.payment.id);

      // Third payment: 1500 (final payment)
      const payment3Data = {
        invoiceId: testInvoiceId,
        amount: 1500.00,
        paymentMethod: 'Bank Transfer',
        transactionReference: 'PAY-003',
        notes: 'Final payment'
      };
      
      const response3 = await agent
        .post('/api/payments')
        .send(payment3Data)
        .expect(201);

      expect(response3.body.success).toBe(true);
      expect(response3.body.payment.amount).toBe(1500.00);
      global.trackTestData('payments', response3.body.payment.id);

      // Verify total payments = invoice total
      const invoiceResponse = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);

      expect(invoiceResponse.body.invoice.status).toBe('Paid');
    });

    test('should track payment history correctly', async () => {
      // Record multiple payments
      const payments = [
        { amount: 2000.00, method: 'Cash', ref: 'PAY-001' },
        { amount: 2500.00, method: 'Credit Card', ref: 'PAY-002' },
        { amount: 1500.00, method: 'Bank Transfer', ref: 'PAY-003' }
      ];

      for (const payment of payments) {
        const paymentData = {
          invoiceId: testInvoiceId,
          amount: payment.amount,
          paymentMethod: payment.method,
          transactionReference: payment.ref,
          notes: `Payment via ${payment.method}`
        };
        
        const response = await agent
          .post('/api/payments')
          .send(paymentData)
          .expect(201);

        global.trackTestData('payments', response.body.payment.id);
      }

      // Get payment history
      const historyResponse = await agent
        .get(`/api/payments/invoice/${testInvoiceId}`)
        .expect(200);

      expect(historyResponse.body.success).toBe(true);
      expect(historyResponse.body.payments).toBeDefined();
      expect(Array.isArray(historyResponse.body.payments)).toBe(true);
      expect(historyResponse.body.payments.length).toBe(3);

      // Verify payment details
      const totalPaid = historyResponse.body.payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
      expect(totalPaid).toBe(6000.00);
    });
  });

  describe('Payment Retrieval', () => {
    let testPaymentId;

    beforeEach(async () => {
      // Create a test payment
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 6000.00,
        paymentMethod: 'Cash',
        transactionReference: 'TEST-PAYMENT-001',
        notes: 'Test payment'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      testPaymentId = response.body.payment.id;
      global.trackTestData('payments', testPaymentId);
    });

    test('should get payment by ID', async () => {
      const response = await agent
        .get(`/api/payments/${testPaymentId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payment.id).toBe(testPaymentId);
      expect(response.body.payment.invoice_id).toBe(testInvoiceId);
      expect(response.body.payment.amount).toBe(6000.00);
    });

    test('should get all payments', async () => {
      const response = await agent
        .get('/api/payments')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payments).toBeDefined();
      expect(Array.isArray(response.body.payments)).toBe(true);
      expect(response.body.payments.length).toBeGreaterThan(0);
    });

    test('should get payments by invoice ID', async () => {
      const response = await agent
        .get(`/api/payments/invoice/${testInvoiceId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.payments).toBeDefined();
      expect(Array.isArray(response.body.payments)).toBe(true);
      expect(response.body.payments.length).toBeGreaterThan(0);
      expect(response.body.payments[0].invoice_id).toBe(testInvoiceId);
    });

    test('should generate receipt', async () => {
      const response = await agent
        .get(`/api/payments/${testPaymentId}/receipt`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.receipt).toBeDefined();
      expect(response.body.receipt.payment_id).toBe(testPaymentId);
      expect(response.body.receipt.amount).toBe(6000.00);
      expect(response.body.receipt.payment_method).toBe('Cash');
      expect(response.body.receipt.receipt_number).toBeDefined();
    });
  });

  describe('Payment Validation', () => {
    
    test('should prevent overpayment', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 7000.00, // Exceeds invoice total of 6000
        paymentMethod: 'Cash',
        transactionReference: 'OVERPAY-001',
        notes: 'Overpayment attempt'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('overpayment');
    });

    test('should prevent overpayment with multiple payments', async () => {
      // First payment: 3000
      const payment1Data = {
        invoiceId: testInvoiceId,
        amount: 3000.00,
        paymentMethod: 'Cash',
        transactionReference: 'PAY-001'
      };
      
      await agent
        .post('/api/payments')
        .send(payment1Data)
        .expect(201);

      // Second payment: 4000 (would exceed total of 6000)
      const payment2Data = {
        invoiceId: testInvoiceId,
        amount: 4000.00,
        paymentMethod: 'Credit Card',
        transactionReference: 'PAY-002'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(payment2Data)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('overpayment');
    });

    test('should reject negative payment amount', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: -100.00, // Negative amount
        paymentMethod: 'Cash',
        transactionReference: 'NEGATIVE-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject zero payment amount', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 0.00, // Zero amount
        paymentMethod: 'Cash',
        transactionReference: 'ZERO-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should require transaction reference for card payments', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Credit Card',
        // Missing transaction_reference
        notes: 'Missing transaction reference'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('transaction reference');
    });

    test('should require transaction reference for bank transfer', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Bank Transfer',
        // Missing transaction_reference
        notes: 'Missing transaction reference'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('transaction reference');
    });

    test('should reject payment on cancelled invoice', async () => {
      // Cancel the invoice
      await agent
        .put(`/api/invoices/${testInvoiceId}/status`)
        .send({ status: 'Cancelled' })
        .expect(200);

      // Try to record payment on cancelled invoice
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Cash',
        transactionReference: 'CANCELLED-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('cancelled');
    });
  });

  describe('Invoice Status Updates', () => {
    
    test('should auto-update invoice status to Paid on full payment', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 6000.00, // Full payment
        paymentMethod: 'Cash',
        transactionReference: 'FULL-PAYMENT-001'
      };
      
      await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      // Verify invoice status is now Paid
      const invoiceResponse = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);

      expect(invoiceResponse.body.invoice.status).toBe('Paid');
    });

    test('should keep invoice status as Sent on partial payment', async () => {
      // Mark invoice as Sent first
      await agent
        .put(`/api/invoices/${testInvoiceId}/status`)
        .send({ status: 'Sent' })
        .expect(200);

      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 3000.00, // Partial payment
        paymentMethod: 'Cash',
        transactionReference: 'PARTIAL-PAYMENT-001'
      };
      
      await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      // Verify invoice status remains Sent
      const invoiceResponse = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);

      expect(invoiceResponse.body.invoice.status).toBe('Sent');
    });
  });

  describe('Access Control', () => {
    
    test('should allow admin to access all payment operations', async () => {
      await agent.get('/api/payments').expect(200);
      await agent.post('/api/payments').expect(400); // Validation error expected
    });

    test('should allow manager to access payment operations', async () => {
      const managerAgent = await authHelper.getAuthenticatedAgent('manager');
      
      await managerAgent.get('/api/payments').expect(200);
      await managerAgent.post('/api/payments').expect(400); // Validation error expected
    });

    test('should allow doctor to access payment operations', async () => {
      const doctorAgent = await authHelper.getAuthenticatedAgent('doctor');
      
      await doctorAgent.get('/api/payments').expect(200);
      await doctorAgent.post('/api/payments').expect(400); // Validation error expected
    });

    test('should allow nurse to access payment operations', async () => {
      const nurseAgent = await authHelper.getAuthenticatedAgent('nurse');
      
      await nurseAgent.get('/api/payments').expect(200);
      await nurseAgent.post('/api/payments').expect(400); // Validation error expected
    });

    test('should allow receptionist to access payment operations', async () => {
      const receptionistAgent = await authHelper.getAuthenticatedAgent('receptionist');
      
      await receptionistAgent.get('/api/payments').expect(200);
      await receptionistAgent.post('/api/payments').expect(400); // Validation error expected
    });

    test('should deny access to unauthenticated users', async () => {
      const unauthenticatedAgent = request(app);
      
      await unauthenticatedAgent.get('/api/payments').expect(401);
      await unauthenticatedAgent.post('/api/payments').expect(401);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle payment not found', async () => {
      const response = await agent
        .get('/api/payments/99999')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle invalid payment ID format', async () => {
      const response = await agent
        .get('/api/payments/invalid-id')
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should handle malformed request data', async () => {
      const response = await agent
        .post('/api/payments')
        .send('invalid json')
        .expect(400);
    });

    test('should handle payment on non-existent invoice', async () => {
      const paymentData = {
        invoiceId: 99999, // Non-existent invoice
        amount: 1000.00,
        paymentMethod: 'Cash',
        transactionReference: 'NON-EXISTENT-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});

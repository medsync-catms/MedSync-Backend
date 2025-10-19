const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('Payment Validation Tests', () => {
  let agent;
  let seedData;
  let testPatientId;
  let testInvoiceId;
  let testDoctorId;

  beforeAll(async () => {
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id;
  });

  beforeEach(async () => {
    const { agent: authenticatedAgent } = await authHelper.loginAs('admin');
    agent = authenticatedAgent;

    // Create test patient and invoice
    const patientData = dataHelper.generatePatientData({
      firstName: "PaymentValidation",
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

    // Create appointment and treatments
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
          consultationNotes: "Payment validation test"
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

  describe('Overpayment Prevention', () => {
    
    test('should prevent single overpayment', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 6000.00, // Exceeds invoice total of 5000
        paymentMethod: 'Cash',
        transactionReference: 'OVERPAY-001'
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

      // Second payment: 3000 (would exceed total of 5000)
      const payment2Data = {
        invoiceId: testInvoiceId,
        amount: 3000.00,
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

    test('should allow exact payment amount', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 5000.00, // Exact amount
        paymentMethod: 'Cash',
        transactionReference: 'EXACT-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.payment.amount).toBe(5000.00);
    });

    test('should allow partial payment', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 3000.00, // Partial payment
        paymentMethod: 'Cash',
        transactionReference: 'PARTIAL-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.payment.amount).toBe(3000.00);
    });
  });

  describe('Amount Validation', () => {
    
    test('should reject negative payment amounts', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: -100.00,
        paymentMethod: 'Cash',
        transactionReference: 'NEGATIVE-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject zero payment amounts', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 0.00,
        paymentMethod: 'Cash',
        transactionReference: 'ZERO-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should accept positive payment amounts', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 100.00,
        paymentMethod: 'Cash',
        transactionReference: 'POSITIVE-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.payment.amount).toBe(100.00);
    });
  });

  describe('Payment Method Validation', () => {
    
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

    test('should require transaction reference for bank transfers', async () => {
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

    test('should not require transaction reference for cash payments', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Cash',
        // No transaction_reference needed for cash
        notes: 'Cash payment'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test('should accept valid payment methods', async () => {
      const validMethods = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Cheque'];
      
      for (const method of validMethods) {
        const paymentData = {
          invoiceId: testInvoiceId,
          amount: 100.00,
          paymentMethod: method,
          transactionReference: method === 'Cash' ? undefined : `REF-${method}`,
          notes: `Payment via ${method}`
        };
        
        const response = await agent
          .post('/api/payments')
          .send(paymentData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.payment.payment_method).toBe(method);
      }
    });

    test('should reject invalid payment methods', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'InvalidMethod',
        transactionReference: 'INVALID-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Invoice Status Validation', () => {
    
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

    test('should allow payment on draft invoice', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Cash',
        transactionReference: 'DRAFT-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    test('should allow payment on sent invoice', async () => {
      // Mark as sent
      await agent
        .put(`/api/invoices/${testInvoiceId}/status`)
        .send({ status: 'Sent' })
        .expect(200);

      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Cash',
        transactionReference: 'SENT-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Invoice Existence Validation', () => {
    
    test('should reject payment on non-existent invoice', async () => {
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

    test('should reject payment with null invoice ID', async () => {
      const paymentData = {
        invoiceId: null,
        amount: 1000.00,
        paymentMethod: 'Cash',
        transactionReference: 'NULL-001'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Transaction Reference Validation', () => {
    
    test('should accept valid transaction references', async () => {
      const validReferences = [
        'TXN-123456',
        'CC-987654321',
        'BT-ABC123DEF',
        'CHQ-001234',
        'REF-2025-001'
      ];

      for (const ref of validReferences) {
        const paymentData = {
          invoiceId: testInvoiceId,
          amount: 100.00,
          paymentMethod: 'Credit Card',
          transactionReference: ref,
          notes: `Payment with ref: ${ref}`
        };
        
        const response = await agent
          .post('/api/payments')
          .send(paymentData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.payment.transaction_reference).toBe(ref);
      }
    });

    test('should reject empty transaction reference for required methods', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Credit Card',
        transactionReference: '',
        notes: 'Empty transaction reference'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject null transaction reference for required methods', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Bank Transfer',
        transactionReference: null,
        notes: 'Null transaction reference'
      };
      
      const response = await agent
        .post('/api/payments')
        .send(paymentData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Payment Processing Validation', () => {
    
    test('should update invoice status to Paid on full payment', async () => {
      const paymentData = {
        invoiceId: testInvoiceId,
        amount: 5000.00, // Full payment
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
      // Mark as sent first
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

    test('should calculate outstanding balance correctly', async () => {
      // First partial payment
      const payment1Data = {
        invoiceId: testInvoiceId,
        amount: 2000.00,
        paymentMethod: 'Cash',
        transactionReference: 'PAY-001'
      };
      
      await agent
        .post('/api/payments')
        .send(payment1Data)
        .expect(201);

      // Second partial payment
      const payment2Data = {
        invoiceId: testInvoiceId,
        amount: 2000.00,
        paymentMethod: 'Credit Card',
        transactionReference: 'PAY-002'
      };
      
      await agent
        .post('/api/payments')
        .send(payment2Data)
        .expect(201);

      // Final payment
      const payment3Data = {
        invoiceId: testInvoiceId,
        amount: 1000.00,
        paymentMethod: 'Bank Transfer',
        transactionReference: 'PAY-003'
      };
      
      await agent
        .post('/api/payments')
        .send(payment3Data)
        .expect(201);

      // Verify final status
      const invoiceResponse = await agent
        .get(`/api/invoices/${testInvoiceId}`)
        .expect(200);

      expect(invoiceResponse.body.invoice.status).toBe('Paid');
    });
  });
});

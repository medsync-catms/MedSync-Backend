const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');
const { dataHelper } = require('../helpers/data.helper');
const { dbHelper } = require('../helpers/db.helper');

describe('End-to-End Workflow Integration Tests', () => {
  let seedData;
  let testDoctorId;
  let testBranchId;

  beforeAll(async () => {
    // Get seed data for testing
    seedData = await dbHelper.getSeedData();
    testDoctorId = seedData.medicalStaff[0].id; // Dr. Silva
    testBranchId = seedData.branches[0].id; // Colombo Branch
  });

  describe('Complete Patient Journey Workflow', () => {
    
    test('should complete full workflow from registration to payment', async () => {
      console.log('🚀 Starting Complete Patient Journey Workflow Test');
      
      // Step 1: Login as receptionist
      console.log('Step 1: Login as receptionist');
      const { agent: receptionistAgent } = await authHelper.loginAs('receptionist');
      
      // Step 2: Register patient with exact test data
      console.log('Step 2: Register patient with exact test data');
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
      
      const patientResponse = await receptionistAgent
        .post('/api/patients')
        .send(exactPatientData)
        .expect(201);

      expect(patientResponse.body.success).toBe(true);
      const patientId = patientResponse.body.patient.id;
      console.log(`✅ Patient registered - ID: ${patientId}`);
      
      global.trackTestData('patients', patientId);
      global.trackTestData('addresses', patientResponse.body.patient.address_id);
      global.trackTestData('insurance', patientResponse.body.patient.insurance.id);

      // Step 3: Book appointment for tomorrow 10 AM
      console.log('Step 3: Book appointment for tomorrow 10 AM');
      const tomorrow = dataHelper.createTomorrowAtTime(10, 0); // 10:00 AM tomorrow
      
      const appointmentData = {
        patientId: patientId,
        doctorId: testDoctorId,
        branchId: testBranchId,
        appointmentDatetime: tomorrow,
        type: "Regular",
        notes: "Integration test appointment"
      };
      
      const appointmentResponse = await receptionistAgent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      expect(appointmentResponse.body.success).toBe(true);
      const appointmentId = appointmentResponse.body.appointment.id;
      console.log(`✅ Appointment booked - ID: ${appointmentId}`);
      
      global.trackTestData('appointments', appointmentId);

      // Step 4: Login as doctor
      console.log('Step 4: Login as doctor');
      const { agent: doctorAgent } = await authHelper.loginAs('doctor');
      
      // Step 5: Start consultation
      console.log('Step 5: Start consultation');
      const consultationResponse = await doctorAgent
        .put(`/api/appointments/${appointmentId}/status`)
        .send({ status: 'In Progress' })
        .expect(200);

      expect(consultationResponse.body.success).toBe(true);
      expect(consultationResponse.body.appointment.status).toBe('In Progress');
      console.log('✅ Consultation started');

      // Step 6: Record 2 treatments (consultation + blood test)
      console.log('Step 6: Record treatments');
      const treatmentData = {
        appointmentId: appointmentId,
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
      
      const treatmentResponse = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      expect(treatmentResponse.body.success).toBe(true);
      expect(treatmentResponse.body.treatments.length).toBe(2);
      console.log('✅ Treatments recorded - Consultation: LKR 2,500.00, Blood Test: LKR 3,500.00');
      
      treatmentResponse.body.treatments.forEach(treatment => {
        global.trackTestData('treatments', treatment.id);
      });

      // Step 7: Complete appointment
      console.log('Step 7: Complete appointment');
      const completeResponse = await doctorAgent
        .put(`/api/appointments/${appointmentId}/complete`)
        .expect(200);

      expect(completeResponse.body.success).toBe(true);
      expect(completeResponse.body.appointment.status).toBe('Completed');
      expect(completeResponse.body.invoice).toBeDefined();
      expect(completeResponse.body.invoice.total_amount).toBe(6000.00);
      console.log('✅ Appointment completed - Invoice auto-generated: LKR 6,000.00');

      // Step 8: Verify invoice auto-generated (total: 6000.00)
      console.log('Step 8: Verify invoice details');
      const invoiceId = completeResponse.body.invoice.id;
      global.trackTestData('invoices', invoiceId);

      const invoiceResponse = await doctorAgent
        .get(`/api/invoices/${invoiceId}`)
        .expect(200);

      expect(invoiceResponse.body.success).toBe(true);
      expect(invoiceResponse.body.invoice.total_amount).toBe(6000.00);
      expect(invoiceResponse.body.invoice.status).toBe('Draft');
      expect(invoiceResponse.body.invoice.treatments.length).toBe(2);
      console.log('✅ Invoice verified - Total: LKR 6,000.00, Status: Draft');

      // Step 9: Login as billing staff (admin)
      console.log('Step 9: Login as billing staff');
      const { agent: billingAgent } = await authHelper.loginAs('admin');
      
      // Step 10: Mark invoice as sent
      console.log('Step 10: Mark invoice as sent');
      const sentResponse = await billingAgent
        .put(`/api/invoices/${invoiceId}/status`)
        .send({ status: 'Sent' })
        .expect(200);

      expect(sentResponse.body.success).toBe(true);
      expect(sentResponse.body.invoice.status).toBe('Sent');
      console.log('✅ Invoice marked as sent');

      // Step 11: Record payment (Cash, 6000.00)
      console.log('Step 11: Record payment');
      const paymentData = {
        invoiceId: invoiceId,
        amount: 6000.00,
        paymentMethod: 'Cash',
        transactionReference: 'TEST-TXN-001',
        notes: 'Integration test payment'
      };
      
      const paymentResponse = await billingAgent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(paymentResponse.body.success).toBe(true);
      expect(paymentResponse.body.payment.amount).toBe(6000.00);
      expect(paymentResponse.body.payment.payment_method).toBe('Cash');
      console.log('✅ Payment recorded - Amount: LKR 6,000.00, Method: Cash');
      
      global.trackTestData('payments', paymentResponse.body.payment.id);

      // Step 12: Verify invoice status = "Paid"
      console.log('Step 12: Verify invoice status updated');
      const finalInvoiceResponse = await billingAgent
        .get(`/api/invoices/${invoiceId}`)
        .expect(200);

      expect(finalInvoiceResponse.body.invoice.status).toBe('Paid');
      console.log('✅ Invoice status updated to Paid');

      // Step 13: Generate and verify receipt
      console.log('Step 13: Generate receipt');
      const receiptResponse = await billingAgent
        .get(`/api/payments/${paymentResponse.body.payment.id}/receipt`)
        .expect(200);

      expect(receiptResponse.body.success).toBe(true);
      expect(receiptResponse.body.receipt.payment_id).toBe(paymentResponse.body.payment.id);
      expect(receiptResponse.body.receipt.amount).toBe(6000.00);
      expect(receiptResponse.body.receipt.receipt_number).toBeDefined();
      console.log('✅ Receipt generated successfully');

      console.log('🎉 Complete Patient Journey Workflow Test PASSED');
      console.log(`📊 Summary:
        - Patient ID: ${patientId}
        - Appointment ID: ${appointmentId}
        - Invoice: ${finalInvoiceResponse.body.invoice.invoice_number}
        - Total: LKR ${finalInvoiceResponse.body.invoice.total_amount.toFixed(2)}
        - Payment: Successful
        - Receipt: Generated`);
    });
  });

  describe('Walk-in Workflow', () => {
    
    test('should complete walk-in workflow', async () => {
      console.log('🚀 Starting Walk-in Workflow Test');
      
      // Step 1: Login as receptionist
      console.log('Step 1: Login as receptionist');
      const { agent: receptionistAgent } = await authHelper.loginAs('receptionist');
      
      // Step 2: Search for existing patient
      console.log('Step 2: Search for existing patient');
      const searchResponse = await receptionistAgent
        .get('/api/patients/search?query=Integration')
        .expect(200);

      expect(searchResponse.body.success).toBe(true);
      expect(searchResponse.body.patients.length).toBeGreaterThan(0);
      const existingPatient = searchResponse.body.patients[0];
      console.log(`✅ Patient found - ID: ${existingPatient.id}, Name: ${existingPatient.first_name} ${existingPatient.last_name}`);

      // Step 3: Register walk-in
      console.log('Step 3: Register walk-in');
      const now = new Date();
      now.setMinutes(now.getMinutes() + 5); // 5 minutes from now

      const walkInData = {
        patientId: existingPatient.id,
        doctorId: testDoctorId,
        branchId: testBranchId,
        appointmentDatetime: now.toISOString(),
        type: "Walk-in",
        notes: "Walk-in consultation",
        overrideValidations: true
      };
      
      const walkInResponse = await receptionistAgent
        .post('/api/appointments/walk-in')
        .send(walkInData)
        .expect(201);

      expect(walkInResponse.body.success).toBe(true);
      expect(walkInResponse.body.appointment.type).toBe('Walk-in');
      expect(walkInResponse.body.appointment.status).toBe('In Progress');
      const walkInAppointmentId = walkInResponse.body.appointment.id;
      console.log(`✅ Walk-in registered - ID: ${walkInAppointmentId}`);
      
      global.trackTestData('appointments', walkInAppointmentId);

      // Step 4: Login as doctor and record treatments
      console.log('Step 4: Record treatments');
      const { agent: doctorAgent } = await authHelper.loginAs('doctor');
      
      const treatmentData = {
        appointmentId: walkInAppointmentId,
        treatments: [
          {
            treatmentId: 1, // General Consultation
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Walk-in consultation"
          }
        ]
      };
      
      const treatmentResponse = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      expect(treatmentResponse.body.success).toBe(true);
      console.log('✅ Treatment recorded - Consultation: LKR 2,500.00');
      
      global.trackTestData('treatments', treatmentResponse.body.treatments[0].id);

      // Step 5: Complete consultation
      console.log('Step 5: Complete consultation');
      const completeResponse = await doctorAgent
        .put(`/api/appointments/${walkInAppointmentId}/complete`)
        .expect(200);

      expect(completeResponse.body.success).toBe(true);
      expect(completeResponse.body.appointment.status).toBe('Completed');
      expect(completeResponse.body.invoice).toBeDefined();
      const walkInInvoiceId = completeResponse.body.invoice.id;
      console.log(`✅ Walk-in completed - Invoice generated: LKR ${completeResponse.body.invoice.total_amount.toFixed(2)}`);
      
      global.trackTestData('invoices', walkInInvoiceId);

      // Step 6: Record immediate payment
      console.log('Step 6: Record immediate payment');
      const { agent: billingAgent } = await authHelper.loginAs('admin');
      
      const paymentData = {
        invoiceId: walkInInvoiceId,
        amount: 2500.00,
        paymentMethod: 'Cash',
        transactionReference: 'WALKIN-PAY-001',
        notes: 'Walk-in immediate payment'
      };
      
      const paymentResponse = await billingAgent
        .post('/api/payments')
        .send(paymentData)
        .expect(201);

      expect(paymentResponse.body.success).toBe(true);
      console.log('✅ Payment recorded - Amount: LKR 2,500.00');
      
      global.trackTestData('payments', paymentResponse.body.payment.id);

      // Step 7: Print receipt
      console.log('Step 7: Generate receipt');
      const receiptResponse = await billingAgent
        .get(`/api/payments/${paymentResponse.body.payment.id}/receipt`)
        .expect(200);

      expect(receiptResponse.body.success).toBe(true);
      console.log('✅ Receipt generated for walk-in');

      console.log('🎉 Walk-in Workflow Test PASSED');
      console.log(`📊 Summary:
        - Patient: ${existingPatient.first_name} ${existingPatient.last_name}
        - Walk-in Appointment ID: ${walkInAppointmentId}
        - Invoice: LKR 2,500.00
        - Payment: Immediate cash payment
        - Receipt: Generated`);
    });
  });

  describe('Insurance Workflow', () => {
    
    test('should complete insurance workflow', async () => {
      console.log('🚀 Starting Insurance Workflow Test');
      
      // Step 1: Login as receptionist and register patient with insurance
      console.log('Step 1: Register patient with insurance');
      const { agent: receptionistAgent } = await authHelper.loginAs('receptionist');
      
      const patientWithInsuranceData = dataHelper.generatePatientWithInsuranceData({
        firstName: "Insurance",
        lastName: "WorkflowPatient",
        insurance: {
          providerId: 1, // Lanka Health Insurance
          policyNumber: "INS-WORKFLOW-001",
          coveragePercentage: 80,
          deductible: 5000,
          maxClaim: 500000,
          expirationDate: "2026-12-31"
        }
      });
      
      const patientResponse = await receptionistAgent
        .post('/api/patients')
        .send({
          ...patientWithInsuranceData,
          hasInsurance: true
        })
        .expect(201);

      const insurancePatientId = patientResponse.body.patient.id;
      const insuranceId = patientResponse.body.patient.insurance.id;
      console.log(`✅ Patient with insurance registered - ID: ${insurancePatientId}`);
      
      global.trackTestData('patients', insurancePatientId);
      global.trackTestData('addresses', patientResponse.body.patient.address_id);
      global.trackTestData('insurance', insuranceId);

      // Step 2: Book appointment and complete consultation
      console.log('Step 2: Complete consultation');
      const appointmentData = dataHelper.generateAppointmentData(insurancePatientId, {
        doctorId: testDoctorId,
        status: 'In Progress'
      });
      
      const appointmentResponse = await receptionistAgent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      const insuranceAppointmentId = appointmentResponse.body.appointment.id;
      global.trackTestData('appointments', insuranceAppointmentId);

      // Record treatments and complete
      const { agent: doctorAgent } = await authHelper.loginAs('doctor');
      
      const treatmentData = {
        appointmentId: insuranceAppointmentId,
        treatments: [
          {
            treatmentId: 1, // General Consultation
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Insurance consultation"
          },
          {
            treatmentId: 3, // Blood Test
            quantity: 1,
            unitPrice: 3500.00,
            consultationNotes: "Blood test for insurance claim"
          }
        ]
      };
      
      await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      const completeResponse = await doctorAgent
        .put(`/api/appointments/${insuranceAppointmentId}/complete`)
        .expect(200);

      const insuranceInvoiceId = completeResponse.body.invoice.id;
      console.log(`✅ Consultation completed - Invoice: LKR ${completeResponse.body.invoice.total_amount.toFixed(2)}`);
      
      global.trackTestData('invoices', insuranceInvoiceId);

      // Step 3: Submit insurance claim
      console.log('Step 3: Submit insurance claim');
      const { agent: adminAgent } = await authHelper.loginAs('admin');
      
      const claimData = {
        invoiceId: insuranceInvoiceId,
        patientInsuranceId: insuranceId,
        claimNumber: 'CLM-INS-WORKFLOW-001',
        claimAmount: 4800.00, // 80% of 6000
        status: 'Submitted'
      };
      
      const claimResponse = await adminAgent
        .post('/api/insurance/claims')
        .send(claimData)
        .expect(201);

      const claimId = claimResponse.body.claim.id;
      console.log(`✅ Insurance claim submitted - ID: ${claimId}, Amount: LKR 4,800.00`);
      
      global.trackTestData('claims', claimId);

      // Step 4: Approve claim
      console.log('Step 4: Approve insurance claim');
      const approveResponse = await adminAgent
        .put(`/api/insurance/claims/${claimId}`)
        .send({
          status: 'Approved',
          approvedAmount: 4800.00,
          rejectionReason: null
        })
        .expect(200);

      expect(approveResponse.body.success).toBe(true);
      expect(approveResponse.body.claim.status).toBe('Approved');
      console.log('✅ Insurance claim approved');

      // Step 5: Process claim payment
      console.log('Step 5: Process claim payment');
      const paymentResponse = await adminAgent
        .put(`/api/insurance/claims/${claimId}/payment`)
        .send({
          status: 'Paid',
          approvedAmount: 4800.00
        })
        .expect(200);

      expect(paymentResponse.body.success).toBe(true);
      expect(paymentResponse.body.claim.status).toBe('Paid');
      console.log('✅ Insurance claim payment processed');

      // Step 6: Verify invoice status and remaining balance
      console.log('Step 6: Verify final invoice status');
      const finalInvoiceResponse = await adminAgent
        .get(`/api/invoices/${insuranceInvoiceId}`)
        .expect(200);

      expect(finalInvoiceResponse.body.invoice.status).toBe('Paid');
      console.log('✅ Invoice fully paid through insurance');

      console.log('🎉 Insurance Workflow Test PASSED');
      console.log(`📊 Summary:
        - Patient: Insurance WorkflowPatient
        - Appointment ID: ${insuranceAppointmentId}
        - Invoice Total: LKR 6,000.00
        - Insurance Claim: LKR 4,800.00 (80% coverage)
        - Claim Status: Paid
        - Invoice Status: Paid`);
    });
  });

  describe('Partial Payment Workflow', () => {
    
    test('should handle multiple partial payments', async () => {
      console.log('🚀 Starting Partial Payment Workflow Test');
      
      // Step 1: Create patient and complete consultation
      console.log('Step 1: Create patient and complete consultation');
      const { agent: receptionistAgent } = await authHelper.loginAs('receptionist');
      
      const patientData = dataHelper.generatePatientData({
        firstName: "PartialPayment",
        lastName: "Patient"
      });
      
      const patientResponse = await receptionistAgent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: false
        })
        .expect(201);

      const partialPatientId = patientResponse.body.patient.id;
      global.trackTestData('patients', partialPatientId);
      global.trackTestData('addresses', patientResponse.body.patient.address_id);

      // Complete consultation
      const appointmentData = dataHelper.generateAppointmentData(partialPatientId, {
        doctorId: testDoctorId,
        status: 'In Progress'
      });
      
      const appointmentResponse = await receptionistAgent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      const partialAppointmentId = appointmentResponse.body.appointment.id;
      global.trackTestData('appointments', partialAppointmentId);

      const { agent: doctorAgent } = await authHelper.loginAs('doctor');
      
      const treatmentData = {
        appointmentId: partialAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 5000.00, // Higher amount for partial payment testing
            consultationNotes: "Extended consultation"
          }
        ]
      };
      
      await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(201);

      const completeResponse = await doctorAgent
        .put(`/api/appointments/${partialAppointmentId}/complete`)
        .expect(200);

      const partialInvoiceId = completeResponse.body.invoice.id;
      console.log(`✅ Consultation completed - Invoice: LKR ${completeResponse.body.invoice.total_amount.toFixed(2)}`);
      
      global.trackTestData('invoices', partialInvoiceId);

      // Step 2: Record multiple partial payments
      console.log('Step 2: Record multiple partial payments');
      const { agent: billingAgent } = await authHelper.loginAs('admin');
      
      const payments = [
        { amount: 2000.00, method: 'Cash', ref: 'PARTIAL-001' },
        { amount: 2000.00, method: 'Credit Card', ref: 'PARTIAL-002' },
        { amount: 1000.00, method: 'Bank Transfer', ref: 'PARTIAL-003' }
      ];

      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
        console.log(`Recording payment ${i + 1}: LKR ${payment.amount.toFixed(2)} via ${payment.method}`);
        
        const paymentData = {
          invoiceId: partialInvoiceId,
          amount: payment.amount,
          paymentMethod: payment.method,
          transactionReference: payment.ref,
          notes: `Partial payment ${i + 1} via ${payment.method}`
        };
        
        const paymentResponse = await billingAgent
          .post('/api/payments')
          .send(paymentData)
          .expect(201);

        expect(paymentResponse.body.success).toBe(true);
        global.trackTestData('payments', paymentResponse.body.payment.id);
      }

      // Step 3: Verify final settlement
      console.log('Step 3: Verify final settlement');
      const finalInvoiceResponse = await billingAgent
        .get(`/api/invoices/${partialInvoiceId}`)
        .expect(200);

      expect(finalInvoiceResponse.body.invoice.status).toBe('Paid');
      console.log('✅ Invoice fully settled through partial payments');

      // Step 4: Verify payment history
      console.log('Step 4: Verify payment history');
      const historyResponse = await billingAgent
        .get(`/api/payments/invoice/${partialInvoiceId}`)
        .expect(200);

      expect(historyResponse.body.success).toBe(true);
      expect(historyResponse.body.payments.length).toBe(3);
      
      const totalPaid = historyResponse.body.payments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
      expect(totalPaid).toBe(5000.00);
      console.log('✅ Payment history verified - Total paid: LKR 5,000.00');

      console.log('🎉 Partial Payment Workflow Test PASSED');
      console.log(`📊 Summary:
        - Invoice Total: LKR 5,000.00
        - Payment 1: LKR 2,000.00 (Cash)
        - Payment 2: LKR 2,000.00 (Credit Card)
        - Payment 3: LKR 1,000.00 (Bank Transfer)
        - Total Paid: LKR 5,000.00
        - Invoice Status: Paid`);
    });
  });

  describe('Cancellation Workflow', () => {
    
    test('should handle appointment cancellation workflow', async () => {
      console.log('🚀 Starting Cancellation Workflow Test');
      
      // Step 1: Create patient and book appointment
      console.log('Step 1: Create patient and book appointment');
      const { agent: receptionistAgent } = await authHelper.loginAs('receptionist');
      
      const patientData = dataHelper.generatePatientData({
        firstName: "Cancellation",
        lastName: "TestPatient"
      });
      
      const patientResponse = await receptionistAgent
        .post('/api/patients')
        .send({
          ...patientData,
          hasInsurance: false
        })
        .expect(201);

      const cancelPatientId = patientResponse.body.patient.id;
      global.trackTestData('patients', cancelPatientId);
      global.trackTestData('addresses', patientResponse.body.patient.address_id);

      const appointmentData = dataHelper.generateAppointmentData(cancelPatientId, {
        doctorId: testDoctorId,
        status: 'Scheduled'
      });
      
      const appointmentResponse = await receptionistAgent
        .post('/api/appointments')
        .send(appointmentData)
        .expect(201);

      const cancelAppointmentId = appointmentResponse.body.appointment.id;
      console.log(`✅ Appointment booked - ID: ${cancelAppointmentId}`);
      
      global.trackTestData('appointments', cancelAppointmentId);

      // Step 2: Cancel appointment with reason
      console.log('Step 2: Cancel appointment');
      const cancelData = {
        status: 'Cancelled',
        cancellationReason: 'Patient requested cancellation due to scheduling conflict'
      };

      const cancelResponse = await receptionistAgent
        .put(`/api/appointments/${cancelAppointmentId}`)
        .send(cancelData)
        .expect(200);

      expect(cancelResponse.body.success).toBe(true);
      expect(cancelResponse.body.appointment.status).toBe('Cancelled');
      expect(cancelResponse.body.appointment.cancellation_reason).toBe('Patient requested cancellation due to scheduling conflict');
      console.log('✅ Appointment cancelled with reason');

      // Step 3: Verify cancellation status
      console.log('Step 3: Verify cancellation status');
      const statusResponse = await receptionistAgent
        .get(`/api/appointments/${cancelAppointmentId}`)
        .expect(200);

      expect(statusResponse.body.success).toBe(true);
      expect(statusResponse.body.appointment.status).toBe('Cancelled');
      console.log('✅ Cancellation status verified');

      // Step 4: Attempt to add treatments (should fail)
      console.log('Step 4: Verify treatments cannot be added to cancelled appointment');
      const { agent: doctorAgent } = await authHelper.loginAs('doctor');
      
      const treatmentData = {
        appointmentId: cancelAppointmentId,
        treatments: [
          {
            treatmentId: 1,
            quantity: 1,
            unitPrice: 2500.00,
            consultationNotes: "Should not work"
          }
        ]
      };
      
      const treatmentResponse = await doctorAgent
        .post('/api/treatments')
        .send(treatmentData)
        .expect(400);

      expect(treatmentResponse.body.success).toBe(false);
      expect(treatmentResponse.body.message).toContain('cancelled');
      console.log('✅ Treatment addition blocked for cancelled appointment');

      console.log('🎉 Cancellation Workflow Test PASSED');
      console.log(`📊 Summary:
        - Appointment ID: ${cancelAppointmentId}
        - Status: Cancelled
        - Cancellation Reason: Patient requested cancellation
        - Treatments: Blocked (as expected)`);
    });
  });
});

const { v4: uuidv4 } = require('uuid');

class DataHelper {
  constructor() {
    this.testCounter = 0;
  }

  generateUniqueId() {
    return uuidv4().substring(0, 8);
  }

  generateTestCounter() {
    return ++this.testCounter;
  }

  // Generate unique test patient data
  generatePatientData(overrides = {}) {
    const counter = this.generateTestCounter();
    const uniqueId = this.generateUniqueId();
    
    const defaultData = {
      firstName: `Integration${counter}`,
      lastName: `TestPatient${counter}`,
      dateOfBirth: '1988-06-15',
      gender: 'Male',
      phone: `+947712345${counter.toString().padStart(2, '0')}`,
      email: `test.patient${counter}@integration.test`,
      address: {
        line1: `${counter} Integration Test Street`,
        line2: `Apartment ${counter}B`,
        city: 'Colombo',
        state: 'Western Province',
        postalCode: `007${counter.toString().padStart(2, '0')}`
      },
      emergencyContact: {
        name: `Emergency Contact Person ${counter}`,
        phone: `+947798765${counter.toString().padStart(2, '0')}`,
        relation: 'Spouse'
      },
      registeredBranch: 1 // Colombo Branch
    };

    return { ...defaultData, ...overrides };
  }

  // Generate test patient data with insurance
  generatePatientWithInsuranceData(overrides = {}) {
    const patientData = this.generatePatientData(overrides);
    const counter = this.generateTestCounter();
    
    const insuranceData = {
      providerId: 1, // Lanka Health Insurance
      policyNumber: `TEST-INT-2025-${counter.toString().padStart(3, '0')}`,
      coveragePercentage: 80,
      deductible: 5000,
      maxClaim: 500000,
      expirationDate: '2026-12-31'
    };

    return {
      ...patientData,
      insurance: insuranceData
    };
  }

  // Generate test appointment data
  generateAppointmentData(patientId, overrides = {}) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0); // 10:00 AM tomorrow

    const defaultData = {
      patientId: patientId,
      doctorId: 1, // Dr. Silva from seed data
      branchId: 1, // Colombo Branch
      appointmentDatetime: tomorrow.toISOString(),
      type: 'Regular',
      notes: 'Integration test appointment'
    };

    return { ...defaultData, ...overrides };
  }

  // Generate test walk-in appointment data
  generateWalkInData(patientId, overrides = {}) {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 5); // 5 minutes from now

    const defaultData = {
      patientId: patientId,
      doctorId: 1, // Dr. Silva
      branchId: 1, // Colombo Branch
      appointmentDatetime: now.toISOString(),
      type: 'Walk-in',
      notes: 'Integration test walk-in',
      overrideValidations: true
    };

    return { ...defaultData, ...overrides };
  }

  // Generate test treatment data
  generateTreatmentData(appointmentId, overrides = {}) {
    const defaultData = [
      {
        treatmentId: 1, // General Consultation
        quantity: 1,
        unitPrice: 2500.00,
        consultationNotes: 'Patient presented with mild symptoms'
      },
      {
        treatmentId: 3, // Blood Test
        quantity: 1,
        unitPrice: 3500.00,
        consultationNotes: 'Full blood panel ordered'
      }
    ];

    return defaultData.map(treatment => ({ ...treatment, ...overrides }));
  }

  // Generate test payment data
  generatePaymentData(invoiceId, overrides = {}) {
    const counter = this.generateTestCounter();
    
    const defaultData = {
      invoiceId: invoiceId,
      amount: 6000.00,
      paymentMethod: 'Cash',
      transactionReference: `TEST-TXN-${counter.toString().padStart(3, '0')}`,
      notes: 'Integration test payment'
    };

    return { ...defaultData, ...overrides };
  }

  // Generate test insurance claim data
  generateInsuranceClaimData(invoiceId, patientInsuranceId, overrides = {}) {
    const counter = this.generateTestCounter();
    
    const defaultData = {
      invoiceId: invoiceId,
      patientInsuranceId: patientInsuranceId,
      claimNumber: `CLM-${counter.toString().padStart(6, '0')}`,
      claimAmount: 4800.00, // 80% of 6000
      status: 'Submitted'
    };

    return { ...defaultData, ...overrides };
  }

  // Generate invalid data for validation testing
  generateInvalidPatientData() {
    return {
      firstName: '', // Invalid: empty
      lastName: '', // Invalid: empty
      dateOfBirth: 'invalid-date', // Invalid: not a date
      gender: 'InvalidGender', // Invalid: not in enum
      phone: 'invalid-phone', // Invalid: wrong format
      email: 'invalid-email', // Invalid: not an email
      address: {
        line1: '', // Invalid: empty
        city: '' // Invalid: empty
      }
    };
  }

  generateInvalidAppointmentData() {
    return {
      patientId: null, // Invalid: null
      doctorId: 999, // Invalid: non-existent doctor
      branchId: 999, // Invalid: non-existent branch
      appointmentDatetime: 'invalid-datetime', // Invalid: not a date
      type: 'InvalidType' // Invalid: not in enum
    };
  }

  generateInvalidPaymentData() {
    return {
      invoiceId: null, // Invalid: null
      amount: -100, // Invalid: negative amount
      paymentMethod: 'InvalidMethod' // Invalid: not in enum
    };
  }

  // Generate data for conflict testing
  generateConflictingAppointmentData(patientId, doctorId, baseDateTime) {
    const conflictTime = new Date(baseDateTime);
    conflictTime.setMinutes(conflictTime.getMinutes() + 15); // 15 minutes later

    return {
      patientId: patientId,
      doctorId: doctorId,
      branchId: 1,
      appointmentDatetime: conflictTime.toISOString(),
      type: 'Regular',
      notes: 'Conflicting appointment test'
    };
  }

  // Generate data for overpayment testing
  generateOverpaymentData(invoiceId, invoiceTotal) {
    return {
      invoiceId: invoiceId,
      amount: invoiceTotal + 1000, // Amount exceeds invoice total
      paymentMethod: 'Cash',
      transactionReference: 'OVERPAY-TEST-001',
      notes: 'Overpayment test'
    };
  }

  // Generate data for expired insurance testing
  generateExpiredInsuranceData(patientId) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return {
      patientId: patientId,
      providerId: 1,
      policyNumber: 'EXPIRED-TEST-001',
      coveragePercentage: 80,
      deductible: 5000,
      maxClaim: 500000,
      expirationDate: yesterday.toISOString().split('T')[0] // Yesterday
    };
  }

  // Helper to create tomorrow's date at specific time
  createTomorrowAtTime(hours, minutes = 0) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours, minutes, 0, 0);
    return tomorrow.toISOString();
  }

  // Helper to create today's date at specific time
  createTodayAtTime(hours, minutes = 0) {
    const today = new Date();
    today.setHours(hours, minutes, 0, 0);
    return today.toISOString();
  }

  // Helper to create past date
  createPastDate(daysAgo = 1) {
    const past = new Date();
    past.setDate(past.getDate() - daysAgo);
    return past.toISOString();
  }

  // Helper to create future date
  createFutureDate(daysFromNow = 1) {
    const future = new Date();
    future.setDate(future.getDate() + daysFromNow);
    return future.toISOString();
  }

  // Helper to format currency
  formatCurrency(amount) {
    return `LKR ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Helper to generate unique invoice number
  generateInvoiceNumber() {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${date}-${random}`;
  }

  // Helper to generate unique claim number
  generateClaimNumber() {
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `CLM-${date}-${random}`;
  }
}

const dataHelper = new DataHelper();

module.exports = { dataHelper };

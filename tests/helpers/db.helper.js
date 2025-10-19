const { Pool } = require('pg');
const path = require('path');

// Load test environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });

class DatabaseHelper {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false
    });
  }

  async connect() {
    try {
      await this.pool.query('SELECT 1');
      console.log('Test database connected successfully');
    } catch (error) {
      console.error('Failed to connect to test database:', error);
      throw error;
    }
  }

  async disconnect() {
    await this.pool.end();
  }

  async query(text, params = []) {
    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }

  async cleanupTestData(type, ids) {
    if (!ids || ids.length === 0) return;

    try {
      switch (type) {
        case 'payments':
          await this.query('DELETE FROM payments WHERE id = ANY($1)', [ids]);
          break;
        case 'insurance':
          await this.query('DELETE FROM patient_insurance WHERE id = ANY($1)', [ids]);
          break;
        case 'invoices':
          await this.query('DELETE FROM invoices WHERE id = ANY($1)', [ids]);
          break;
        case 'appointments':
          await this.query('DELETE FROM appointments WHERE id = ANY($1)', [ids]);
          break;
        case 'patients':
          await this.query('DELETE FROM patients WHERE id = ANY($1)', [ids]);
          break;
        case 'addresses':
          await this.query('DELETE FROM addresses WHERE id = ANY($1)', [ids]);
          break;
        default:
          console.warn(`Unknown cleanup type: ${type}`);
      }
    } catch (error) {
      console.error(`Error cleaning up ${type}:`, error);
    }
  }

  async getSeedData() {
    try {
      // Get existing seed data
      const branches = await this.query('SELECT * FROM branches ORDER BY id');
      const specialties = await this.query('SELECT * FROM specialties ORDER BY id');
      const treatments = await this.query('SELECT * FROM treatments ORDER BY id');
      const treatmentCategories = await this.query('SELECT * FROM treatment_categories ORDER BY id');
      const insuranceProviders = await this.query('SELECT * FROM insurance_providers ORDER BY id');
      const users = await this.query('SELECT * FROM users ORDER BY id');
      const medicalStaff = await this.query('SELECT * FROM medical_staff ORDER BY id');

      return {
        branches: branches.rows,
        specialties: specialties.rows,
        treatments: treatments.rows,
        treatmentCategories: treatmentCategories.rows,
        insuranceProviders: insuranceProviders.rows,
        users: users.rows,
        medicalStaff: medicalStaff.rows
      };
    } catch (error) {
      console.error('Error fetching seed data:', error);
      throw error;
    }
  }

  async createTestAddress(addressData) {
    const query = `
      INSERT INTO addresses (line1, line2, city, state, postal_code)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const result = await this.query(query, [
      addressData.line1,
      addressData.line2 || null,
      addressData.city,
      addressData.state || null,
      addressData.postalCode || null
    ]);
    return result.rows[0].id;
  }

  async createTestPatient(patientData, addressId) {
    const query = `
      INSERT INTO patients (
        first_name, last_name, date_of_birth, gender, address_id,
        phone, email, registered_branch, is_active,
        Emergency_contact_name, Emergency_contact_phone, Emergency_contact_relation
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
    const result = await this.query(query, [
      patientData.firstName,
      patientData.lastName,
      patientData.dateOfBirth,
      patientData.gender,
      addressId,
      patientData.phone,
      patientData.email || null,
      patientData.registeredBranch || 1,
      true,
      patientData.emergencyContact?.name || null,
      patientData.emergencyContact?.phone || null,
      patientData.emergencyContact?.relation || null
    ]);
    return result.rows[0].id;
  }

  async createTestInsurance(patientId, insuranceData) {
    const query = `
      INSERT INTO patient_insurance (
        patient_id, provider_id, policy_number, coverage_details, expiration_date, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const coverageDetails = {
      coverage_percentage: insuranceData.coveragePercentage,
      deductible: insuranceData.deductible,
      max_claim: insuranceData.maxClaim
    };
    const result = await this.query(query, [
      patientId,
      insuranceData.providerId,
      insuranceData.policyNumber,
      JSON.stringify(coverageDetails),
      insuranceData.expirationDate,
      true
    ]);
    return result.rows[0].id;
  }

  async createTestAppointment(appointmentData) {
    const query = `
      INSERT INTO appointments (
        patient_id, doctor_id, branch_id, appointment_datetime, status, type, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;
    const result = await this.query(query, [
      appointmentData.patientId,
      appointmentData.doctorId,
      appointmentData.branchId,
      appointmentData.appointmentDatetime,
      appointmentData.status || 'Scheduled',
      appointmentData.type || 'Regular',
      appointmentData.notes || null
    ]);
    return result.rows[0].id;
  }

  async createTestTreatmentRecord(treatmentData) {
    const query = `
      INSERT INTO treatment_records (
        appointment_id, treatment_id, quantity, unit_price, consultation_notes, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const result = await this.query(query, [
      treatmentData.appointmentId,
      treatmentData.treatmentId,
      treatmentData.quantity,
      treatmentData.unitPrice,
      treatmentData.consultationNotes || null,
      treatmentData.recordedBy
    ]);
    return result.rows[0].id;
  }

  async createTestInvoice(invoiceData) {
    const query = `
      INSERT INTO invoices (
        patient_id, appointment_id, invoice_number, total_amount, status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const result = await this.query(query, [
      invoiceData.patientId,
      invoiceData.appointmentId || null,
      invoiceData.invoiceNumber,
      invoiceData.totalAmount,
      invoiceData.status || 'Draft'
    ]);
    return result.rows[0].id;
  }

  async createTestPayment(paymentData) {
    const query = `
      INSERT INTO payments (
        invoice_id, amount, payment_method, transaction_reference, processed_by, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    const result = await this.query(query, [
      paymentData.invoiceId,
      paymentData.amount,
      paymentData.paymentMethod,
      paymentData.transactionReference || null,
      paymentData.processedBy,
      paymentData.notes || null
    ]);
    return result.rows[0].id;
  }

  async createTestInsuranceClaim(claimData) {
    const query = `
      INSERT INTO insurance_claims (
        invoice_id, patient_insurance_id, claim_number, claim_amount, status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;
    const result = await this.query(query, [
      claimData.invoiceId,
      claimData.patientInsuranceId,
      claimData.claimNumber,
      claimData.claimAmount,
      claimData.status || 'Submitted'
    ]);
    return result.rows[0].id;
  }
}

const dbHelper = new DatabaseHelper();

module.exports = { dbHelper };

const pool = require('../config/db');
const { getUserMedicalStaffId } = require('../middleware/auth');

const getAllPatients = async (req, res) => {
    try {
        let query = "SELECT * FROM patients";
        const params = [];
        
        // If user is a doctor, only show patients they have appointments with
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            query = `
                SELECT DISTINCT p.*
                FROM patients p
                JOIN appointments a ON p.id = a.patient_id
                WHERE a.doctor_id = $1
                ORDER BY p.last_name, p.first_name
            `;
            params.push(medicalStaffId);
        }
        
        const allPatients = await pool.query(query, params);
        res.json(allPatients.rows);
    } catch (err) {
        console.error('Error getting patient data:', err);
        res.status(500).json("Error getting patient data");
    }
};

// ...existing code...
const registerPatient = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            first_name,
            last_name,
            date_of_birth,
            gender,
            address,
            phone,
            email,
            registered_branch,
            is_active,
            emergency_contact_name,
            emergency_contact_phone,
            emergency_contact_relation,
            insurance
        } = req.body;

        // Insert address only if provided, otherwise leave address_id null
        let address_id = null;
        if (address && address.line1) {
            const addressResult = await client.query(
                "INSERT INTO addresses(line1, line2, city, state, postal_code) VALUES($1, $2, $3, $4, $5) RETURNING id",
                [address.line1, address.line2 || null, address.city || null, address.state || null, address.postal_code || null]
            );
            address_id = addressResult.rows[0].id;
        }

        // Then create the patient with the address_id (may be null)
        const newPatient = await client.query(
            "INSERT INTO patients(first_name, last_name, date_of_birth, gender, address_id, phone, email, registered_branch, is_active, emergency_contact_name, emergency_contact_phone, emergency_contact_relation) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [first_name, last_name, date_of_birth, gender, address_id, phone, email, registered_branch, is_active !== undefined ? is_active : true, emergency_contact_name || null, emergency_contact_phone || null, emergency_contact_relation || null]
        );

        const patient_id = newPatient.rows[0].id;

        // Support emergency contact provided either as separate fields or as an object emergency_contact
        const emergencyObj = req.body.emergency_contact || {
            name: emergency_contact_name,
            phone: emergency_contact_phone,
            relation: emergency_contact_relation
        };

        // Save emergency contact if any meaningful field provided
        if (emergencyObj && (emergencyObj.name || emergencyObj.phone || emergencyObj.relation)) {
            await client.query(
                "INSERT INTO patient_contacts(patient_id, name, phone, relation) VALUES($1, $2, $3, $4)",
                [patient_id, emergencyObj.name || '', emergencyObj.phone || '', emergencyObj.relation || '']
            );
        }

        // Save insurance if provided with all required fields
        if (insurance && insurance.provider_id && insurance.policy_number && insurance.expiration_date) {
            const coverage_details = {
                coverage_percentage: insurance.coverage_percentage || 80,
                max_claim: insurance.max_claim || null,
                deductible: insurance.deductible || null
            };

            await client.query(
                "INSERT INTO patient_insurance(patient_id, provider_id, policy_number, coverage_details, expiration_date, is_active) VALUES($1, $2, $3, $4, $5, $6)",
                [patient_id, insurance.provider_id, insurance.policy_number, JSON.stringify(coverage_details), insurance.expiration_date, true]
            );
        }

        await client.query('COMMIT');
        
        // Return the complete patient data
        const completePatient = await pool.query(`
            SELECT p.*, 
                   a.line1, a.line2, a.city, a.state, a.postal_code,
                   ec.name as emergency_contact_name,
                   ec.phone as emergency_contact_phone,
                   ec.relation as emergency_contact_relation
            FROM patients p
            LEFT JOIN addresses a ON p.address_id = a.id
            LEFT JOIN patient_contacts ec ON p.id = ec.patient_id
            WHERE p.id = $1
        `, [patient_id]);

        res.json(completePatient.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error registering patient:', err);
        res.status(500).json({ error: "Error inserting patient data" });
    } finally {
        client.release();
    }
};
// ...existing code...
const getPatientById = async (req, res) => {
    try {
        const { id } = req.params;
        
        // If user is a doctor, verify they have access to this patient
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            // Check if doctor has any appointments with this patient
            const accessCheck = await pool.query(
                'SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND patient_id = $2',
                [medicalStaffId, id]
            );
            
            if (parseInt(accessCheck.rows[0].count) === 0) {
                return res.status(403).json({ error: "Access denied. You do not have appointments with this patient." });
            }
        }
        
        // Get patient with address and emergency contact
        const patientResult = await pool.query(`
            SELECT p.*, 
                   a.line1, a.line2, a.city, a.state, a.postal_code,
                   ec.name as emergency_contact_name,
                   ec.phone as emergency_contact_phone,
                   ec.relation as emergency_contact_relation,
                   b.name as branch_name
            FROM patients p
            LEFT JOIN addresses a ON p.address_id = a.id
            LEFT JOIN patient_contacts ec ON p.id = ec.patient_id
            LEFT JOIN branches b ON p.registered_branch = b.id
            WHERE p.id = $1
        `, [id]);

        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: "Patient not found" });
        }

        // Get patient insurance
        const insuranceResult = await pool.query(`
            SELECT pi.*, ip.name as provider_name
            FROM patient_insurance pi
            JOIN insurance_providers ip ON pi.provider_id = ip.id
            WHERE pi.patient_id = $1 AND pi.is_active = true
        `, [id]);

        const patient = patientResult.rows[0];
        patient.insurance = insuranceResult.rows;

        res.json(patient);
    } catch (err) {
        console.error('Error getting patient:', err);
        res.status(500).json({ error: "Error getting patient data" });
    }
};

const updatePatient = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { id } = req.params;
        const {
            first_name,
            last_name,
            date_of_birth,
            gender,
            phone,
            email,
            address,
            registered_branch,
            is_active
        } = req.body;

        // Update address if provided
        if (address) {
            await client.query(`
                UPDATE addresses 
                SET line1 = COALESCE($1, line1),
                    line2 = COALESCE($2, line2),
                    city = COALESCE($3, city),
                    state = COALESCE($4, state),
                    postal_code = COALESCE($5, postal_code)
                WHERE id = (SELECT address_id FROM patients WHERE id = $6)
            `, [address.line1, address.line2, address.city, address.state, address.postal_code, id]);
        }

        // Update patient
        const result = await client.query(`
            UPDATE patients
            SET first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                date_of_birth = COALESCE($3, date_of_birth),
                gender = COALESCE($4, gender),
                phone = COALESCE($5, phone),
                email = COALESCE($6, email),
                registered_branch = COALESCE($7, registered_branch),
                is_active = COALESCE($8, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9
            RETURNING *
        `, [first_name, last_name, date_of_birth, gender, phone, email, registered_branch, is_active, id]);

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Patient not found" });
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating patient:', err);
        res.status(500).json({ error: "Error updating patient data" });
    } finally {
        client.release();
    }
};

const deletePatient = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Soft delete - set is_active to false
        const result = await pool.query(
            'UPDATE patients SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Patient not found" });
        }

        res.json({ message: "Patient deactivated successfully", patient: result.rows[0] });
    } catch (err) {
        console.error('Error deleting patient:', err);
        res.status(500).json({ error: "Error deleting patient" });
    }
};

const searchPatients = async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.trim() === '') {
            return res.status(400).json({ error: "Search query is required" });
        }

        const searchTerm = q.trim();

        // Check if search term is a number (possible patient ID or phone)
        const isNumeric = /^\d+$/.test(searchTerm);

        let query;
        let params;

        // Check if user is a doctor to filter results
        const isDoctor = req.user && req.user.role === 'doctor';
        let medicalStaffId = null;
        
        if (isDoctor) {
            medicalStaffId = await getUserMedicalStaffId(req.user.id);
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
        }

        if (isNumeric) {
            // Search by ID or phone
            if (isDoctor) {
                query = `
                    SELECT DISTINCT p.id, p.first_name, p.last_name, p.phone, p.date_of_birth, p.email
                    FROM patients p
                    JOIN appointments a ON p.id = a.patient_id
                    WHERE (p.id = $1 OR p.phone LIKE $2)
                      AND p.is_active = true
                      AND a.doctor_id = $3
                    ORDER BY p.id
                    LIMIT 20
                `;
                params = [parseInt(searchTerm), `%${searchTerm}%`, medicalStaffId];
            } else {
                query = `
                    SELECT id, first_name, last_name, phone, date_of_birth, email
                    FROM patients
                    WHERE (id = $1 OR phone LIKE $2)
                      AND is_active = true
                    ORDER BY id
                    LIMIT 20
                `;
                params = [parseInt(searchTerm), `%${searchTerm}%`];
            }
        } else {
            // Search by name (case-insensitive, partial match)
            if (isDoctor) {
                query = `
                    SELECT DISTINCT p.id, p.first_name, p.last_name, p.phone, p.date_of_birth, p.email
                    FROM patients p
                    JOIN appointments a ON p.id = a.patient_id
                    WHERE (
                        LOWER(p.first_name) LIKE LOWER($1)
                        OR LOWER(p.last_name) LIKE LOWER($1)
                        OR LOWER(CONCAT(p.first_name, ' ', p.last_name)) LIKE LOWER($1)
                    )
                    AND p.is_active = true
                    AND a.doctor_id = $2
                    ORDER BY p.first_name, p.last_name
                    LIMIT 20
                `;
                params = [`%${searchTerm}%`, medicalStaffId];
            } else {
                query = `
                    SELECT id, first_name, last_name, phone, date_of_birth, email
                    FROM patients
                    WHERE (
                        LOWER(first_name) LIKE LOWER($1)
                        OR LOWER(last_name) LIKE LOWER($1)
                        OR LOWER(CONCAT(first_name, ' ', last_name)) LIKE LOWER($1)
                    )
                    AND is_active = true
                    ORDER BY first_name, last_name
                    LIMIT 20
                `;
                params = [`%${searchTerm}%`];
            }
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error searching patients:', err);
        res.status(500).json({ error: "Error searching patients" });
    }
};

const getPatientOutstanding = async (req, res) => {
    try {
        const { id } = req.params;
        
        // If user is a doctor, verify they have access to this patient
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            // Check if doctor has any appointments with this patient
            const accessCheck = await pool.query(
                'SELECT COUNT(*) as count FROM appointments WHERE doctor_id = $1 AND patient_id = $2',
                [medicalStaffId, id]
            );
            
            if (parseInt(accessCheck.rows[0].count) === 0) {
                return res.status(403).json({ error: "Access denied. You do not have appointments with this patient." });
            }
        }
        
        const result = await pool.query(`
            SELECT 
                COALESCE(SUM(i.total_amount - COALESCE(paid.total_paid, 0)), 0) as outstanding_balance
            FROM invoices i
            LEFT JOIN (
                SELECT invoice_id, SUM(amount) as total_paid
                FROM payments
                GROUP BY invoice_id
            ) paid ON i.id = paid.invoice_id
            WHERE i.patient_id = $1 
              AND i.status IN ('Draft', 'Sent', 'Overdue')
        `, [id]);

        res.json({
            patient_id: id,
            outstanding_balance: parseFloat(result.rows[0].outstanding_balance) || 0
        });
    } catch (err) {
        console.error('Error getting patient outstanding balance:', err);
        res.status(500).json({ error: "Error getting patient outstanding balance" });
    }
};

const addPatientInsurance = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            provider_id,
            policy_number,
            coverage_percentage,
            max_claim,
            deductible,
            expiration_date
        } = req.body;

        if (!provider_id || !policy_number || !expiration_date) {
            return res.status(400).json({ 
                error: "Provider ID, policy number, and expiration date are required" 
            });
        }

        const coverage_details = {
            coverage_percentage: coverage_percentage || 80,
            max_claim: max_claim || null,
            deductible: deductible || null
        };

        const result = await pool.query(
            `INSERT INTO patient_insurance(patient_id, provider_id, policy_number, coverage_details, expiration_date, is_active)
             VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, provider_id, policy_number, JSON.stringify(coverage_details), expiration_date, true]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding patient insurance:', err);
        if (err.code === '23505') { // Unique constraint violation
            res.status(409).json({ error: "This insurance policy already exists for the patient" });
        } else {
            res.status(500).json({ error: "Error adding patient insurance" });
        }
    }
};

const updatePatientInsurance = async (req, res) => {
    try {
        const { id, insuranceId } = req.params;
        const {
            provider_id,
            policy_number,
            coverage_percentage,
            max_claim,
            deductible,
            expiration_date
        } = req.body;

        // Build coverage_details object
        const coverage_details = {};
        if (coverage_percentage !== undefined) coverage_details.coverage_percentage = coverage_percentage;
        if (max_claim !== undefined) coverage_details.max_claim = max_claim;
        if (deductible !== undefined) coverage_details.deductible = deductible;

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (provider_id) {
            updates.push(`provider_id = $${paramCount++}`);
            values.push(provider_id);
        }
        if (policy_number) {
            updates.push(`policy_number = $${paramCount++}`);
            values.push(policy_number);
        }
        if (Object.keys(coverage_details).length > 0) {
            updates.push(`coverage_details = $${paramCount++}`);
            values.push(JSON.stringify(coverage_details));
        }
        if (expiration_date) {
            updates.push(`expiration_date = $${paramCount++}`);
            values.push(expiration_date);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: "No fields to update" });
        }

        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(insuranceId, id);

        const result = await pool.query(
            `UPDATE patient_insurance
             SET ${updates.join(', ')}
             WHERE id = $${paramCount++} AND patient_id = $${paramCount++}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insurance policy not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating patient insurance:', err);
        res.status(500).json({ error: "Error updating patient insurance" });
    }
};

const deletePatientInsurance = async (req, res) => {
    try {
        const { id, insuranceId } = req.params;

        // Soft delete - set is_active to false
        const result = await pool.query(
            `UPDATE patient_insurance
             SET is_active = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND patient_id = $2
             RETURNING *`,
            [insuranceId, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insurance policy not found" });
        }

        res.json({ message: "Insurance policy deactivated successfully", insurance: result.rows[0] });
    } catch (err) {
        console.error('Error deleting patient insurance:', err);
        res.status(500).json({ error: "Error deleting patient insurance" });
    }
};

module.exports = {
    getAllPatients,
    registerPatient,
    getPatientById,
    updatePatient,
    deletePatient,
    searchPatients,
    getPatientOutstanding,
    addPatientInsurance,
    updatePatientInsurance,
    deletePatientInsurance
}
const pool = require('../config/db');

const getAllPatients = async (req, res) => {
    try {
        const allPatients = await pool.query("SELECT * FROM patients");
        res.json(allPatients.rows);
    } catch {
        res.status(500).json("Error getting patient data");
    }
};

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
            is_active
        } = req.body;

        // First, create the address
        const addressResult = await client.query(
            "INSERT INTO addresses(line1, line2, city, state, postal_code) VALUES($1, $2, $3, $4, $5) RETURNING id",
            [address.line1, address.line2 || null, address.city, address.state || null, address.postal_code || null]
        );
        const address_id = addressResult.rows[0].id;

        // Then create the patient with the address_id
        const newPatient = await client.query(
            "INSERT INTO patients(first_name, last_name, date_of_birth, gender, address_id, phone, email, registered_branch, is_active) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
            [first_name, last_name, date_of_birth, gender, address_id, phone, email, registered_branch, is_active !== undefined ? is_active : true]
        );

        await client.query('COMMIT');
        res.json(newPatient.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error registering patient:', err);
        res.status(500).json({ error: "Error inserting patient data" });
    } finally {
        client.release();
    }
};

const getPatientById = async (req, res) => {
    try {
        const { id } = req.params;
        
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

const getPatientOutstanding = async (req, res) => {
    try {
        const { id } = req.params;
        
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

module.exports = {
    getAllPatients,
    registerPatient,
    getPatientById,
    updatePatient,
    deletePatient,
    getPatientOutstanding
}
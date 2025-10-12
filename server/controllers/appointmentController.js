const pool = require('../config/db');

const getAllAppointments = async (req, res) => {
    try {
        const { branch_id, doctor_id, patient_id, status, start_date, end_date } = req.query;

        let query = `
            SELECT a.*,
                   p.first_name as patient_first_name, p.last_name as patient_last_name,
                   m.first_name as doctor_first_name, m.last_name as doctor_last_name,
                   sp.name as specialty,
                   b.name as branch_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN medical_staff m ON a.doctor_id = m.id
            LEFT JOIN specialties sp ON m.specialty_id = sp.id
            JOIN branches b ON a.branch_id = b.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (branch_id) {
            query += ` AND a.branch_id = $${paramCount++}`;
            params.push(branch_id);
        }
        if (doctor_id) {
            query += ` AND a.doctor_id = $${paramCount++}`;
            params.push(doctor_id);
        }
        if (patient_id) {
            query += ` AND a.patient_id = $${paramCount++}`;
            params.push(patient_id);
        }
        if (status) {
            query += ` AND a.status = $${paramCount++}`;
            params.push(status);
        }
        if (start_date) {
            query += ` AND a.appointment_datetime >= $${paramCount++}`;
            params.push(start_date);
        }
        if (end_date) {
            query += ` AND a.appointment_datetime <= $${paramCount++}`;
            params.push(end_date);
        }

        query += ' ORDER BY a.appointment_datetime DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting appointments:', err);
        res.status(500).json({ error: "Error getting appointment data" });
    }
};

const getAppointmentById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT a.*,
                   p.first_name as patient_first_name, p.last_name as patient_last_name,
                   m.first_name as doctor_first_name, m.last_name as doctor_last_name,
                   sp.name as specialty,
                   b.name as branch_name
            FROM appointments a
            JOIN patients p ON a.patient_id = p.id
            JOIN medical_staff m ON a.doctor_id = m.id
            LEFT JOIN specialties sp ON m.specialty_id = sp.id
            JOIN branches b ON a.branch_id = b.id
            WHERE a.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting appointment:', err);
        res.status(500).json({ error: "Error getting appointment data" });
    }
};

const createAppointment = async (req, res) => {
    try {
        const {
            patient_id,
            doctor_id,
            branch_id,
            appointment_datetime,
            status,
            type,
            notes
        } = req.body;

        if (!patient_id || !doctor_id || !branch_id || !appointment_datetime) {
            return res.status(400).json({ error: "Patient, doctor, branch, and appointment datetime are required" });
        }

        const result = await pool.query(
            `INSERT INTO appointments(patient_id, doctor_id, branch_id, appointment_datetime, status, type, notes)
             VALUES($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [patient_id, doctor_id, branch_id, appointment_datetime, status || 'Scheduled', type || 'Regular', notes || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating appointment:', err);
        res.status(500).json({ error: "Error creating appointment" });
    }
};

const updateAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            patient_id,
            doctor_id,
            branch_id,
            appointment_datetime,
            status,
            type,
            notes,
            cancellation_reason
        } = req.body;

        const result = await pool.query(
            `UPDATE appointments
             SET patient_id = COALESCE($1, patient_id),
                 doctor_id = COALESCE($2, doctor_id),
                 branch_id = COALESCE($3, branch_id),
                 appointment_datetime = COALESCE($4, appointment_datetime),
                 status = COALESCE($5, status),
                 type = COALESCE($6, type),
                 notes = COALESCE($7, notes),
                 cancellation_reason = COALESCE($8, cancellation_reason),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $9
             RETURNING *`,
            [patient_id, doctor_id, branch_id, appointment_datetime, status, type, notes, cancellation_reason, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating appointment:', err);
        res.status(500).json({ error: "Error updating appointment" });
    }
};

const deleteAppointment = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM appointments WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        res.json({ message: "Appointment deleted successfully" });
    } catch (err) {
        console.error('Error deleting appointment:', err);
        res.status(500).json({ error: "Error deleting appointment" });
    }
};

module.exports = {
    getAllAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointment,
    deleteAppointment
};

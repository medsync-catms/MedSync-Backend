const pool = require('../config/db');
const { getUserMedicalStaffId } = require('../middleware/auth');

// Validation helper functions
const checkDoctorConflict = async (doctor_id, appointment_datetime, exclude_appointment_id = null) => {
    try {
        // Check for appointments within 30 minutes before and after
        const appointmentTime = new Date(appointment_datetime);
        const startWindow = new Date(appointmentTime.getTime() - 30 * 60000); // 30 minutes before
        const endWindow = new Date(appointmentTime.getTime() + 30 * 60000); // 30 minutes after

        let query = `
            SELECT COUNT(*) as count
            FROM appointments
            WHERE doctor_id = $1
              AND status NOT IN ('Cancelled', 'No Show')
              AND appointment_datetime BETWEEN $2 AND $3
        `;
        const params = [doctor_id, startWindow.toISOString(), endWindow.toISOString()];

        if (exclude_appointment_id) {
            query += ` AND id != $4`;
            params.push(exclude_appointment_id);
        }

        const result = await pool.query(query, params);
        return parseInt(result.rows[0].count) > 0;
    } catch (err) {
        console.error('Error checking doctor conflict:', err);
        throw err;
    }
};

const validateClinicHours = async (branch_id, appointment_datetime) => {
    try {
        const appointmentDate = new Date(appointment_datetime);
        const dayOfWeek = appointmentDate.getDay(); // 0 = Sunday, 6 = Saturday
        const appointmentTime = appointmentDate.toTimeString().slice(0, 8); // HH:MM:SS

        const result = await pool.query(
            `SELECT open_time, close_time
             FROM branch_hours
             WHERE branch_id = $1 AND day_of_week = $2`,
            [branch_id, dayOfWeek]
        );

        if (result.rows.length === 0) {
            return { valid: false, message: 'Clinic is closed on this day' };
        }

        const { open_time, close_time } = result.rows[0];

        if (appointmentTime < open_time || appointmentTime >= close_time) {
            return {
                valid: false,
                message: `Appointment time must be between ${open_time} and ${close_time}`
            };
        }

        return { valid: true };
    } catch (err) {
        console.error('Error validating clinic hours:', err);
        throw err;
    }
};

const validatePatientRegistration = async (patient_id) => {
    try {
        const result = await pool.query(
            `SELECT first_name, last_name, phone, address_id, date_of_birth, is_active
             FROM patients
             WHERE id = $1`,
            [patient_id]
        );

        if (result.rows.length === 0) {
            return { valid: false, message: 'Patient not found' };
        }

        const patient = result.rows[0];

        if (!patient.is_active) {
            return { valid: false, message: 'Patient account is inactive' };
        }

        const missingFields = [];
        if (!patient.first_name) missingFields.push('first name');
        if (!patient.last_name) missingFields.push('last name');
        if (!patient.phone) missingFields.push('phone');
        if (!patient.address_id) missingFields.push('address');
        if (!patient.date_of_birth) missingFields.push('date of birth');

        if (missingFields.length > 0) {
            return {
                valid: false,
                message: `Patient registration incomplete. Missing: ${missingFields.join(', ')}`
            };
        }

        return { valid: true };
    } catch (err) {
        console.error('Error validating patient registration:', err);
        throw err;
    }
};

const getAllAppointments = async (req, res) => {
    try {
        let { branch_id, doctor_id, patient_id, status, start_date, end_date } = req.query;

        // If user is a doctor, override doctor_id filter to show only their appointments
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            doctor_id = medicalStaffId; // Override any doctor_id query param
        }

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

        // If user is a doctor, verify this is their appointment
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            if (result.rows[0].doctor_id !== medicalStaffId) {
                return res.status(403).json({ error: "Access denied. This is not your appointment." });
            }
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
        
        // Handle trigger-generated validation errors
        if (err.message.includes('Doctor has a conflicting appointment')) {
            return res.status(409).json({ 
                error: err.message,
                validation: 'conflict'
            });
        }
        if (err.message.includes('Clinic is closed on this day') || err.message.includes('Appointment time must be between')) {
            return res.status(400).json({ 
                error: err.message,
                validation: 'hours'
            });
        }
        if (err.message.includes('Patient') && err.message.includes('required')) {
            return res.status(400).json({ 
                error: err.message,
                validation: 'patient'
            });
        }
        
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

const getAvailableSlots = async (req, res) => {
    try {
        const { doctor_id, branch_id, date } = req.query;

        if (!doctor_id || !branch_id || !date) {
            return res.status(400).json({ error: "Doctor ID, branch ID, and date are required" });
        }

        // Get branch hours for the given date
        const targetDate = new Date(date);
        const dayOfWeek = targetDate.getDay();

        const hoursResult = await pool.query(
            `SELECT open_time, close_time FROM branch_hours WHERE branch_id = $1 AND day_of_week = $2`,
            [branch_id, dayOfWeek]
        );

        if (hoursResult.rows.length === 0) {
            return res.json({ slots: [], message: 'Clinic is closed on this day' });
        }

        const { open_time, close_time } = hoursResult.rows[0];

        // Get all appointments for the doctor on this date
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        const appointmentsResult = await pool.query(
            `SELECT appointment_datetime FROM appointments
             WHERE doctor_id = $1
               AND appointment_datetime BETWEEN $2 AND $3
               AND status NOT IN ('Cancelled', 'No Show')
             ORDER BY appointment_datetime`,
            [doctor_id, startOfDay.toISOString(), endOfDay.toISOString()]
        );

        const bookedSlots = appointmentsResult.rows.map(row => 
            new Date(row.appointment_datetime).toTimeString().slice(0, 5) // HH:MM
        );

        // Generate 30-minute time slots
        const slots = [];
        const [openHour, openMinute] = open_time.split(':').map(Number);
        const [closeHour, closeMinute] = close_time.split(':').map(Number);

        let currentHour = openHour;
        let currentMinute = openMinute;

        while (
            currentHour < closeHour ||
            (currentHour === closeHour && currentMinute < closeMinute)
        ) {
            const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
            
            // Check if this slot is not booked
            const isBooked = bookedSlots.some(bookedTime => {
                const bookedHour = parseInt(bookedTime.split(':')[0]);
                const bookedMinute = parseInt(bookedTime.split(':')[1]);
                // Consider ±30 minutes as conflict
                const diffMinutes = Math.abs((bookedHour * 60 + bookedMinute) - (currentHour * 60 + currentMinute));
                return diffMinutes < 30;
            });

            if (!isBooked) {
                const datetime = new Date(date);
                datetime.setHours(currentHour, currentMinute, 0, 0);
                slots.push({
                    time: timeStr,
                    datetime: datetime.toISOString(),
                    available: true
                });
            }

            // Move to next 30-minute slot
            currentMinute += 30;
            if (currentMinute >= 60) {
                currentMinute = 0;
                currentHour += 1;
            }
        }

        res.json({ slots, clinic_hours: { open_time, close_time } });
    } catch (err) {
        console.error('Error getting available slots:', err);
        res.status(500).json({ error: "Error getting available slots" });
    }
};

const markNoShow = async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const result = await pool.query(
            `UPDATE appointments
             SET status = 'No Show',
                 cancellation_reason = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [notes || 'Patient did not show up for appointment', id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error marking appointment as no-show:', err);
        res.status(500).json({ error: "Error marking appointment as no-show" });
    }
};

const cancelWithReason = async (req, res) => {
    try {
        const { id } = req.params;
        const { cancellation_reason } = req.body;

        if (!cancellation_reason || cancellation_reason.trim() === '') {
            return res.status(400).json({ error: "Cancellation reason is required" });
        }

        const result = await pool.query(
            `UPDATE appointments
             SET status = 'Cancelled',
                 cancellation_reason = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [cancellation_reason, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error cancelling appointment:', err);
        res.status(500).json({ error: "Error cancelling appointment" });
    }
};

// Treatment Records Management
const addTreatmentRecord = async (req, res) => {
    try {
        const { id } = req.params; // appointment_id
        const { treatment_id, quantity, unit_price, consultation_notes } = req.body;

        if (!treatment_id || !quantity || !unit_price) {
            return res.status(400).json({ error: "Treatment ID, quantity, and unit price are required" });
        }

        // Validate appointment status
        const appointmentCheck = await pool.query(
            'SELECT status FROM appointments WHERE id = $1',
            [id]
        );

        if (appointmentCheck.rows.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        const appointmentStatus = appointmentCheck.rows[0].status;
        if (!['In Progress', 'Completed'].includes(appointmentStatus)) {
            return res.status(400).json({ 
                error: "Treatments can only be added to In Progress or Completed appointments" 
            });
        }

        // Check if invoice already exists for this appointment
        const invoiceCheck = await pool.query(
            'SELECT id FROM invoices WHERE appointment_id = $1',
            [id]
        );

        if (invoiceCheck.rows.length > 0) {
            return res.status(400).json({ 
                error: "Cannot add treatments after invoice has been generated" 
            });
        }

        // Get the doctor's medical staff ID from the appointment
        const doctorResult = await pool.query(
            'SELECT doctor_id FROM appointments WHERE id = $1',
            [id]
        );
        const recorded_by = doctorResult.rows[0].doctor_id;

        const result = await pool.query(
            `INSERT INTO treatment_records(appointment_id, treatment_id, quantity, unit_price, consultation_notes, recorded_by)
             VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
            [id, treatment_id, quantity, unit_price, consultation_notes || null, recorded_by]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error adding treatment record:', err);
        res.status(500).json({ error: "Error adding treatment record" });
    }
};

const getTreatmentRecords = async (req, res) => {
    try {
        const { id } = req.params; // appointment_id

        // If user is a doctor, verify this is their appointment
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            // Check if this appointment belongs to the doctor
            const appointmentCheck = await pool.query(
                'SELECT doctor_id FROM appointments WHERE id = $1',
                [id]
            );
            
            if (appointmentCheck.rows.length === 0) {
                return res.status(404).json({ error: "Appointment not found" });
            }
            
            if (appointmentCheck.rows[0].doctor_id !== medicalStaffId) {
                return res.status(403).json({ error: "Access denied. This is not your appointment." });
            }
        }

        const result = await pool.query(`
            SELECT tr.*,
                   t.name as treatment_name,
                   t.description as treatment_description,
                   tc.name as category_name,
                   m.first_name as doctor_first_name,
                   m.last_name as doctor_last_name
            FROM treatment_records tr
            JOIN treatments t ON tr.treatment_id = t.id
            JOIN treatment_categories tc ON t.category_id = tc.id
            JOIN medical_staff m ON tr.recorded_by = m.id
            WHERE tr.appointment_id = $1
            ORDER BY tr.created_at
        `, [id]);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting treatment records:', err);
        res.status(500).json({ error: "Error getting treatment records" });
    }
};

const updateTreatmentRecord = async (req, res) => {
    try {
        const { id, treatmentRecordId } = req.params;
        const { quantity, unit_price, consultation_notes } = req.body;

        // Check if invoice exists
        const invoiceCheck = await pool.query(
            'SELECT id FROM invoices WHERE appointment_id = $1',
            [id]
        );

        if (invoiceCheck.rows.length > 0) {
            return res.status(400).json({ 
                error: "Cannot modify treatments after invoice has been generated" 
            });
        }

        const result = await pool.query(
            `UPDATE treatment_records
             SET quantity = COALESCE($1, quantity),
                 unit_price = COALESCE($2, unit_price),
                 consultation_notes = COALESCE($3, consultation_notes)
             WHERE id = $4 AND appointment_id = $5
             RETURNING *`,
            [quantity, unit_price, consultation_notes, treatmentRecordId, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Treatment record not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating treatment record:', err);
        res.status(500).json({ error: "Error updating treatment record" });
    }
};

const deleteTreatmentRecord = async (req, res) => {
    try {
        const { id, treatmentRecordId } = req.params;

        // Check if invoice exists
        const invoiceCheck = await pool.query(
            'SELECT id FROM invoices WHERE appointment_id = $1',
            [id]
        );

        if (invoiceCheck.rows.length > 0) {
            return res.status(400).json({ 
                error: "Cannot delete treatments after invoice has been generated" 
            });
        }

        const result = await pool.query(
            'DELETE FROM treatment_records WHERE id = $1 AND appointment_id = $2 RETURNING *',
            [treatmentRecordId, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Treatment record not found" });
        }

        res.json({ message: "Treatment record deleted successfully" });
    } catch (err) {
        console.error('Error deleting treatment record:', err);
        res.status(500).json({ error: "Error deleting treatment record" });
    }
};

const completeAppointmentWithInvoice = async (req, res) => {
    try {
        const { id } = req.params; // appointment_id

        // Use stored procedure for appointment completion
        const result = await pool.query(
            'SELECT * FROM complete_appointment_workflow($1)',
            [id]
        );

        const workflowResult = result.rows[0];

        if (!workflowResult.success) {
            return res.status(400).json({ error: workflowResult.message });
        }

        res.json({
            message: workflowResult.message,
            invoice: {
                id: workflowResult.invoice_id,
                invoice_number: workflowResult.invoice_number,
                total_amount: workflowResult.total_amount
            },
            appointment_id: id
        });
    } catch (err) {
        console.error('Error completing appointment with invoice:', err);
        res.status(500).json({ error: "Error completing appointment with invoice" });
    }
};

module.exports = {
    getAllAppointments,
    getAppointmentById,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    getAvailableSlots,
    markNoShow,
    cancelWithReason,
    addTreatmentRecord,
    getTreatmentRecords,
    updateTreatmentRecord,
    deleteTreatmentRecord,
    completeAppointmentWithInvoice
};

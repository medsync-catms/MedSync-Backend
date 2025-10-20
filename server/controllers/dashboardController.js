const pool = require('../config/db');
const { getUserMedicalStaffId } = require('../middleware/auth');

const getDashboardStats = async (req, res) => {
    try {
        // Get today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Check if user is a doctor to filter stats
        const isDoctor = req.user && req.user.role === 'doctor';
        let medicalStaffId = null;
        
        if (isDoctor) {
            medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
        }

        // Get appointment statistics for today
        let appointmentQuery = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Scheduled' THEN 1 ELSE 0 END) as scheduled,
                SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled
            FROM appointments
            WHERE appointment_datetime >= $1 AND appointment_datetime < $2
        `;
        
        let appointmentParams = [today, tomorrow];
        
        if (isDoctor) {
            appointmentQuery += ' AND doctor_id = $3';
            appointmentParams.push(medicalStaffId);
        }
        
        const appointmentStats = await pool.query(appointmentQuery, appointmentParams);

        // Get revenue statistics (filtered by doctor's appointments if doctor)
        let revenueQuery = `
            SELECT 
                COALESCE(SUM(CASE 
                    WHEN i.created_at >= $1 AND i.created_at < $2 
                    THEN i.total_amount 
                    ELSE 0 
                END), 0) as today_revenue,
                COUNT(CASE WHEN i.status IN ('Draft', 'Sent') THEN 1 END) as pending_invoices,
                COALESCE(SUM(CASE 
                    WHEN i.status IN ('Draft', 'Sent', 'Overdue') 
                    THEN i.total_amount 
                    ELSE 0 
                END), 0) as outstanding_total
            FROM invoices i
        `;
        
        let revenueParams = [today, tomorrow];
        
        if (isDoctor) {
            revenueQuery += `
                JOIN appointments a ON i.appointment_id = a.id
                WHERE a.doctor_id = $3
            `;
            revenueParams.push(medicalStaffId);
        }
        
        const revenueStats = await pool.query(revenueQuery, revenueParams);

        // Get insurance claims count (filtered by doctor's appointments if doctor)
        let insuranceQuery = `
            SELECT COUNT(*) as insurance_claims
            FROM invoices i
            JOIN insurance_claims ic ON i.id = ic.invoice_id
        `;
        
        let insuranceParams = [];
        
        if (isDoctor) {
            insuranceQuery = `
                SELECT COUNT(*) as insurance_claims
                FROM invoices i
                JOIN insurance_claims ic ON i.id = ic.invoice_id
                JOIN appointments a ON i.appointment_id = a.id
                WHERE a.doctor_id = $1
            `;
            insuranceParams.push(medicalStaffId);
        }
        
        const insuranceStats = await pool.query(insuranceQuery, insuranceParams);

        res.json({
            appointments: {
                total: parseInt(appointmentStats.rows[0].total) || 0,
                scheduled: parseInt(appointmentStats.rows[0].scheduled) || 0,
                completed: parseInt(appointmentStats.rows[0].completed) || 0,
                cancelled: parseInt(appointmentStats.rows[0].cancelled) || 0
            },
            revenue: {
                today: parseFloat(revenueStats.rows[0].today_revenue) || 0,
                pendingInvoices: parseInt(revenueStats.rows[0].pending_invoices) || 0,
                outstanding: parseFloat(revenueStats.rows[0].outstanding_total) || 0
            },
            insurance: {
                claims: parseInt(insuranceStats.rows[0].insurance_claims) || 0
            }
        });
    } catch (err) {
        console.error('Error getting dashboard stats:', err);
        res.status(500).json({ error: "Error getting dashboard statistics" });
    }
};

const getUpcomingAppointments = async (req, res) => {
    try {
        const { hours = 2 } = req.query;
        const now = new Date();
        const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);

        // Check if user is a doctor to filter appointments
        const isDoctor = req.user && req.user.role === 'doctor';
        let medicalStaffId = null;
        
        if (isDoctor) {
            medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
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
            WHERE a.appointment_datetime >= $1 
              AND a.appointment_datetime <= $2
              AND a.status IN ('Scheduled', 'Confirmed')
        `;
        
        const params = [now, futureTime];
        
        if (isDoctor) {
            query += ' AND a.doctor_id = $3';
            params.push(medicalStaffId);
        }
        
        query += ' ORDER BY a.appointment_datetime ASC';

        const result = await pool.query(query, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting upcoming appointments:', err);
        res.status(500).json({ error: "Error getting upcoming appointments" });
    }
};

module.exports = {
    getDashboardStats,
    getUpcomingAppointments
};


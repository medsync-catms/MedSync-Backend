const pool = require('../config/db');

const getBranchSummary = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        let dateFilter = '';
        const params = [];
        if (start_date && end_date) {
            dateFilter = 'AND a.appointment_datetime >= $1 AND a.appointment_datetime <= $2';
            params.push(start_date, end_date);
        }

        const result = await pool.query(`
            SELECT 
                b.name as branch,
                COUNT(a.id) as total,
                SUM(CASE WHEN a.status = 'Scheduled' OR a.status = 'Confirmed' THEN 1 ELSE 0 END) as scheduled,
                SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN a.status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled,
                CASE 
                    WHEN COUNT(a.id) > 0 
                    THEN ROUND(100.0 * SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) / COUNT(a.id), 0)
                    ELSE 0 
                END as completion_rate
            FROM branches b
            LEFT JOIN appointments a ON b.id = a.branch_id ${dateFilter}
            GROUP BY b.id, b.name
            ORDER BY b.name
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting branch summary:', err);
        res.status(500).json({ error: "Error getting branch summary report" });
    }
};

const getDoctorRevenue = async (req, res) => {
    try {
        const { start_date, end_date, branch_id } = req.query;
        
        let dateFilter = '';
        let branchFilter = '';
        const params = [];
        let paramCount = 1;

        if (start_date && end_date) {
            dateFilter = `AND a.appointment_datetime >= $${paramCount++} AND a.appointment_datetime <= $${paramCount++}`;
            params.push(start_date, end_date);
        }
        if (branch_id) {
            branchFilter = `AND a.branch_id = $${paramCount++}`;
            params.push(branch_id);
        }

        const result = await pool.query(`
            SELECT 
                m.first_name || ' ' || m.last_name as doctor_name,
                m.specialty,
                b.name as branch_name,
                COUNT(DISTINCT a.id) as total_appointments,
                COUNT(DISTINCT CASE WHEN a.status = 'Completed' THEN a.id END) as completed_appointments,
                COALESCE(SUM(i.total_amount), 0) as total_revenue,
                COALESCE(SUM(CASE WHEN i.status = 'Paid' THEN i.total_amount ELSE 0 END), 0) as collected_revenue,
                COALESCE(SUM(CASE WHEN i.status IN ('Draft', 'Sent', 'Overdue') THEN i.total_amount ELSE 0 END), 0) as outstanding_revenue
            FROM medical_staff m
            LEFT JOIN appointments a ON m.id = a.doctor_id ${dateFilter} ${branchFilter}
            LEFT JOIN invoices i ON a.patient_id = i.patient_id 
                AND DATE(a.appointment_datetime) = DATE(i.created_at)
            LEFT JOIN branches b ON m.branch_id = b.id
            WHERE m.role = 'Doctor' OR m.role = 'doctor'
            GROUP BY m.id, m.first_name, m.last_name, m.specialty, b.name
            ORDER BY total_revenue DESC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting doctor revenue:', err);
        res.status(500).json({ error: "Error getting doctor revenue report" });
    }
};

const getOutstandingBalances = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id as patient_id,
                p.first_name || ' ' || p.last_name as patient_name,
                p.phone as contact,
                i.invoice_number,
                i.id as invoice_id,
                i.total_amount,
                COALESCE(SUM(pay.amount), 0) as paid_amount,
                i.total_amount - COALESCE(SUM(pay.amount), 0) as amount_due,
                i.created_at as invoice_date,
                DATE_PART('day', CURRENT_TIMESTAMP - i.created_at) as days_overdue,
                i.status
            FROM invoices i
            JOIN patients p ON i.patient_id = p.id
            LEFT JOIN payments pay ON i.id = pay.invoice_id
            WHERE i.status IN ('Sent', 'Overdue')
            GROUP BY p.id, p.first_name, p.last_name, p.phone, i.id, i.invoice_number, i.total_amount, i.created_at, i.status
            HAVING i.total_amount - COALESCE(SUM(pay.amount), 0) > 0
            ORDER BY days_overdue DESC, amount_due DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting outstanding balances:', err);
        res.status(500).json({ error: "Error getting outstanding balances report" });
    }
};

const getTreatmentAnalysis = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        let dateFilter = '';
        const params = [];
        if (start_date && end_date) {
            dateFilter = 'AND ii.created_at >= $1 AND ii.created_at <= $2';
            params.push(start_date, end_date);
        }

        const result = await pool.query(`
            SELECT 
                tc.name as category,
                COUNT(DISTINCT ii.id) as treatment_count,
                COALESCE(SUM(ii.quantity), 0) as total_quantity,
                COALESCE(SUM(ii.subtotal), 0) as total_revenue,
                COALESCE(AVG(ii.unit_price), 0) as avg_price
            FROM treatment_categories tc
            LEFT JOIN treatments t ON tc.id = t.category_id
            LEFT JOIN invoice_items ii ON t.id = ii.treatment_id ${dateFilter}
            GROUP BY tc.id, tc.name
            ORDER BY total_revenue DESC
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting treatment analysis:', err);
        res.status(500).json({ error: "Error getting treatment analysis report" });
    }
};

module.exports = {
    getBranchSummary,
    getDoctorRevenue,
    getOutstandingBalances,
    getTreatmentAnalysis
};


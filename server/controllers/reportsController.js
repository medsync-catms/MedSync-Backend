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
        // Use the database view for better performance
        const result = await pool.query(`
            SELECT *
            FROM patient_outstanding_summary
            ORDER BY outstanding_balance DESC, oldest_overdue_date ASC NULLS LAST
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

// New report endpoints using database views
const getInsuranceClaimAnalytics = async (req, res) => {
    try {
        const { months_back } = req.query;
        const months = parseInt(months_back) || 12;
        
        const result = await pool.query(`
            SELECT *
            FROM insurance_claim_analytics
            WHERE month >= CURRENT_DATE - INTERVAL '${months} months'
            ORDER BY month DESC, provider_name
        `);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting insurance claim analytics:', err);
        res.status(500).json({ error: "Error getting insurance claim analytics" });
    }
};

const getAppointmentAnalytics = async (req, res) => {
    try {
        const { months_back, branch_id } = req.query;
        const months = parseInt(months_back) || 12;
        
        let query = `
            SELECT *
            FROM appointment_analytics
            WHERE month >= CURRENT_DATE - INTERVAL '${months} months'
        `;
        
        const params = [];
        if (branch_id) {
            query += ' AND branch_name = $1';
            params.push(branch_id);
        }
        
        query += ' ORDER BY month DESC, branch_name, specialty';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting appointment analytics:', err);
        res.status(500).json({ error: "Error getting appointment analytics" });
    }
};

const getDailyAppointmentSummary = async (req, res) => {
    try {
        const { start_date, end_date, branch_id } = req.query;
        
        let query = `
            SELECT *
            FROM daily_appointment_summary
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 1;
        
        if (start_date) {
            query += ` AND appointment_date >= $${paramCount++}`;
            params.push(start_date);
        }
        
        if (end_date) {
            query += ` AND appointment_date <= $${paramCount++}`;
            params.push(end_date);
        }
        
        if (branch_id) {
            query += ` AND branch_name = $${paramCount++}`;
            params.push(branch_id);
        }
        
        query += ' ORDER BY appointment_date DESC, branch_name';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting daily appointment summary:', err);
        res.status(500).json({ error: "Error getting daily appointment summary" });
    }
};

const getRevenueAnalytics = async (req, res) => {
    try {
        const { months_back, branch_id } = req.query;
        const months = parseInt(months_back) || 12;
        
        let query = `
            SELECT *
            FROM revenue_analytics
            WHERE month >= CURRENT_DATE - INTERVAL '${months} months'
        `;
        
        const params = [];
        if (branch_id) {
            query += ' AND branch_name = $1';
            params.push(branch_id);
        }
        
        query += ' ORDER BY month DESC, branch_name';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting revenue analytics:', err);
        res.status(500).json({ error: "Error getting revenue analytics" });
    }
};

const getReconciliationReport = async (req, res) => {
    try {
        const { target_date } = req.query;
        const date = target_date || new Date().toISOString().split('T')[0];
        
        // Use stored procedure for payment reconciliation
        const result = await pool.query(
            'SELECT * FROM reconcile_daily_payments($1)',
            [date]
        );
        
        res.json({
            date: date,
            reconciliation: result.rows,
            summary: {
                total_transactions: result.rows.reduce((sum, row) => sum + parseInt(row.transaction_count), 0),
                total_amount: result.rows.reduce((sum, row) => sum + parseFloat(row.total_amount), 0),
                methods: result.rows.length
            }
        });
    } catch (err) {
        console.error('Error getting reconciliation report:', err);
        res.status(500).json({ error: "Error getting reconciliation report" });
    }
};

const getNotificationReport = async (req, res) => {
    try {
        const { start_date, end_date, type } = req.query;
        
        let query = `
            SELECT 
                n.type,
                n.status,
                COUNT(*) as count,
                COUNT(CASE WHEN n.sent_at IS NOT NULL THEN 1 END) as sent_count,
                COUNT(CASE WHEN n.status = 'failed' THEN 1 END) as failed_count
            FROM notifications n
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 1;
        
        if (start_date) {
            query += ` AND n.created_at >= $${paramCount++}`;
            params.push(start_date);
        }
        
        if (end_date) {
            query += ` AND n.created_at <= $${paramCount++}`;
            params.push(end_date);
        }
        
        if (type) {
            query += ` AND n.type = $${paramCount++}`;
            params.push(type);
        }
        
        query += ' GROUP BY n.type, n.status ORDER BY n.type, n.status';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting notification report:', err);
        res.status(500).json({ error: "Error getting notification report" });
    }
};

module.exports = {
    getBranchSummary,
    getDoctorRevenue,
    getOutstandingBalances,
    getTreatmentAnalysis,
    getInsuranceClaimAnalytics,
    getAppointmentAnalytics,
    getDailyAppointmentSummary,
    getRevenueAnalytics,
    getReconciliationReport,
    getNotificationReport
};


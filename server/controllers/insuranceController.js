const pool = require('../config/db');

const getAllProviders = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM insurance_providers WHERE is_active = true ORDER BY name'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting insurance providers:', err);
        res.status(500).json({ error: "Error getting insurance providers" });
    }
};

const getProviderById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM insurance_providers WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insurance provider not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting insurance provider:', err);
        res.status(500).json({ error: "Error getting insurance provider" });
    }
};

const getAllClaims = async (req, res) => {
    try {
        const { patient_id, provider_id, status } = req.query;

        let query = `
            SELECT ic.*,
                   i.invoice_number,
                   p.first_name as patient_first_name, 
                   p.last_name as patient_last_name,
                   ip.provider_id,
                   prov.name as provider_name
            FROM insurance_claims ic
            JOIN invoices i ON ic.invoice_id = i.id
            JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
            JOIN patients p ON pi.patient_id = p.id
            JOIN insurance_providers prov ON pi.provider_id = prov.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (patient_id) {
            query += ` AND p.id = $${paramCount++}`;
            params.push(patient_id);
        }
        if (provider_id) {
            query += ` AND pi.provider_id = $${paramCount++}`;
            params.push(provider_id);
        }
        if (status) {
            query += ` AND ic.status = $${paramCount++}`;
            params.push(status);
        }

        query += ' ORDER BY ic.submission_date DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting insurance claims:', err);
        res.status(500).json({ error: "Error getting insurance claims data" });
    }
};

const getClaimById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT ic.*,
                   i.invoice_number, i.total_amount, i.status as invoice_status,
                   p.first_name as patient_first_name, 
                   p.last_name as patient_last_name,
                   p.id as patient_id,
                   pi.policy_number,
                   pi.coverage_details,
                   pi.expiration_date,
                   prov.name as provider_name,
                   prov.id as provider_id
            FROM insurance_claims ic
            JOIN invoices i ON ic.invoice_id = i.id
            JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
            JOIN patients p ON pi.patient_id = p.id
            JOIN insurance_providers prov ON pi.provider_id = prov.id
            WHERE ic.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insurance claim not found" });
        }

        const claim = result.rows[0];

        // Fetch payment history for the linked invoice
        const paymentsResult = await pool.query(`
            SELECT p.*, u.username as processed_by_username
            FROM payments p
            LEFT JOIN users u ON p.processed_by = u.id
            WHERE p.invoice_id = $1
            ORDER BY p.payment_date DESC
        `, [claim.invoice_id]);

        claim.payments = paymentsResult.rows;

        res.json(claim);
    } catch (err) {
        console.error('Error getting insurance claim:', err);
        res.status(500).json({ error: "Error getting insurance claim data" });
    }
};

const createClaim = async (req, res) => {
    try {
        const {
            invoice_id,
            patient_insurance_id,
            claim_amount,
            status
        } = req.body;

        if (!invoice_id || !patient_insurance_id || !claim_amount) {
            return res.status(400).json({ error: "Invoice ID, patient insurance ID, and claim amount are required" });
        }

        // Generate claim number (format: CLM-YYYYMMDD-XXXX)
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const claim_number = `CLM-${dateStr}-${randomNum}`;

        const result = await pool.query(
            `INSERT INTO insurance_claims(invoice_id, patient_insurance_id, claim_number, claim_amount, status)
             VALUES($1, $2, $3, $4, $5) RETURNING *`,
            [invoice_id, patient_insurance_id, claim_number, claim_amount, status || 'Submitted']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating insurance claim:', err);
        res.status(500).json({ error: "Error creating insurance claim" });
    }
};

const updateClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const { claim_amount } = req.body;

        // Check current claim status
        const checkResult = await pool.query(
            'SELECT status FROM insurance_claims WHERE id = $1',
            [id]
        );

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: "Insurance claim not found" });
        }

        // Only allow editing claim_amount when status is 'Submitted'
        if (checkResult.rows[0].status !== 'Submitted') {
            return res.status(400).json({ 
                error: "Only claims with 'Submitted' status can be edited" 
            });
        }

        if (!claim_amount) {
            return res.status(400).json({ error: "Claim amount is required" });
        }

        const result = await pool.query(
            `UPDATE insurance_claims
             SET claim_amount = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [claim_amount, id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating insurance claim:', err);
        res.status(500).json({ error: "Error updating insurance claim" });
    }
};

const deleteClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM insurance_claims WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insurance claim not found" });
        }

        res.json({ message: "Insurance claim deleted successfully" });
    } catch (err) {
        console.error('Error deleting insurance claim:', err);
        res.status(500).json({ error: "Error deleting insurance claim" });
    }
};

const getClaimStats = async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_claims,
                SUM(CASE WHEN status = 'Submitted' OR status = 'Under Review' THEN 1 ELSE 0 END) as submitted_claims,
                SUM(CASE WHEN status = 'Approved' OR status = 'Paid' THEN 1 ELSE 0 END) as approved_claims,
                SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected_claims,
                COALESCE(SUM(CASE WHEN status = 'Paid' THEN approved_amount ELSE 0 END), 0) as total_reimbursed
            FROM insurance_claims
        `);

        res.json({
            total: parseInt(stats.rows[0].total_claims) || 0,
            submitted: parseInt(stats.rows[0].submitted_claims) || 0,
            approved: parseInt(stats.rows[0].approved_claims) || 0,
            rejected: parseInt(stats.rows[0].rejected_claims) || 0,
            totalReimbursed: parseFloat(stats.rows[0].total_reimbursed) || 0
        });
    } catch (err) {
        console.error('Error getting insurance claim stats:', err);
        res.status(500).json({ error: "Error getting insurance claim statistics" });
    }
};

const approveClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const { approved_amount } = req.body;

        if (!approved_amount || approved_amount <= 0) {
            return res.status(400).json({ error: "Valid approved amount is required" });
        }

        const result = await pool.query(
            `UPDATE insurance_claims
             SET status = 'Approved',
                 approved_amount = $1,
                 response_date = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [approved_amount, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insurance claim not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error approving insurance claim:', err);
        res.status(500).json({ error: "Error approving insurance claim" });
    }
};

const rejectClaim = async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body;

        if (!rejection_reason || rejection_reason.trim() === '') {
            return res.status(400).json({ error: "Rejection reason is required" });
        }

        const result = await pool.query(
            `UPDATE insurance_claims
             SET status = 'Rejected',
                 rejection_reason = $1,
                 response_date = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [rejection_reason, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insurance claim not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error rejecting insurance claim:', err);
        res.status(500).json({ error: "Error rejecting insurance claim" });
    }
};

const resubmitClaim = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch the original claim
        const originalClaim = await pool.query(
            'SELECT * FROM insurance_claims WHERE id = $1',
            [id]
        );

        if (originalClaim.rows.length === 0) {
            return res.status(404).json({ error: "Insurance claim not found" });
        }

        const claim = originalClaim.rows[0];

        // Only rejected claims can be resubmitted
        if (claim.status !== 'Rejected') {
            return res.status(400).json({ 
                error: "Only rejected claims can be resubmitted" 
            });
        }

        // Generate new claim number
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const new_claim_number = `CLM-${dateStr}-${randomNum}`;

        // Create new claim
        const newClaim = await pool.query(
            `INSERT INTO insurance_claims(
                invoice_id, 
                patient_insurance_id, 
                claim_number, 
                claim_amount, 
                status
             )
             VALUES($1, $2, $3, $4, 'Submitted') 
             RETURNING *`,
            [
                claim.invoice_id,
                claim.patient_insurance_id,
                new_claim_number,
                claim.claim_amount
            ]
        );

        // Mark original claim as cancelled
        await pool.query(
            `UPDATE insurance_claims
             SET status = 'Cancelled',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [id]
        );

        res.status(201).json(newClaim.rows[0]);
    } catch (err) {
        console.error('Error resubmitting insurance claim:', err);
        res.status(500).json({ error: "Error resubmitting insurance claim" });
    }
};

module.exports = {
    getAllProviders,
    getProviderById,
    getAllClaims,
    getClaimById,
    createClaim,
    updateClaim,
    deleteClaim,
    getClaimStats,
    approveClaim,
    rejectClaim,
    resubmitClaim
};


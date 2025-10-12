const pool = require('../config/db');

const getAllInvoices = async (req, res) => {
    try {
        const { patient_id, status, start_date, end_date } = req.query;

        let query = `
            SELECT i.*,
                   p.first_name as patient_first_name,
                   p.last_name as patient_last_name,
                   COALESCE(
                       (SELECT json_agg(pay) FROM payments pay WHERE pay.invoice_id = i.id),
                       '[]'::json
                   ) as payments
            FROM invoices i
            JOIN patients p ON i.patient_id = p.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (patient_id) {
            query += ` AND i.patient_id = $${paramCount++}`;
            params.push(patient_id);
        }
        if (status) {
            query += ` AND i.status = $${paramCount++}`;
            params.push(status);
        }
        if (start_date) {
            query += ` AND i.created_at >= $${paramCount++}`;
            params.push(start_date);
        }
        if (end_date) {
            query += ` AND i.created_at <= $${paramCount++}`;
            params.push(end_date);
        }

        query += ' ORDER BY i.created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting invoices:', err);
        res.status(500).json({ error: "Error getting invoice data" });
    }
};

const getInvoiceById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT i.*,
                   p.first_name as patient_first_name,
                   p.last_name as patient_last_name
            FROM invoices i
            JOIN patients p ON i.patient_id = p.id
            WHERE i.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        // Get associated payments
        const paymentsResult = await pool.query(
            'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
            [id]
        );

        res.json({
            ...result.rows[0],
            payments: paymentsResult.rows
        });
    } catch (err) {
        console.error('Error getting invoice:', err);
        res.status(500).json({ error: "Error getting invoice data" });
    }
};

const createInvoice = async (req, res) => {
    try {
        const {
            patient_id,
            appointment_id,
            invoice_number,
            total_amount,
            status
        } = req.body;

        if (!patient_id || !invoice_number || !total_amount) {
            return res.status(400).json({ error: "Patient, invoice number, and total amount are required" });
        }

        const result = await pool.query(
            `INSERT INTO invoices(patient_id, appointment_id, invoice_number, total_amount, status)
             VALUES($1, $2, $3, $4, $5) RETURNING *`,
            [patient_id, appointment_id || null, invoice_number, total_amount, status || 'Draft']
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            return res.status(400).json({ error: "Invoice number already exists" });
        }
        console.error('Error creating invoice:', err);
        res.status(500).json({ error: "Error creating invoice" });
    }
};

const updateInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            patient_id,
            appointment_id,
            invoice_number,
            total_amount,
            status
        } = req.body;

        const result = await pool.query(
            `UPDATE invoices
             SET patient_id = COALESCE($1, patient_id),
                 appointment_id = COALESCE($2, appointment_id),
                 invoice_number = COALESCE($3, invoice_number),
                 total_amount = COALESCE($4, total_amount),
                 status = COALESCE($5, status),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING *`,
            [patient_id, appointment_id, invoice_number, total_amount, status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating invoice:', err);
        res.status(500).json({ error: "Error updating invoice" });
    }
};

const deleteInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM invoices WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        res.json({ message: "Invoice deleted successfully" });
    } catch (err) {
        console.error('Error deleting invoice:', err);
        res.status(500).json({ error: "Error deleting invoice" });
    }
};

// Payment-related functions
const createPayment = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            invoice_id,
            amount,
            payment_method,
            transaction_reference,
            notes
        } = req.body;

        if (!invoice_id || !amount || !payment_method) {
            return res.status(400).json({ error: "Invoice, amount, and payment method are required" });
        }

        // Create payment
        const paymentResult = await client.query(
            `INSERT INTO payments(invoice_id, amount, payment_method, transaction_reference, processed_by, notes)
             VALUES($1, $2, $3, $4, $5, $6) RETURNING *`,
            [invoice_id, amount, payment_method, transaction_reference || null, req.user.id, notes || null]
        );

        // Get total paid for this invoice
        const totalPaidResult = await client.query(
            'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE invoice_id = $1',
            [invoice_id]
        );
        const totalPaid = parseFloat(totalPaidResult.rows[0].total_paid);

        // Get invoice total
        const invoiceResult = await client.query(
            'SELECT total_amount FROM invoices WHERE id = $1',
            [invoice_id]
        );
        const invoiceTotal = parseFloat(invoiceResult.rows[0].total_amount);

        // Update invoice status based on payment
        let newStatus;
        if (totalPaid >= invoiceTotal) {
            newStatus = 'Paid';
        } else {
            newStatus = 'Sent';
        }

        await client.query(
            'UPDATE invoices SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newStatus, invoice_id]
        );

        await client.query('COMMIT');
        res.status(201).json(paymentResult.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating payment:', err);
        res.status(500).json({ error: "Error creating payment" });
    } finally {
        client.release();
    }
};

const getPaymentsByInvoice = async (req, res) => {
    try {
        const { invoice_id } = req.params;
        const result = await pool.query(
            'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
            [invoice_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting payments:', err);
        res.status(500).json({ error: "Error getting payment data" });
    }
};

module.exports = {
    getAllInvoices,
    getInvoiceById,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    createPayment,
    getPaymentsByInvoice
};

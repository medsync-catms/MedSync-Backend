const pool = require('../config/db');
const { getUserMedicalStaffId } = require('../middleware/auth');

const getAllInvoices = async (req, res) => {
    try {
        const { patient_id, status, start_date, end_date } = req.query;

        // Check if user is a doctor to filter invoices
        const isDoctor = req.user && req.user.role === 'doctor';
        let medicalStaffId = null;
        
        if (isDoctor) {
            medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
        }

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
        `;
        
        // Add join to appointments if doctor
        if (isDoctor) {
            query += ' JOIN appointments a ON i.appointment_id = a.id';
        }
        
        query += ' WHERE 1=1';
        
        const params = [];
        let paramCount = 1;

        // Filter by doctor if applicable
        if (isDoctor) {
            query += ` AND a.doctor_id = $${paramCount++}`;
            params.push(medicalStaffId);
        }

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
                   p.last_name as patient_last_name,
                   a.appointment_datetime,
                   a.type as appointment_type,
                   a.doctor_id
            FROM invoices i
            JOIN patients p ON i.patient_id = p.id
            LEFT JOIN appointments a ON i.appointment_id = a.id
            WHERE i.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        const invoice = result.rows[0];

        // If user is a doctor, verify this invoice is from their appointment
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            // Check if invoice is linked to an appointment and if it belongs to the doctor
            if (!invoice.appointment_id || invoice.doctor_id !== medicalStaffId) {
                return res.status(403).json({ error: "Access denied. This invoice is not from your appointment." });
            }
        }

        // Get associated payments
        const paymentsResult = await pool.query(
            'SELECT * FROM payments WHERE invoice_id = $1 ORDER BY payment_date DESC',
            [id]
        );

        // Get invoice items (treatment records) if invoice is linked to an appointment
        let items = [];
        if (invoice.appointment_id) {
            const itemsResult = await pool.query(`
                SELECT tr.*,
                       t.name as treatment_name,
                       t.description as treatment_description,
                       tc.name as category_name
                FROM treatment_records tr
                JOIN treatments t ON tr.treatment_id = t.id
                JOIN treatment_categories tc ON t.category_id = tc.id
                WHERE tr.appointment_id = $1
                ORDER BY tr.created_at
            `, [invoice.appointment_id]);
            items = itemsResult.rows;
        }

        res.json({
            ...invoice,
            payments: paymentsResult.rows,
            items: items
        });
    } catch (err) {
        console.error('Error getting invoice:', err);
        res.status(500).json({ error: "Error getting invoice data" });
    }
};

const getInvoiceItems = async (req, res) => {
    try {
        const { id } = req.params;

        // Get invoice to find appointment_id and doctor_id
        const invoiceResult = await pool.query(`
            SELECT i.appointment_id, a.doctor_id
            FROM invoices i
            LEFT JOIN appointments a ON i.appointment_id = a.id
            WHERE i.id = $1
        `, [id]);

        if (invoiceResult.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        const { appointment_id, doctor_id } = invoiceResult.rows[0];

        // If user is a doctor, verify this invoice is from their appointment
        if (req.user && req.user.role === 'doctor') {
            const medicalStaffId = await getUserMedicalStaffId(req.user.id);
            
            if (!medicalStaffId) {
                return res.status(403).json({ error: "Medical staff ID not found for user" });
            }
            
            // Check if invoice is linked to an appointment and if it belongs to the doctor
            if (!appointment_id || doctor_id !== medicalStaffId) {
                return res.status(403).json({ error: "Access denied. This invoice is not from your appointment." });
            }
        }

        if (!appointment_id) {
            return res.json([]); // No items if no appointment linked
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
        `, [appointment_id]);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting invoice items:', err);
        res.status(500).json({ error: "Error getting invoice items" });
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

const updateInvoiceStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }

        // Validate status transitions
        const currentInvoice = await pool.query(
            'SELECT status FROM invoices WHERE id = $1',
            [id]
        );

        if (currentInvoice.rows.length === 0) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        const currentStatus = currentInvoice.rows[0].status;

        // Terminal statuses cannot be changed
        if (currentStatus === 'Paid' || currentStatus === 'Cancelled') {
            return res.status(400).json({ 
                error: `Cannot change status from ${currentStatus}` 
            });
        }

        // Validate allowed transitions
        const allowedTransitions = {
            'Draft': ['Sent', 'Cancelled'],
            'Sent': ['Overdue', 'Cancelled'],
            'Overdue': ['Cancelled']
        };

        if (!allowedTransitions[currentStatus]?.includes(status)) {
            return res.status(400).json({ 
                error: `Invalid status transition from ${currentStatus} to ${status}` 
            });
        }

        const result = await pool.query(
            `UPDATE invoices
             SET status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING *`,
            [status, id]
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating invoice status:', err);
        res.status(500).json({ error: "Error updating invoice status" });
    }
};

const markOverdueInvoices = async (req, res) => {
    try {
        const { days } = req.query;
        const overdueThreshold = parseInt(days) || 30;

        // Get invoices that should be marked overdue
        const result = await pool.query(`
            UPDATE invoices
            SET status = 'Overdue', updated_at = CURRENT_TIMESTAMP
            WHERE status = 'Sent'
              AND created_at < NOW() - INTERVAL '${overdueThreshold} days'
              AND id NOT IN (
                SELECT invoice_id FROM payments 
                GROUP BY invoice_id 
                HAVING SUM(amount) >= (
                  SELECT total_amount FROM invoices i2 WHERE i2.id = invoice_id
                )
              )
            RETURNING id, invoice_number, patient_id
        `);

        res.json({
            message: `Marked ${result.rows.length} invoices as overdue`,
            invoices: result.rows
        });
    } catch (err) {
        console.error('Error marking overdue invoices:', err);
        res.status(500).json({ error: "Error marking overdue invoices" });
    }
};

const getOverdueInvoices = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT i.*,
                   p.first_name as patient_first_name,
                   p.last_name as patient_last_name,
                   p.phone as patient_phone,
                   p.email as patient_email,
                   EXTRACT(DAY FROM (NOW() - i.created_at)) as days_overdue,
                   COALESCE(
                       (SELECT SUM(amount) FROM payments WHERE invoice_id = i.id),
                       0
                   ) as total_paid
            FROM invoices i
            JOIN patients p ON i.patient_id = p.id
            WHERE i.status = 'Overdue'
            ORDER BY days_overdue DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error('Error getting overdue invoices:', err);
        res.status(500).json({ error: "Error getting overdue invoices" });
    }
};

const generateReceipt = async (req, res) => {
    try {
        const { paymentId } = req.params;

        // Get payment details
        const paymentResult = await pool.query(`
            SELECT p.*,
                   u.username as processed_by_username
            FROM payments p
            LEFT JOIN users u ON p.processed_by = u.id
            WHERE p.id = $1
        `, [paymentId]);

        if (paymentResult.rows.length === 0) {
            return res.status(404).json({ error: "Payment not found" });
        }

        const payment = paymentResult.rows[0];

        // Get invoice details
        const invoiceResult = await pool.query(`
            SELECT i.*,
                   p.first_name as patient_first_name,
                   p.last_name as patient_last_name,
                   p.phone as patient_phone
            FROM invoices i
            JOIN patients p ON i.patient_id = p.id
            WHERE i.id = $1
        `, [payment.invoice_id]);

        const invoice = invoiceResult.rows[0];

        // Calculate balance summary
        const paymentsResult = await pool.query(
            `SELECT SUM(amount) as total_paid
             FROM payments
             WHERE invoice_id = $1 AND payment_date <= $2`,
            [payment.invoice_id, payment.payment_date]
        );

        const totalPaidIncludingThis = parseFloat(paymentsResult.rows[0].total_paid) || 0;
        const previousBalance = totalPaidIncludingThis - parseFloat(payment.amount);
        const remainingBalance = parseFloat(invoice.total_amount) - totalPaidIncludingThis;

        // Generate receipt number
        const date = new Date(payment.payment_date);
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        const receiptNumber = `REC-${dateStr}-${payment.id.toString().padStart(4, '0')}`;

        res.json({
            receipt_number: receiptNumber,
            payment: {
                id: payment.id,
                amount: parseFloat(payment.amount),
                payment_method: payment.payment_method,
                payment_date: payment.payment_date,
                transaction_reference: payment.transaction_reference,
                notes: payment.notes
            },
            invoice: {
                invoice_number: invoice.invoice_number,
                total_amount: parseFloat(invoice.total_amount),
                patient_name: `${invoice.patient_first_name} ${invoice.patient_last_name}`,
                patient_phone: invoice.patient_phone
            },
            balance_summary: {
                previous_balance: previousBalance,
                amount_paid: parseFloat(payment.amount),
                remaining_balance: Math.max(0, remainingBalance)
            },
            processed_by: payment.processed_by_username || 'System'
        });
    } catch (err) {
        console.error('Error generating receipt:', err);
        res.status(500).json({ error: "Error generating receipt" });
    }
};

module.exports = {
    getAllInvoices,
    getInvoiceById,
    getInvoiceItems,
    createInvoice,
    updateInvoice,
    deleteInvoice,
    createPayment,
    getPaymentsByInvoice,
    updateInvoiceStatus,
    markOverdueInvoices,
    getOverdueInvoices,
    generateReceipt
};

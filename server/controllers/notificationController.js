const pool = require('../config/db');

const getAllNotifications = async (req, res) => {
    try {
        const { recipient_type, status, type, start_date, end_date } = req.query;
        
        let query = `
            SELECT n.*,
                   CASE 
                       WHEN n.recipient_type = 'patient' THEN 
                           p.first_name || ' ' || p.last_name
                       WHEN n.recipient_type = 'staff' THEN 
                           u.username
                       ELSE 'Unknown'
                   END as recipient_name
            FROM notifications n
            LEFT JOIN patients p ON n.recipient_type = 'patient' AND n.recipient_id = p.id
            LEFT JOIN users u ON n.recipient_type = 'staff' AND n.recipient_id = u.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramCount = 1;
        
        if (recipient_type) {
            query += ` AND n.recipient_type = $${paramCount++}`;
            params.push(recipient_type);
        }
        
        if (status) {
            query += ` AND n.status = $${paramCount++}`;
            params.push(status);
        }
        
        if (type) {
            query += ` AND n.type = $${paramCount++}`;
            params.push(type);
        }
        
        if (start_date) {
            query += ` AND n.created_at >= $${paramCount++}`;
            params.push(start_date);
        }
        
        if (end_date) {
            query += ` AND n.created_at <= $${paramCount++}`;
            params.push(end_date);
        }
        
        query += ' ORDER BY n.created_at DESC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting notifications:', err);
        res.status(500).json({ error: "Error getting notification data" });
    }
};

const getNotificationById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT n.*,
                   CASE 
                       WHEN n.recipient_type = 'patient' THEN 
                           p.first_name || ' ' || p.last_name
                       WHEN n.recipient_type = 'staff' THEN 
                           u.username
                       ELSE 'Unknown'
                   END as recipient_name
            FROM notifications n
            LEFT JOIN patients p ON n.recipient_type = 'patient' AND n.recipient_id = p.id
            LEFT JOIN users u ON n.recipient_type = 'staff' AND n.recipient_id = u.id
            WHERE n.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Notification not found" });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting notification:', err);
        res.status(500).json({ error: "Error getting notification data" });
    }
};

const createNotification = async (req, res) => {
    try {
        const {
            type,
            recipient_id,
            recipient_type,
            title,
            message,
            related_table,
            related_id,
            scheduled_for
        } = req.body;
        
        if (!type || !recipient_id || !recipient_type || !title || !message) {
            return res.status(400).json({ 
                error: "Type, recipient_id, recipient_type, title, and message are required" 
            });
        }
        
        const result = await pool.query(
            `INSERT INTO notifications(
                type, recipient_id, recipient_type, title, message, 
                related_table, related_id, scheduled_for
            ) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [type, recipient_id, recipient_type, title, message, related_table, related_id, scheduled_for]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating notification:', err);
        res.status(500).json({ error: "Error creating notification" });
    }
};

const updateNotificationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: "Status is required" });
        }
        
        const validStatuses = ['pending', 'sent', 'failed'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                error: "Invalid status. Must be one of: " + validStatuses.join(', ') 
            });
        }
        
        const result = await pool.query(
            `UPDATE notifications
             SET status = $1,
                 sent_at = CASE WHEN $1 = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END
             WHERE id = $2
             RETURNING *`,
            [status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Notification not found" });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating notification status:', err);
        res.status(500).json({ error: "Error updating notification status" });
    }
};

const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM notifications WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Notification not found" });
        }
        
        res.json({ message: "Notification deleted successfully" });
    } catch (err) {
        console.error('Error deleting notification:', err);
        res.status(500).json({ error: "Error deleting notification" });
    }
};

const getPendingNotifications = async (req, res) => {
    try {
        const { recipient_id, recipient_type } = req.query;
        
        let query = `
            SELECT n.*,
                   CASE 
                       WHEN n.recipient_type = 'patient' THEN 
                           p.first_name || ' ' || p.last_name
                       WHEN n.recipient_type = 'staff' THEN 
                           u.username
                       ELSE 'Unknown'
                   END as recipient_name
            FROM notifications n
            LEFT JOIN patients p ON n.recipient_type = 'patient' AND n.recipient_id = p.id
            LEFT JOIN users u ON n.recipient_type = 'staff' AND n.recipient_id = u.id
            WHERE n.status = 'pending'
        `;
        
        const params = [];
        let paramCount = 1;
        
        if (recipient_id) {
            query += ` AND n.recipient_id = $${paramCount++}`;
            params.push(recipient_id);
        }
        
        if (recipient_type) {
            query += ` AND n.recipient_type = $${paramCount++}`;
            params.push(recipient_type);
        }
        
        // Include notifications that are scheduled for now or earlier
        query += ` AND (n.scheduled_for IS NULL OR n.scheduled_for <= CURRENT_TIMESTAMP)`;
        
        query += ' ORDER BY n.created_at ASC';
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting pending notifications:', err);
        res.status(500).json({ error: "Error getting pending notifications" });
    }
};

const markNotificationsAsSent = async (req, res) => {
    try {
        const { notification_ids } = req.body;
        
        if (!notification_ids || !Array.isArray(notification_ids)) {
            return res.status(400).json({ error: "notification_ids array is required" });
        }
        
        const placeholders = notification_ids.map((_, index) => `$${index + 1}`).join(',');
        
        const result = await pool.query(
            `UPDATE notifications
             SET status = 'sent', sent_at = CURRENT_TIMESTAMP
             WHERE id IN (${placeholders})
             RETURNING id, title, recipient_type`,
            notification_ids
        );
        
        res.json({
            message: `Marked ${result.rows.length} notifications as sent`,
            notifications: result.rows
        });
    } catch (err) {
        console.error('Error marking notifications as sent:', err);
        res.status(500).json({ error: "Error marking notifications as sent" });
    }
};

const getNotificationStats = async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                COUNT(*) as total_notifications,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_notifications,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent_notifications,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_notifications,
                SUM(CASE WHEN type = 'appointment_reminder' THEN 1 ELSE 0 END) as appointment_reminders,
                SUM(CASE WHEN type = 'invoice_overdue' THEN 1 ELSE 0 END) as overdue_invoices,
                SUM(CASE WHEN type = 'insurance_expiring' THEN 1 ELSE 0 END) as expiring_insurance,
                SUM(CASE WHEN type = 'invoice_sent' THEN 1 ELSE 0 END) as invoice_sent_notifications
            FROM notifications
        `);
        
        res.json({
            total: parseInt(stats.rows[0].total_notifications) || 0,
            pending: parseInt(stats.rows[0].pending_notifications) || 0,
            sent: parseInt(stats.rows[0].sent_notifications) || 0,
            failed: parseInt(stats.rows[0].failed_notifications) || 0,
            appointmentReminders: parseInt(stats.rows[0].appointment_reminders) || 0,
            overdueInvoices: parseInt(stats.rows[0].overdue_invoices) || 0,
            expiringInsurance: parseInt(stats.rows[0].expiring_insurance) || 0,
            invoiceSent: parseInt(stats.rows[0].invoice_sent_notifications) || 0
        });
    } catch (err) {
        console.error('Error getting notification stats:', err);
        res.status(500).json({ error: "Error getting notification statistics" });
    }
};

const generateAppointmentReminders = async (req, res) => {
    try {
        // Generate reminders for appointments 24 hours from now
        const result = await pool.query(`
            INSERT INTO notifications (type, recipient_id, recipient_type, title, message, related_table, related_id, scheduled_for)
            SELECT 
                'appointment_reminder',
                a.patient_id,
                'patient',
                'Appointment Reminder',
                'You have an appointment scheduled for ' || TO_CHAR(a.appointment_datetime, 'YYYY-MM-DD HH24:MI') || 
                '. Please arrive 15 minutes early.',
                'appointments',
                a.id,
                a.appointment_datetime - INTERVAL '24 hours'
            FROM appointments a
            WHERE a.status = 'Scheduled'
              AND a.appointment_datetime BETWEEN CURRENT_TIMESTAMP + INTERVAL '23 hours' AND CURRENT_TIMESTAMP + INTERVAL '25 hours'
              AND NOT EXISTS (
                  SELECT 1 FROM notifications n 
                  WHERE n.type = 'appointment_reminder' 
                    AND n.related_table = 'appointments' 
                    AND n.related_id = a.id
              )
            RETURNING id, title, recipient_id
        `);
        
        res.json({
            message: `Generated ${result.rows.length} appointment reminders`,
            reminders: result.rows
        });
    } catch (err) {
        console.error('Error generating appointment reminders:', err);
        res.status(500).json({ error: "Error generating appointment reminders" });
    }
};

const generateOverdueNotifications = async (req, res) => {
    try {
        const { days_threshold } = req.query;
        const threshold = parseInt(days_threshold) || 30;
        
        // Generate overdue notifications for invoices
        const result = await pool.query(`
            INSERT INTO notifications (type, recipient_id, recipient_type, title, message, related_table, related_id)
            SELECT 
                'invoice_overdue',
                i.patient_id,
                'patient',
                'Overdue Invoice Notice',
                'Your invoice has been outstanding for ' || EXTRACT(DAY FROM (CURRENT_TIMESTAMP - i.created_at)) || 
                ' days. Please make payment immediately.',
                'invoices',
                i.id
            FROM invoices i
            WHERE i.status = 'Sent'
              AND i.created_at < CURRENT_TIMESTAMP - INTERVAL '${threshold} days'
              AND NOT EXISTS (
                  SELECT 1 FROM notifications n 
                  WHERE n.type = 'invoice_overdue' 
                    AND n.related_table = 'invoices' 
                    AND n.related_id = i.id
              )
            RETURNING id, title, recipient_id
        `);
        
        res.json({
            message: `Generated ${result.rows.length} overdue invoice notifications`,
            notifications: result.rows
        });
    } catch (err) {
        console.error('Error generating overdue notifications:', err);
        res.status(500).json({ error: "Error generating overdue notifications" });
    }
};

module.exports = {
    getAllNotifications,
    getNotificationById,
    createNotification,
    updateNotificationStatus,
    deleteNotification,
    getPendingNotifications,
    markNotificationsAsSent,
    getNotificationStats,
    generateAppointmentReminders,
    generateOverdueNotifications
};

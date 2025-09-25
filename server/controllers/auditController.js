const pool = require('../config/db');

const getAuditLog = async (req, res) => {
    try {
        const auditLog = await pool.query("SELECT * FROM audit_log ORDER BY changed_at DESC");
        res.json(auditLog.rows);
    } catch {
        res.status(500).json("Error getting audit log data");
    }
};

module.exports = {
    getAuditLog
}

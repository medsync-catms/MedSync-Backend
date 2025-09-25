const pool = require('../config/db');

const setAuditUser = async (req, res, next) => {
    if (req.user && req.user.user_id) {
        try {
            await pool.query(`SET myapp.user_id = '${req.user.user_id}'`);
        } catch (err) {
            console.error('Failed to set user for audit log:', err);
        }
    }
    next();
};

module.exports = { setAuditUser };

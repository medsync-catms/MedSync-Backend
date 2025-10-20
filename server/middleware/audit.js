const pool = require('../config/db');

const setAuditUser = async (req, res, next) => {
    if (req.user && req.user.id) {
        try {
            // Store user ID in request for use in controllers
            req.auditUserId = req.user.id;
        } catch (err) {
            console.error('Failed to set user for audit log:', err);
        }
    }
    next();
};

module.exports = { setAuditUser };

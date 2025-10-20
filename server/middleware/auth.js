const pool = require('../config/db');

const requireAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    } else {
        return res.status(401).json({ error: "Authentication required" });
    }
};

// Middleware to check if user has one of the specified roles
const requireRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.isAuthenticated()) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const userRole = req.user.role;
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ 
                error: "Access denied. Insufficient permissions.",
                required: allowedRoles,
                current: userRole
            });
        }

        return next();
    };
};

// Admin only access
const requireAdmin = requireRole('admin');

// Manager or Admin access
const requireManagerOrAdmin = requireRole('manager', 'admin');

// Any staff member (doctor, nurse, receptionist, manager) or admin
const requireStaffOrAbove = requireRole('doctor', 'nurse', 'receptionist', 'manager', 'admin');

// Helper function to get user's branch_id from medical_staff table
const getUserBranchId = async (userId) => {
    try {
        const result = await pool.query(
            'SELECT branch_id FROM medical_staff WHERE user_id = $1',
            [userId]
        );
        return result.rows.length > 0 ? result.rows[0].branch_id : null;
    } catch (err) {
        console.error('Error getting user branch:', err);
        return null;
    }
};

// Helper function to get user's medical_staff id
const getUserMedicalStaffId = async (userId) => {
    try {
        const result = await pool.query(
            'SELECT id FROM medical_staff WHERE user_id = $1',
            [userId]
        );
        return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (err) {
        console.error('Error getting user medical staff ID:', err);
        return null;
    }
};

// Middleware to ensure manager can only access their own branch data
const requireBranchAccess = async (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
    }

    // Admin has access to all branches
    if (req.user.role === 'admin') {
        return next();
    }

    // For managers, check if they're accessing their own branch
    if (req.user.role === 'manager') {
        const userBranchId = await getUserBranchId(req.user.id);
        
        if (!userBranchId) {
            return res.status(403).json({ error: "User branch not found" });
        }

        // Check branch_id in request (params, query, or body)
        const requestedBranchId = parseInt(req.params.branch_id || req.query.branch_id || req.body.branch_id);
        
        if (requestedBranchId && requestedBranchId !== userBranchId) {
            return res.status(403).json({ error: "Access denied. You can only access your own branch." });
        }

        // Attach user's branch_id to request for controllers to use
        req.userBranchId = userBranchId;
    }

    return next();
};

module.exports = { 
    requireAuth, 
    requireRole,
    requireAdmin,
    requireManagerOrAdmin,
    requireStaffOrAbove,
    requireBranchAccess,
    getUserBranchId,
    getUserMedicalStaffId
};
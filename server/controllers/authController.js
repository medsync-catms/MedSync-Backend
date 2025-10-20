const argon2 = require("argon2");
const passport = require('../config/passport');
const pool = require("../config/db");

// Register endpoint - restricted to admin only for creating branch managers
const register = async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: "Username, password, and role are required" });
        }

        // Prevent creation of admin accounts through this endpoint
        if (role === 'admin') {
            return res.status(403).json({ error: "Cannot create admin accounts" });
        }

        // Only admin can use this endpoint (middleware enforces this)
        const password_hash = await argon2.hash(password, { timeCost: 3 });

        await pool.query(
            "INSERT INTO users(username, password_hash, role) VALUES ($1, $2, $3)",
            [username, password_hash, role]
        );

        res.json({ message: "User successfully added" });
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            return res.status(400).json({ error: "Username already exists" });
        }
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Create a branch manager with associated medical_staff record
const createBranchManager = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            username,
            password,
            first_name,
            last_name,
            phone,
            email,
            branch_id,
            license_number
        } = req.body;

        // Validate required fields
        if (!username || !password || !first_name || !last_name || !branch_id) {
            return res.status(400).json({ 
                error: "Username, password, first name, last name, and branch are required" 
            });
        }

        // Hash password
        const password_hash = await argon2.hash(password, { timeCost: 3 });

        // Create user account with manager role
        const userResult = await client.query(
            "INSERT INTO users(username, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
            [username, password_hash, 'manager']
        );
        const user_id = userResult.rows[0].id;

        // Create medical_staff record for the manager
        const staffResult = await client.query(
            `INSERT INTO medical_staff(user_id, first_name, last_name, license_number, phone, email, branch_id, is_active)
             VALUES($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
            [user_id, first_name, last_name, license_number || null, phone || null, email || null, branch_id]
        );

        await client.query('COMMIT');
        
        res.status(201).json({
            message: "Branch manager created successfully",
            user: {
                id: user_id,
                username: username,
                role: 'manager'
            },
            staff: staffResult.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating branch manager:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: "Username or license number already exists" });
        }
        res.status(500).json({ error: "Error creating branch manager" });
    } finally {
        client.release();
    }
};

const login = (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (info) { return res.status(401).json({ error: info.message }); }
        if (err) { return next(err); }
        if (!user) { return res.status(401).json({ error: "Authentication failed" }); }
        req.login(user, (err) => {
            if (err) { return next(err); }
            return res.json({
                message: "Login successful",
                user: { id: user.id, username: user.username, role: user.role }
            });
        });
    })(req, res, next);
};

const logout = (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err);
        }
        res.json({ message: "Logout successful" });
    });
};

const getLoginPage = (req, res) => {
    res.json({ message: "Login page" });
};

const getProtectedArea = (req, res) => {
    res.json({
        message: "Welcome to the protected area!",
        user: { id: req.user.id, username: req.user.username, role: req.user.role }
    });
};

const checkAuthStatus = (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            isAuthenticated: true,
            user: {
                id: req.user.id,
                username: req.user.username,
                role: req.user.role
            }
        });
    } else {
        res.json({ isAuthenticated: false });
    }
};

module.exports = {
    register,
    createBranchManager,
    login,
    logout,
    getLoginPage,
    getProtectedArea,
    checkAuthStatus
};
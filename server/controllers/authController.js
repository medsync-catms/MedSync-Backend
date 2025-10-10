const argon2 = require("argon2");
const passport = require('../config/passport');
const pool = require("../config/db");

const register = async (req, res) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ error: "Username, password, and role are required" });
        }

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
    login,
    logout,
    getLoginPage,
    getProtectedArea,
    checkAuthStatus
};
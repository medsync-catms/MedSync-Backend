const argon2 = require("argon2");
const passport = require('../config/passport');
const pool = require("../config/db");

const register = async (req, res) => {
    try {
        const { username, password } = req.body;
        const password_hash = await argon2.hash(password, { timeCost: 8 });

        await pool.query(
            "INSERT INTO users(username, password_hash) VALUES ($1, $2)",
            [username, password_hash]
        );

        res.json("User successfully added");
    } catch (err) {
        if (err.code === '23505') { // unique_violation
            return res.status(400).json("Username already exists");
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
                user: { username: user.username, user_id: user.user_id }
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
        user: { username: req.user.username, user_id: req.user.user_id }
    });
};

const checkAuthStatus = (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            isAuthenticated: true,
            user: {
                user_id: req.user.user_id,
                username: req.user.username
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
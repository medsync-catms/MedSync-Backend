const rateLimit = require('express-rate-limit');

// limit to 5 requests per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000 * 2, // 15 minutes
    limit: 5,
    message: "Too many login attempts from this IP, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = { loginLimiter };
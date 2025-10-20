const rateLimit = require('express-rate-limit');

// Disable rate limiting in test environment
const loginLimiter = process.env.NODE_ENV === 'test' 
  ? (req, res, next) => next() // Skip rate limiting in tests
  : rateLimit({
      windowMs: 15 * 60 * 1000 * 2, // 15 minutes
      limit: 100,
      message: "Too many login attempts from this IP, please try again later",
      standardHeaders: true,
      legacyHeaders: false,
    });

module.exports = { loginLimiter };
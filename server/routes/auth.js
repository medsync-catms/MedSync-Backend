const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const { loginLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Routes
router.get('/login', authController.getLoginPage);
router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/status', authController.checkAuthStatus);
router.get('/authrequired', requireAuth, authController.getProtectedArea);

module.exports = router;
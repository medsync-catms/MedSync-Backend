const express = require('express');
const { loginLimiter } = require('../middleware/rateLimiter');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

// Apply middleware
router.use(express.json());

// Routes
router.get('/login', authController.getLoginPage);
router.post('/register', requireAdmin, authController.register); // Admin only
router.post('/branch-manager', requireAdmin, authController.createBranchManager); // Admin only
router.post('/login', loginLimiter, authController.login);
router.post('/logout', authController.logout);
router.get('/status', authController.checkAuthStatus);
router.get('/authrequired', requireAuth, authController.getProtectedArea);

module.exports = router;
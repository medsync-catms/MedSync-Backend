const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { requireAuth } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Invoice routes
router.get('/', requireAuth, invoiceController.getAllInvoices);
router.get('/:id', requireAuth, invoiceController.getInvoiceById);
router.post('/', requireAuth, setAuditUser, invoiceController.createInvoice);
router.put('/:id', requireAuth, setAuditUser, invoiceController.updateInvoice);
router.delete('/:id', requireAuth, setAuditUser, invoiceController.deleteInvoice);

// Payment routes
router.post('/payments', requireAuth, setAuditUser, invoiceController.createPayment);
router.get('/:invoice_id/payments', requireAuth, invoiceController.getPaymentsByInvoice);

module.exports = router;

const express = require('express');
const sessionMiddleware = require('../config/session');
const passport = require('../config/passport');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { requireAuth, requireStaffOrAbove } = require('../middleware/auth');
const { setAuditUser } = require('../middleware/audit');

// Apply middleware
router.use(express.json());
router.use(sessionMiddleware);
router.use(passport.initialize());
router.use(passport.session());

// Invoice routes - require staff or above
router.get('/', requireAuth, invoiceController.getAllInvoices);
router.get('/overdue', requireAuth, invoiceController.getOverdueInvoices);
router.post('/mark-overdue', requireStaffOrAbove, setAuditUser, invoiceController.markOverdueInvoices);
router.get('/:id/items', requireAuth, invoiceController.getInvoiceItems);
router.get('/:id', requireAuth, invoiceController.getInvoiceById);
router.post('/', requireStaffOrAbove, setAuditUser, invoiceController.createInvoice);
router.put('/:id', requireStaffOrAbove, setAuditUser, invoiceController.updateInvoice);
router.put('/:id/status', requireStaffOrAbove, setAuditUser, invoiceController.updateInvoiceStatus);
router.delete('/:id', requireStaffOrAbove, setAuditUser, invoiceController.deleteInvoice);

// Payment routes - require staff or above
router.post('/payments', requireStaffOrAbove, setAuditUser, invoiceController.createPayment);
router.get('/payments/:paymentId/receipt', requireAuth, invoiceController.generateReceipt);
router.get('/:invoice_id/payments', requireAuth, invoiceController.getPaymentsByInvoice);

module.exports = router;

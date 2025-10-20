const express = require('express');
const router = express.Router();
const {
    getAllNotifications,
    getNotificationById,
    createNotification,
    updateNotificationStatus,
    deleteNotification,
    getPendingNotifications,
    markNotificationsAsSent,
    getNotificationStats,
    generateAppointmentReminders,
    generateOverdueNotifications
} = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(requireAuth);

// GET /api/notifications - Get all notifications with optional filters
router.get('/', getAllNotifications);

// GET /api/notifications/pending - Get pending notifications
router.get('/pending', getPendingNotifications);

// GET /api/notifications/stats - Get notification statistics
router.get('/stats', getNotificationStats);

// GET /api/notifications/:id - Get notification by ID
router.get('/:id', getNotificationById);

// POST /api/notifications - Create new notification
router.post('/', createNotification);

// PUT /api/notifications/:id/status - Update notification status
router.put('/:id/status', updateNotificationStatus);

// PUT /api/notifications/mark-sent - Mark multiple notifications as sent
router.put('/mark-sent', markNotificationsAsSent);

// POST /api/notifications/generate/reminders - Generate appointment reminders
router.post('/generate/reminders', generateAppointmentReminders);

// POST /api/notifications/generate/overdue - Generate overdue notifications
router.post('/generate/overdue', generateOverdueNotifications);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', deleteNotification);

module.exports = router;

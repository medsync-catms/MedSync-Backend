const express = require('express');
const app = express();
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import middleware
const corsMiddleware = require('./middleware/cors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const sessionMiddleware = require('./config/session');
const passport = require('./config/passport');

// Import routers
const patientRouter = require('./routes/patients');
const authRouter = require('./routes/auth');
const auditRouter = require('./routes/audit');
const appointmentRouter = require('./routes/appointments');
const treatmentRouter = require('./routes/treatments');
const branchRouter = require('./routes/branches');
const invoiceRouter = require('./routes/invoices');
const dashboardRouter = require('./routes/dashboard');
const staffRouter = require('./routes/staff');
const insuranceRouter = require('./routes/insurance');
const reportsRouter = require('./routes/reports');
const notificationRouter = require('./routes/notifications');

const port = process.env.PORT || 3000;

// Global middleware
app.use(corsMiddleware);
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/patients', patientRouter);
app.use('/api/auth', authRouter);
app.use('/api/audit', auditRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/treatments', treatmentRouter);
app.use('/api/branches', branchRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/staff', staffRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({
        message: 'MedSync API',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            patients: '/api/patients',
            appointments: '/api/appointments',
            treatments: '/api/treatments',
            branches: '/api/branches',
            invoices: '/api/invoices',
            dashboard: '/api/dashboard',
            staff: '/api/staff',
            insurance: '/api/insurance',
            reports: '/api/reports',
            audit: '/api/audit'
        }
    });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

// Only start server if not in test mode
if (process.env.NODE_ENV !== 'test') {
    app.listen(port, () => {
        console.log(`MedSync server started on port ${port}`);
    });
}

// Export app for testing
module.exports = app;
const express = require('express');
const app = express();
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Import middleware
const corsMiddleware = require('./middleware/cors');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routers
const patientRouter = require('./routes/patients');
const authRouter = require('./routes/auth');
const auditRouter = require('./routes/audit');
const appointmentRouter = require('./routes/appointments');
const treatmentRouter = require('./routes/treatments');
const branchRouter = require('./routes/branches');
const invoiceRouter = require('./routes/invoices');

const port = process.env.PORT || 3000;

// Global middleware
app.use(corsMiddleware);
app.use(express.json());

// Routes
app.use('/api/patients', patientRouter);
app.use('/api/auth', authRouter);
app.use('/api/audit', auditRouter);
app.use('/api/appointments', appointmentRouter);
app.use('/api/treatments', treatmentRouter);
app.use('/api/branches', branchRouter);
app.use('/api/invoices', invoiceRouter);

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
            audit: '/api/audit'
        }
    });
});

// 404 handler
app.use(notFoundHandler);

// Error handler (must be last)
app.use(errorHandler);

app.listen(port, () => {
    console.log(`MedSync server started on port ${port}`);
});
const Pool = require('pg').Pool;
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    // Connection pool settings
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection cannot be established
});

// Test database connection on startup
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error connecting to the database:', err.stack);
        console.error('Database config:', {
            user: process.env.DB_USER,
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME
        });
    } else {
        console.log('✅ Database connected successfully');
        release();
    }
});

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('❌ Unexpected error on idle client', err);
});

module.exports = pool;
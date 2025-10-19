const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');
const path = require('path');

// Load appropriate environment file
if (process.env.NODE_ENV === 'test') {
  require('dotenv').config({ path: path.join(__dirname, '../../.env.test') });
} else {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

const sessionConfig = {
    genid: (req) => {
        return uuidv4();
    },
    store: process.env.NODE_ENV === 'test' 
        ? undefined // Use memory store for tests
        : new pgSession({
            pool: pool,
            tableName: 'session',
            pruneSessionInterval: 60 * 60
        }),
    secret: process.env.SESSION_SECRET  || 'secret_string',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: false, // Allow JavaScript access for tests
        secure: false, // Disable secure cookies for tests
        sameSite: 'lax',
        domain: undefined // Remove domain restriction for tests
    }
};

module.exports = session(sessionConfig);

const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { v7: uuidv7 } = require('uuid');
const pool = require('./db');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const sessionConfig = {
    genid: (req) => {
        return uuidv7();
    },
    store: new pgSession({
        pool: pool,
        tableName: 'session',
        pruneSessionInterval: 60 * 60
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
};

module.exports = session(sessionConfig);
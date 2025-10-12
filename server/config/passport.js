const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const argon2 = require("argon2");
const pool = require("./db");

// configure passport to use the local strategy
passport.use(new LocalStrategy(
    { usernameField: 'username' },
    async (username, password, done) => {
        try {
            const user = await pool.query("SELECT * FROM users WHERE username = $1", [
                username,
            ]);

            if (user.rows.length == 0) {
                return done(null, false, { message: "Invalid credentials " });
            }

            if (await argon2.verify(user.rows[0].password_hash, password)) {
                return done(null, user.rows[0]);
            } else {
                return done(null, false, { message: 'Invalid credentials.\n' });
            }
        } catch (err) {
            return done(err);
        }
    }
));

// serialize the passport user
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        if (result.rows.length > 0) {
            done(null, result.rows[0]);
        } else {
            done(null, false);
        }
    } catch (error) {
        done(error, false);
    }
});

module.exports = passport;
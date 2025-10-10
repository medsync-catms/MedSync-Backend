const pool = require('../config/db');

const getAllPatients = async (req, res) => {
    try {
        const allPatients = await pool.query("SELECT * FROM patients");
        res.json(allPatients.rows);
    } catch {
        res.status(500).json("Error getting patient data");
    }
};

const registerPatient = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            first_name,
            last_name,
            date_of_birth,
            gender,
            address,
            phone,
            email,
            registered_branch,
            is_active
        } = req.body;

        // First, create the address
        const addressResult = await client.query(
            "INSERT INTO addresses(line1, line2, city, state, postal_code) VALUES($1, $2, $3, $4, $5) RETURNING id",
            [address.line1, address.line2 || null, address.city, address.state || null, address.postal_code || null]
        );
        const address_id = addressResult.rows[0].id;

        // Then create the patient with the address_id
        const newPatient = await client.query(
            "INSERT INTO patients(first_name, last_name, date_of_birth, gender, address_id, phone, email, registered_branch, is_active) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *",
            [first_name, last_name, date_of_birth, gender, address_id, phone, email, registered_branch, is_active !== undefined ? is_active : true]
        );

        await client.query('COMMIT');
        res.json(newPatient.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error registering patient:', err);
        res.status(500).json({ error: "Error inserting patient data" });
    } finally {
        client.release();
    }
};

module.exports = {
    getAllPatients,
    registerPatient
}
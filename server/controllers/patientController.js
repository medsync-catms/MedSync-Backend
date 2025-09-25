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
    try {
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

        const newPatient = await pool.query("INSERT INTO patients(first_name, last_name, date_of_birth, gender, address, phone, email, registered_branch, is_active) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *", [first_name, last_name, date_of_birth, gender, address, phone, email, registered_branch, is_active]);

        res.json(newPatient.rows[0]);
    } catch {
        res.status(500).json("Error inserting patient data");
    }
};

module.exports = {
    getAllPatients,
    registerPatient
}
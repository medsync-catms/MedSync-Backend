const express = require('express');
const app = express();
const pool = require('./db');

require('dotenv').config();
const port = process.env.PORT;

app.use(express.json());

app.get('/patients', async (req, res) => {
    try {
        const allPatients = await pool.query("SELECT * FROM patients");
        res.json(allPatients.rows);
    } catch (err) {
        res.staus(500).json("Error getting patient data");
    }
});

app.post('/patients', async (req, res) => {
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
    } catch (err) {
        res.staus(500).json("Error inserting patient data");
    }
});

app.listen(port, () => {
    console.log(`server started at port ${port}`);
});
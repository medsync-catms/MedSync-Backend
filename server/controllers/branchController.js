const pool = require('../config/db');

const getAllBranches = async (req, res) => {
    try {
        const { is_active } = req.query;

        let query = `
            SELECT b.*,
                   a.line1, a.line2, a.city, a.state, a.postal_code
            FROM branches b
            JOIN addresses a ON b.address_id = a.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (is_active !== undefined) {
            query += ` AND b.is_active = $${paramCount++}`;
            params.push(is_active === 'true');
        }

        query += ' ORDER BY b.name';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting branches:', err);
        res.status(500).json({ error: "Error getting branch data" });
    }
};

const getBranchById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT b.*,
                   a.line1, a.line2, a.city, a.state, a.postal_code
            FROM branches b
            JOIN addresses a ON b.address_id = a.id
            WHERE b.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Branch not found" });
        }

        // Get branch hours
        const hoursResult = await pool.query(
            'SELECT * FROM branch_hours WHERE branch_id = $1 ORDER BY day_of_week',
            [id]
        );

        res.json({
            ...result.rows[0],
            hours: hoursResult.rows
        });
    } catch (err) {
        console.error('Error getting branch:', err);
        res.status(500).json({ error: "Error getting branch data" });
    }
};

const createBranch = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            name,
            address,
            phone,
            email,
            is_active,
            hours
        } = req.body;

        if (!name || !address) {
            return res.status(400).json({ error: "Name and address are required" });
        }

        // Create address
        const addressResult = await client.query(
            "INSERT INTO addresses(line1, line2, city, state, postal_code) VALUES($1, $2, $3, $4, $5) RETURNING id",
            [address.line1, address.line2 || null, address.city, address.state || null, address.postal_code || null]
        );
        const address_id = addressResult.rows[0].id;

        // Create branch
        const branchResult = await client.query(
            `INSERT INTO branches(name, address_id, phone, email, is_active)
             VALUES($1, $2, $3, $4, $5) RETURNING *`,
            [name, address_id, phone || null, email || null, is_active !== undefined ? is_active : true]
        );

        const branch = branchResult.rows[0];

        // Insert branch hours if provided
        if (hours && hours.length > 0) {
            for (const hour of hours) {
                await client.query(
                    `INSERT INTO branch_hours(branch_id, day_of_week, open_time, close_time)
                     VALUES($1, $2, $3, $4)`,
                    [branch.id, hour.day_of_week, hour.open_time, hour.close_time]
                );
            }
        }

        await client.query('COMMIT');
        res.status(201).json(branch);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating branch:', err);
        res.status(500).json({ error: "Error creating branch" });
    } finally {
        client.release();
    }
};

const updateBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            phone,
            email,
            is_active
        } = req.body;

        const result = await pool.query(
            `UPDATE branches
             SET name = COALESCE($1, name),
                 phone = COALESCE($2, phone),
                 email = COALESCE($3, email),
                 is_active = COALESCE($4, is_active)
             WHERE id = $5
             RETURNING *`,
            [name, phone, email, is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Branch not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating branch:', err);
        res.status(500).json({ error: "Error updating branch" });
    }
};

const deleteBranch = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM branches WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Branch not found" });
        }

        res.json({ message: "Branch deleted successfully" });
    } catch (err) {
        console.error('Error deleting branch:', err);
        res.status(500).json({ error: "Error deleting branch" });
    }
};

module.exports = {
    getAllBranches,
    getBranchById,
    createBranch,
    updateBranch,
    deleteBranch
};

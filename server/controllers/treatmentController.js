const pool = require('../config/db');

const getAllTreatments = async (req, res) => {
    try {
        const { category_id, is_active } = req.query;

        let query = `
            SELECT t.*, tc.name as category_name
            FROM treatments t
            JOIN treatment_categories tc ON t.category_id = tc.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (category_id) {
            query += ` AND t.category_id = $${paramCount++}`;
            params.push(category_id);
        }
        if (is_active !== undefined) {
            query += ` AND t.is_active = $${paramCount++}`;
            params.push(is_active === 'true');
        }

        query += ' ORDER BY tc.name, t.name';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting treatments:', err);
        res.status(500).json({ error: "Error getting treatment data" });
    }
};

const getTreatmentById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT t.*, tc.name as category_name
            FROM treatments t
            JOIN treatment_categories tc ON t.category_id = tc.id
            WHERE t.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Treatment not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting treatment:', err);
        res.status(500).json({ error: "Error getting treatment data" });
    }
};

const createTreatment = async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            category_id,
            is_active
        } = req.body;

        if (!name || !price || !category_id) {
            return res.status(400).json({ error: "Name, price, and category are required" });
        }

        const result = await pool.query(
            `INSERT INTO treatments(name, description, price, category_id, is_active)
             VALUES($1, $2, $3, $4, $5) RETURNING *`,
            [name, description || null, price, category_id, is_active !== undefined ? is_active : true]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating treatment:', err);
        res.status(500).json({ error: "Error creating treatment" });
    }
};

const updateTreatment = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name,
            description,
            price,
            category_id,
            is_active
        } = req.body;

        const result = await pool.query(
            `UPDATE treatments
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 price = COALESCE($3, price),
                 category_id = COALESCE($4, category_id),
                 is_active = COALESCE($5, is_active),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING *`,
            [name, description, price, category_id, is_active, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Treatment not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating treatment:', err);
        res.status(500).json({ error: "Error updating treatment" });
    }
};

const deleteTreatment = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM treatments WHERE id = $1 RETURNING *', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Treatment not found" });
        }

        res.json({ message: "Treatment deleted successfully" });
    } catch (err) {
        console.error('Error deleting treatment:', err);
        res.status(500).json({ error: "Error deleting treatment" });
    }
};

const getTreatmentCategories = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM treatment_categories ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting treatment categories:', err);
        res.status(500).json({ error: "Error getting treatment categories" });
    }
};

module.exports = {
    getAllTreatments,
    getTreatmentById,
    createTreatment,
    updateTreatment,
    deleteTreatment,
    getTreatmentCategories
};

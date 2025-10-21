const pool = require('../config/db');
const argon2 = require('argon2');

const getAllStaff = async (req, res) => {
    try {
        const { branch_id, role, specialty, specialty_id, is_active } = req.query;

        let query = `
            SELECT s.*, 
                   b.name as branch_name,
                   sp.name as specialty,
                   u.role
            FROM medical_staff s
            LEFT JOIN branches b ON s.branch_id = b.id
            LEFT JOIN specialties sp ON s.specialty_id = sp.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;

        if (branch_id) {
            query += ` AND s.branch_id = $${paramCount++}`;
            params.push(branch_id);
        }
        if (role) {
            query += ` AND LOWER(u.role::text) = LOWER($${paramCount++})`;
            params.push(role);
        }
        if (specialty) {
            query += ` AND sp.name ILIKE $${paramCount++}`;
            params.push(`%${specialty}%`);
        }
        if (specialty_id) {
            query += ` AND s.specialty_id = $${paramCount++}`;
            params.push(parseInt(specialty_id));
        }
        if (is_active !== undefined) {
            query += ` AND s.is_active = $${paramCount++}`;
            params.push(is_active === 'true');
        }

        query += ' ORDER BY s.first_name, s.last_name';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting staff:', err);
        res.status(500).json({ error: "Error getting staff data" });
    }
};

const getAllSpecialties = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM specialties ORDER BY name');
        res.json(result.rows);
    } catch (err) {
        console.error('Error getting specialties:', err);
        res.status(500).json({ error: "Error getting specialties data" });
    }
};

const getStaffById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT s.*, 
                   b.name as branch_name,
                   sp.name as specialty,
                   u.role,
                   u.username
            FROM medical_staff s
            LEFT JOIN branches b ON s.branch_id = b.id
            LEFT JOIN specialties sp ON s.specialty_id = sp.id
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Staff member not found" });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error getting staff member:', err);
        res.status(500).json({ error: "Error getting staff member data" });
    }
};

const createStaff = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            first_name,
            last_name,
            role,
            specialty,
            phone,
            email,
            branch_id,
            username,
            password,
            license_number,
            is_active
        } = req.body;

        if (!first_name || !last_name || !role || !branch_id) {
            return res.status(400).json({ error: "First name, last name, role, and branch are required" });
        }

        // Prevent creation of admin or manager roles through this endpoint
        if (role === 'admin' || role === 'manager') {
            return res.status(403).json({ error: "Cannot create admin or manager accounts through this endpoint" });
        }

        // If user is a manager, enforce they can only create staff for their branch
        if (req.user.role === 'manager' && req.userBranchId) {
            if (parseInt(branch_id) !== req.userBranchId) {
                return res.status(403).json({ error: "You can only create staff for your own branch" });
            }
        }

        // Create user account for staff member
        const generatedUsername = username || `${first_name.toLowerCase()}.${last_name.toLowerCase()}`;
        const defaultPassword = password || 'ChangeMe123!';
        
        // Hash the password with argon2
        const password_hash = await argon2.hash(defaultPassword, { timeCost: 3 });
        
        const userResult = await client.query(
            `INSERT INTO users(username, password_hash, role) 
             VALUES($1, $2, $3) 
             RETURNING id`,
            [generatedUsername, password_hash, role.toLowerCase()]
        );
        const user_id = userResult.rows[0].id;

        // Get or create specialty if provided
        let specialty_id = null;
        if (specialty) {
            const specialtyCheck = await client.query(
                'SELECT id FROM specialties WHERE name = $1',
                [specialty]
            );
            
            if (specialtyCheck.rows.length > 0) {
                specialty_id = specialtyCheck.rows[0].id;
            } else {
                const specialtyResult = await client.query(
                    'INSERT INTO specialties(name) VALUES($1) RETURNING id',
                    [specialty]
                );
                specialty_id = specialtyResult.rows[0].id;
            }
        }

        // Create medical staff record
        const result = await client.query(
            `INSERT INTO medical_staff(user_id, first_name, last_name, specialty_id, license_number, phone, email, branch_id, is_active)
             VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [user_id, first_name, last_name, specialty_id, license_number || null, phone || null, email || null, branch_id, is_active !== undefined ? is_active : true]
        );

        await client.query('COMMIT');
        res.status(201).json({
            ...result.rows[0],
            username: generatedUsername,
            message: 'Staff member created. Default password: ChangeMe123! - Please change immediately.'
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating staff member:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: "Username or license number already exists" });
        }
        res.status(500).json({ error: "Error creating staff member" });
    } finally {
        client.release();
    }
};

const updateStaff = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const { id } = req.params;
        const {
            first_name,
            last_name,
            specialty,
            license_number,
            phone,
            email,
            branch_id,
            is_active
        } = req.body;

        // Get or create specialty if provided
        let specialty_id = null;
        if (specialty) {
            const specialtyCheck = await client.query(
                'SELECT id FROM specialties WHERE name = $1',
                [specialty]
            );
            
            if (specialtyCheck.rows.length > 0) {
                specialty_id = specialtyCheck.rows[0].id;
            } else {
                const specialtyResult = await client.query(
                    'INSERT INTO specialties(name) VALUES($1) RETURNING id',
                    [specialty]
                );
                specialty_id = specialtyResult.rows[0].id;
            }
        }

        const result = await client.query(
            `UPDATE medical_staff
             SET first_name = COALESCE($1, first_name),
                 last_name = COALESCE($2, last_name),
                 specialty_id = COALESCE($3, specialty_id),
                 license_number = COALESCE($4, license_number),
                 phone = COALESCE($5, phone),
                 email = COALESCE($6, email),
                 branch_id = COALESCE($7, branch_id),
                 is_active = COALESCE($8, is_active)
             WHERE id = $9
             RETURNING *`,
            [first_name, last_name, specialty_id, license_number, phone, email, branch_id, is_active, id]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: "Staff member not found" });
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating staff member:', err);
        res.status(500).json({ error: "Error updating staff member" });
    } finally {
        client.release();
    }
};

const deleteStaff = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Soft delete - set is_active to false
        const result = await pool.query(
            'UPDATE medical_staff SET is_active = false WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Staff member not found" });
        }

        res.json({ message: "Staff member deactivated successfully", staff: result.rows[0] });
    } catch (err) {
        console.error('Error deleting staff member:', err);
        res.status(500).json({ error: "Error deleting staff member" });
    }
};

module.exports = {
    getAllStaff,
    getAllSpecialties,
    getStaffById,
    createStaff,
    updateStaff,
    deleteStaff
};


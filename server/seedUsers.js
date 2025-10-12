/**
 * Seed Users and Medical Staff Script
 * This script creates initial users and medical staff with properly hashed passwords
 * Run this after setting up the database with database.sql
 * 
 * Usage: node server/seedUsers.js
 */

const argon2 = require("argon2");
const pool = require("./config/db");

async function seedData() {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        console.log("Starting data seeding process...\n");

        // Step 1: Create users
        console.log("Step 1: Creating users...");
        const users = [
            { username: 'admin', password: 'password123', role: 'admin' },
            { username: 'dr.silva', password: 'password123', role: 'doctor' },
            { username: 'dr.perera', password: 'password123', role: 'doctor' }
        ];

        const userIds = [];
        for (const user of users) {
            try {
                // Check if user already exists
                const existingUser = await client.query(
                    "SELECT id FROM users WHERE username = $1",
                    [user.username]
                );

                if (existingUser.rows.length > 0) {
                    console.log(`  ⚠️  User '${user.username}' already exists, using existing ID`);
                    userIds.push(existingUser.rows[0].id);
                    continue;
                }

                // Hash password with Argon2
                const password_hash = await argon2.hash(user.password, { timeCost: 3 });

                // Insert user
                const result = await client.query(
                    "INSERT INTO users(username, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
                    [user.username, password_hash, user.role]
                );

                userIds.push(result.rows[0].id);
                console.log(`  ✓ Created user '${user.username}' with role '${user.role}'`);
            } catch (err) {
                console.error(`  ✗ Error creating user '${user.username}':`, err.message);
                throw err;
            }
        }

        // Step 2: Create medical staff for doctors
        console.log("\nStep 2: Creating medical staff records...");
        
        // Get branch and specialty IDs
        const branchResult = await client.query("SELECT id FROM branches ORDER BY id LIMIT 2");
        const specialtyResult = await client.query("SELECT id FROM specialties ORDER BY id LIMIT 2");
        
        if (branchResult.rows.length < 2) {
            console.log("  ⚠️  Warning: Less than 2 branches found. Make sure database.sql was run first.");
        }
        
        if (specialtyResult.rows.length < 2) {
            console.log("  ⚠️  Warning: Less than 2 specialties found. Make sure database.sql was run first.");
        }

        const medicalStaff = [
            {
                user_id: userIds[1], // dr.silva
                first_name: 'Kasun',
                last_name: 'Silva',
                specialty_id: specialtyResult.rows[0]?.id || 1,
                license_number: 'SLMC-12345',
                phone: '+94771234567',
                email: 'k.silva@medsync.lk',
                branch_id: branchResult.rows[0]?.id || 1
            },
            {
                user_id: userIds[2], // dr.perera
                first_name: 'Amila',
                last_name: 'Perera',
                specialty_id: specialtyResult.rows[1]?.id || 2,
                license_number: 'SLMC-67890',
                phone: '+94772345678',
                email: 'a.perera@medsync.lk',
                branch_id: branchResult.rows[1]?.id || 2
            }
        ];

        for (const staff of medicalStaff) {
            try {
                // Check if medical staff already exists
                const existingStaff = await client.query(
                    "SELECT id FROM medical_staff WHERE user_id = $1",
                    [staff.user_id]
                );

                if (existingStaff.rows.length > 0) {
                    console.log(`  ⚠️  Medical staff for user_id ${staff.user_id} already exists, skipping...`);
                    continue;
                }

                await client.query(
                    `INSERT INTO medical_staff 
                     (user_id, first_name, last_name, specialty_id, license_number, phone, email, branch_id, is_active)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
                    [staff.user_id, staff.first_name, staff.last_name, staff.specialty_id, 
                     staff.license_number, staff.phone, staff.email, staff.branch_id]
                );

                console.log(`  ✓ Created medical staff: Dr. ${staff.first_name} ${staff.last_name}`);
            } catch (err) {
                console.error(`  ✗ Error creating medical staff:`, err.message);
                throw err;
            }
        }

        await client.query('COMMIT');
        
        console.log("\n✓ Data seeding completed successfully!");
        console.log("\n=== Default Login Credentials ===");
        console.log("Admin Account:");
        console.log("  Username: admin");
        console.log("  Password: password123");
        console.log("\nDoctor Accounts:");
        console.log("  Username: dr.silva / Password: password123");
        console.log("  Username: dr.perera / Password: password123");
        console.log("\n⚠️  IMPORTANT: Change these passwords in production!");
        console.log("================================\n");

        process.exit(0);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("\n✗ Error during seeding:", err);
        console.error("\nMake sure you have run database.sql first!");
        process.exit(1);
    } finally {
        client.release();
    }
}

seedData();


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
        console.log("Starting data seeding process with all roles...\n");

        // Get branch and specialty IDs first
        const branchResult = await client.query("SELECT id FROM branches ORDER BY id LIMIT 3");
        const specialtyResult = await client.query("SELECT id FROM specialties ORDER BY id LIMIT 3");
        
        if (branchResult.rows.length < 3) {
            console.log("  ⚠️  Warning: Less than 3 branches found. Make sure database.sql was run first.");
        }
        
        if (specialtyResult.rows.length < 3) {
            console.log("  ⚠️  Warning: Less than 3 specialties found. Make sure database.sql was run first.");
        }

        // Step 1: Create users with all roles
        console.log("Step 1: Creating users with different roles...");
        const users = [
            // Admin
            { username: 'admin', password: 'password123', role: 'admin', staff: null },
            
            // Branch Managers (one per branch)
            { 
                username: 'manager.branch1', 
                password: 'password123', 
                role: 'manager',
                staff: {
                    first_name: 'Manager',
                    last_name: 'Branch1',
                    license_number: 'MGR-001',
                    phone: '+94771111111',
                    email: 'manager.branch1@medsync.lk',
                    branch_id: branchResult.rows[0]?.id || 1
                }
            },
            { 
                username: 'manager.branch2', 
                password: 'password123', 
                role: 'manager',
                staff: {
                    first_name: 'Manager',
                    last_name: 'Branch2',
                    license_number: 'MGR-002',
                    phone: '+94771111112',
                    email: 'manager.branch2@medsync.lk',
                    branch_id: branchResult.rows[1]?.id || 2
                }
            },
            { 
                username: 'manager.branch3', 
                password: 'password123', 
                role: 'manager',
                staff: {
                    first_name: 'Manager',
                    last_name: 'Branch3',
                    license_number: 'MGR-003',
                    phone: '+94771111113',
                    email: 'manager.branch3@medsync.lk',
                    branch_id: branchResult.rows[2]?.id || 3
                }
            },
            
            // Doctors
            { 
                username: 'dr.silva', 
                password: 'password123', 
                role: 'doctor',
                staff: {
                    first_name: 'Kasun',
                    last_name: 'Silva',
                    specialty_id: specialtyResult.rows[0]?.id || 1,
                    license_number: 'SLMC-12345',
                    phone: '+94771234567',
                    email: 'k.silva@medsync.lk',
                    branch_id: branchResult.rows[0]?.id || 1
                }
            },
            { 
                username: 'dr.perera', 
                password: 'password123', 
                role: 'doctor',
                staff: {
                    first_name: 'Amila',
                    last_name: 'Perera',
                    specialty_id: specialtyResult.rows[1]?.id || 2,
                    license_number: 'SLMC-67890',
                    phone: '+94772345678',
                    email: 'a.perera@medsync.lk',
                    branch_id: branchResult.rows[1]?.id || 2
                }
            },
            { 
                username: 'dr.jayawardena', 
                password: 'password123', 
                role: 'doctor',
                staff: {
                    first_name: 'Ruwan',
                    last_name: 'Jayawardena',
                    specialty_id: specialtyResult.rows[2]?.id || 3,
                    license_number: 'SLMC-11223',
                    phone: '+94773456781',
                    email: 'r.jayawardena@medsync.lk',
                    branch_id: branchResult.rows[2]?.id || 3
                }
            },
            
            // Nurses
            { 
                username: 'nurse.fernando', 
                password: 'password123', 
                role: 'nurse',
                staff: {
                    first_name: 'Nimalka',
                    last_name: 'Fernando',
                    license_number: 'NUR-001',
                    phone: '+94773456789',
                    email: 'n.fernando@medsync.lk',
                    branch_id: branchResult.rows[0]?.id || 1
                }
            },
            { 
                username: 'nurse.dias', 
                password: 'password123', 
                role: 'nurse',
                staff: {
                    first_name: 'Saman',
                    last_name: 'Dias',
                    license_number: 'NUR-002',
                    phone: '+94773456790',
                    email: 's.dias@medsync.lk',
                    branch_id: branchResult.rows[1]?.id || 2
                }
            },
            { 
                username: 'nurse.gamage', 
                password: 'password123', 
                role: 'nurse',
                staff: {
                    first_name: 'Priyanka',
                    last_name: 'Gamage',
                    license_number: 'NUR-003',
                    phone: '+94773456791',
                    email: 'p.gamage@medsync.lk',
                    branch_id: branchResult.rows[2]?.id || 3
                }
            },
            
            // Receptionists
            { 
                username: 'reception.mendis', 
                password: 'password123', 
                role: 'receptionist',
                staff: {
                    first_name: 'Chamari',
                    last_name: 'Mendis',
                    license_number: 'REC-001',
                    phone: '+94774567890',
                    email: 'c.mendis@medsync.lk',
                    branch_id: branchResult.rows[0]?.id || 1
                }
            },
            { 
                username: 'reception.weerasinghe', 
                password: 'password123', 
                role: 'receptionist',
                staff: {
                    first_name: 'Thilini',
                    last_name: 'Weerasinghe',
                    license_number: 'REC-002',
                    phone: '+94774567891',
                    email: 't.weerasinghe@medsync.lk',
                    branch_id: branchResult.rows[1]?.id || 2
                }
            },
            { 
                username: 'reception.rajapaksha', 
                password: 'password123', 
                role: 'receptionist',
                staff: {
                    first_name: 'Sanduni',
                    last_name: 'Rajapaksha',
                    license_number: 'REC-003',
                    phone: '+94774567892',
                    email: 's.rajapaksha@medsync.lk',
                    branch_id: branchResult.rows[2]?.id || 3
                }
            }
        ];

        const userMap = new Map(); // username -> user_id
        
        for (const user of users) {
            try {
                // Check if user already exists
                const existingUser = await client.query(
                    "SELECT id FROM users WHERE username = $1",
                    [user.username]
                );

                let userId;
                if (existingUser.rows.length > 0) {
                    console.log(`  ⚠️  User '${user.username}' already exists, using existing ID`);
                    userId = existingUser.rows[0].id;
                } else {
                    // Hash password with Argon2
                    const password_hash = await argon2.hash(user.password, { timeCost: 3 });

                    // Insert user
                    const result = await client.query(
                        "INSERT INTO users(username, password_hash, role) VALUES ($1, $2, $3) RETURNING id",
                        [user.username, password_hash, user.role]
                    );

                    userId = result.rows[0].id;
                    console.log(`  ✓ Created user '${user.username}' with role '${user.role}'`);
                }
                
                userMap.set(user.username, { userId, staff: user.staff });
            } catch (err) {
                console.error(`  ✗ Error creating user '${user.username}':`, err.message);
                throw err;
            }
        }

        // Step 2: Create medical staff records for all staff users
        console.log("\nStep 2: Creating medical staff records...");
        
        for (const [username, data] of userMap.entries()) {
            if (!data.staff) continue; // Skip admin
            
            try {
                // Check if medical staff already exists
                const existingStaff = await client.query(
                    "SELECT id FROM medical_staff WHERE user_id = $1",
                    [data.userId]
                );

                if (existingStaff.rows.length > 0) {
                    console.log(`  ⚠️  Medical staff for ${username} already exists, skipping...`);
                    continue;
                }

                const staff = data.staff;
                await client.query(
                    `INSERT INTO medical_staff 
                     (user_id, first_name, last_name, specialty_id, license_number, phone, email, branch_id, is_active)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
                    [
                        data.userId, 
                        staff.first_name, 
                        staff.last_name, 
                        staff.specialty_id || null, 
                        staff.license_number, 
                        staff.phone, 
                        staff.email, 
                        staff.branch_id
                    ]
                );

                console.log(`  ✓ Created medical staff: ${staff.first_name} ${staff.last_name} (${username})`);
            } catch (err) {
                console.error(`  ✗ Error creating medical staff for ${username}:`, err.message);
                throw err;
            }
        }

        await client.query('COMMIT');
        
        console.log("\n✓ Data seeding completed successfully!");
        console.log("\n=== Test User Credentials ===");
        console.log("\n📋 Admin Account:");
        console.log("  Username: admin");
        console.log("  Password: password123");
        console.log("  Role: admin");
        console.log("  Permissions: Full system access");
        
        console.log("\n👔 Branch Manager Accounts:");
        console.log("  Username: manager.branch1 / Password: password123");
        console.log("  Role: manager (Branch 1 - Colombo)");
        console.log("  Username: manager.branch2 / Password: password123");
        console.log("  Role: manager (Branch 2 - Kandy)");
        console.log("  Username: manager.branch3 / Password: password123");
        console.log("  Role: manager (Branch 3 - Galle)");
        console.log("  Permissions: Manage staff in their branch, view reports");
        
        console.log("\n👨‍⚕️ Doctor Accounts:");
        console.log("  Username: dr.silva / Password: password123");
        console.log("  Role: doctor (Branch 1 - Colombo)");
        console.log("  Username: dr.perera / Password: password123");
        console.log("  Role: doctor (Branch 2 - Kandy)");
        console.log("  Username: dr.jayawardena / Password: password123");
        console.log("  Role: doctor (Branch 3 - Galle)");
        console.log("  Permissions: Manage treatments, appointments, patients");
        
        console.log("\n👩‍⚕️ Nurse Accounts:");
        console.log("  Username: nurse.fernando / Password: password123");
        console.log("  Role: nurse (Branch 1 - Colombo)");
        console.log("  Username: nurse.dias / Password: password123");
        console.log("  Role: nurse (Branch 2 - Kandy)");
        console.log("  Username: nurse.gamage / Password: password123");
        console.log("  Role: nurse (Branch 3 - Galle)");
        console.log("  Permissions: Manage appointments, patients, invoices");
        
        console.log("\n📞 Receptionist Accounts:");
        console.log("  Username: reception.mendis / Password: password123");
        console.log("  Role: receptionist (Branch 1 - Colombo)");
        console.log("  Username: reception.weerasinghe / Password: password123");
        console.log("  Role: receptionist (Branch 2 - Kandy)");
        console.log("  Username: reception.rajapaksha / Password: password123");
        console.log("  Role: receptionist (Branch 3 - Galle)");
        console.log("  Permissions: Manage appointments, patients, invoices");
        
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


/**
 * Database Setup Verification Script
 * Run this to verify your database is properly configured
 * 
 * Usage: node server/verifySetup.js
 */

const pool = require("./config/db");

async function verifySetup() {
    console.log("╔════════════════════════════════════════════╗");
    console.log("║   MedSync Database Setup Verification     ║");
    console.log("╚════════════════════════════════════════════╝\n");

    const checks = [];
    let allPassed = true;

    try {
        // Test 1: Database connection
        console.log("🔍 Testing database connection...");
        await pool.query('SELECT NOW()');
        checks.push({ test: "Database Connection", status: "✓ PASS", details: "Connection successful" });
        console.log("   ✓ Connection successful\n");

        // Test 2: Check tables exist
        console.log("🔍 Checking if all required tables exist...");
        const requiredTables = [
            'users', 'addresses', 'branches', 'medical_staff', 'patients',
            'specialties', 'treatments', 'treatment_categories', 'appointments',
            'invoices', 'payments', 'insurance_providers', 'patient_insurance',
            'insurance_claims', 'treatment_records', 'audit_log', 'session'
        ];

        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        `);
        const existingTables = tablesResult.rows.map(row => row.table_name);
        
        const missingTables = requiredTables.filter(t => !existingTables.includes(t));
        
        if (missingTables.length === 0) {
            checks.push({ test: "Required Tables", status: "✓ PASS", details: `All ${requiredTables.length} tables exist` });
            console.log(`   ✓ All ${requiredTables.length} required tables exist\n`);
        } else {
            checks.push({ test: "Required Tables", status: "✗ FAIL", details: `Missing: ${missingTables.join(', ')}` });
            console.log(`   ✗ Missing tables: ${missingTables.join(', ')}\n`);
            allPassed = false;
        }

        // Test 3: Check ENUM types
        console.log("🔍 Checking ENUM types...");
        const enumsResult = await pool.query(`
            SELECT typname FROM pg_type WHERE typtype = 'e'
        `);
        const enums = enumsResult.rows.map(row => row.typname);
        const requiredEnums = ['role', 'appointment_status', 'appointment_type', 'invoice_status', 'payment_method', 'claim_status'];
        const missingEnums = requiredEnums.filter(e => !enums.includes(e));
        
        if (missingEnums.length === 0) {
            checks.push({ test: "ENUM Types", status: "✓ PASS", details: `All ${requiredEnums.length} ENUMs defined` });
            console.log(`   ✓ All ${requiredEnums.length} ENUM types exist\n`);
        } else {
            checks.push({ test: "ENUM Types", status: "✗ FAIL", details: `Missing: ${missingEnums.join(', ')}` });
            console.log(`   ✗ Missing ENUMs: ${missingEnums.join(', ')}\n`);
            allPassed = false;
        }

        // Test 4: Check seed data
        console.log("🔍 Checking seed data...");
        
        const branchCount = await pool.query('SELECT COUNT(*) FROM branches');
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        const staffCount = await pool.query('SELECT COUNT(*) FROM medical_staff');
        const treatmentCount = await pool.query('SELECT COUNT(*) FROM treatments');
        const specialtyCount = await pool.query('SELECT COUNT(*) FROM specialties');
        
        const seedResults = {
            branches: parseInt(branchCount.rows[0].count),
            users: parseInt(userCount.rows[0].count),
            medical_staff: parseInt(staffCount.rows[0].count),
            treatments: parseInt(treatmentCount.rows[0].count),
            specialties: parseInt(specialtyCount.rows[0].count)
        };

        console.log(`   Branches: ${seedResults.branches} (expected: ≥2)`);
        console.log(`   Users: ${seedResults.users} (expected: ≥3)`);
        console.log(`   Medical Staff: ${seedResults.medical_staff} (expected: ≥2)`);
        console.log(`   Treatments: ${seedResults.treatments} (expected: ≥5)`);
        console.log(`   Specialties: ${seedResults.specialties} (expected: ≥3)\n`);

        if (seedResults.branches >= 2 && seedResults.treatments >= 5 && seedResults.specialties >= 3) {
            if (seedResults.users >= 3 && seedResults.medical_staff >= 2) {
                checks.push({ test: "Seed Data", status: "✓ PASS", details: "All seed data present" });
                console.log("   ✓ All seed data present\n");
            } else {
                checks.push({ test: "Seed Data", status: "⚠ WARN", details: "Run: node server/seedUsers.js" });
                console.log("   ⚠ Warning: Users/staff missing. Run: node server/seedUsers.js\n");
            }
        } else {
            checks.push({ test: "Seed Data", status: "✗ FAIL", details: "Incomplete seed data" });
            console.log("   ✗ Seed data incomplete. Re-run database.sql\n");
            allPassed = false;
        }

        // Test 5: Check foreign key relationships
        console.log("🔍 Testing foreign key relationships...");
        try {
            await pool.query(`
                SELECT p.id, p.first_name, a.city, b.name 
                FROM patients p 
                JOIN addresses a ON p.address_id = a.id 
                JOIN branches b ON p.registered_branch = b.id 
                LIMIT 1
            `);
            checks.push({ test: "Foreign Keys", status: "✓ PASS", details: "Patient relationships work" });
            console.log("   ✓ Patient foreign keys working\n");
        } catch (err) {
            checks.push({ test: "Foreign Keys", status: "✗ FAIL", details: err.message });
            console.log("   ✗ Foreign key test failed:", err.message, "\n");
            allPassed = false;
        }

        // Test 6: Check authentication setup
        console.log("🔍 Checking authentication configuration...");
        const adminUser = await pool.query("SELECT id, username, role FROM users WHERE username = 'admin'");
        
        if (adminUser.rows.length > 0) {
            checks.push({ test: "Authentication", status: "✓ PASS", details: "Admin user exists" });
            console.log("   ✓ Admin user found\n");
        } else {
            checks.push({ test: "Authentication", status: "✗ FAIL", details: "Admin user not found. Run seedUsers.js" });
            console.log("   ✗ Admin user not found. Run: node server/seedUsers.js\n");
            allPassed = false;
        }

        // Summary
        console.log("╔════════════════════════════════════════════╗");
        console.log("║           Verification Summary             ║");
        console.log("╚════════════════════════════════════════════╝\n");

        checks.forEach(check => {
            console.log(`${check.status} ${check.test}: ${check.details}`);
        });

        console.log("\n" + "═".repeat(46) + "\n");

        if (allPassed && seedResults.users >= 3) {
            console.log("🎉 All checks passed! Your database is ready.");
            console.log("\nYou can now:");
            console.log("  1. Start the backend: npm start");
            console.log("  2. Start the frontend: cd ../medsync-react && npm run dev");
            console.log("  3. Log in with username: admin, password: password123");
        } else if (seedResults.users < 3) {
            console.log("⚠️  Setup incomplete. Please run:");
            console.log("  node server/seedUsers.js");
        } else {
            console.log("❌ Some checks failed. Please review the errors above.");
            console.log("\nTo fix:");
            console.log("  1. Drop and recreate: psql -d medsync_db -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'");
            console.log("  2. Re-run schema: psql -d medsync_db -f server/database.sql");
            console.log("  3. Seed users: node server/seedUsers.js");
        }

        console.log("\n");
        process.exit(allPassed ? 0 : 1);

    } catch (err) {
        console.error("\n❌ Verification failed with error:");
        console.error(err.message);
        console.error("\nPlease check:");
        console.error("  1. PostgreSQL is running");
        console.error("  2. Database credentials in config/db.js are correct");
        console.error("  3. Database 'medsync_db' exists");
        console.error("\n");
        process.exit(1);
    }
}

verifySetup();


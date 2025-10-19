/**
 * Seed Test Database Script
 * Populates the test database with users and medical staff
 */
const { Pool } = require('pg');
const argon2 = require('argon2');

const pool = new Pool({
  connectionString: 'postgresql://postgres:password@localhost:5432/medsync_test_db'
});

async function seedTestDatabase() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    console.log('Starting test database seeding...\n');

    // Hash password once
    const hashedPassword = await argon2.hash('password123');

    // Step 1: Create users
    console.log('Step 1: Creating users...');
    const users = [
      { username: 'admin', role: 'admin' },
      { username: 'manager.branch1', role: 'manager' },
      { username: 'manager.branch2', role: 'manager' },
      { username: 'manager.branch3', role: 'manager' },
      { username: 'dr.silva', role: 'doctor' },
      { username: 'dr.perera', role: 'doctor' },
      { username: 'dr.jayawardena', role: 'doctor' },
      { username: 'nurse.fernando', role: 'nurse' },
      { username: 'nurse.dias', role: 'nurse' },
      { username: 'nurse.gamage', role: 'nurse' },
      { username: 'reception.mendis', role: 'receptionist' },
      { username: 'reception.weerasinghe', role: 'receptionist' },
      { username: 'reception.rajapaksha', role: 'receptionist' }
    ];

    const userIds = {};
    for (const user of users) {
      const result = await client.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [user.username, hashedPassword, user.role]
      );
      userIds[user.username] = result.rows[0].id;
      console.log(`  ✓ Created user: ${user.username} (${user.role})`);
    }

    // Step 2: Create medical staff
    console.log('\nStep 2: Creating medical staff...');
    const staffData = [
      { username: 'dr.silva', firstName: 'Kasun', lastName: 'Silva', specialtyId: 1, license: 'SLMC-12345', phone: '+94771234567', email: 'k.silva@medsync.lk', branchId: 1 },
      { username: 'dr.perera', firstName: 'Amila', lastName: 'Perera', specialtyId: 2, license: 'SLMC-67890', phone: '+94772345678', email: 'a.perera@medsync.lk', branchId: 2 },
      { username: 'dr.jayawardena', firstName: 'Ruwan', lastName: 'Jayawardena', specialtyId: 3, license: 'SLMC-11111', phone: '+94773456789', email: 'r.jayawardena@medsync.lk', branchId: 3 },
      { username: 'nurse.fernando', firstName: 'Nimalka', lastName: 'Fernando', specialtyId: null, license: 'SLNC-12345', phone: '+94774567890', email: 'n.fernando@medsync.lk', branchId: 1 },
      { username: 'nurse.dias', firstName: 'Saman', lastName: 'Dias', specialtyId: null, license: 'SLNC-67890', phone: '+94775678901', email: 's.dias@medsync.lk', branchId: 2 },
      { username: 'nurse.gamage', firstName: 'Priyanka', lastName: 'Gamage', specialtyId: null, license: 'SLNC-11111', phone: '+94776789012', email: 'p.gamage@medsync.lk', branchId: 3 },
      { username: 'reception.mendis', firstName: 'Chamari', lastName: 'Mendis', specialtyId: null, license: null, phone: '+94777890123', email: 'c.mendis@medsync.lk', branchId: 1 },
      { username: 'reception.weerasinghe', firstName: 'Thilini', lastName: 'Weerasinghe', specialtyId: null, license: null, phone: '+94778901234', email: 't.weerasinghe@medsync.lk', branchId: 2 },
      { username: 'reception.rajapaksha', firstName: 'Sanduni', lastName: 'Rajapaksha', specialtyId: null, license: null, phone: '+94779012345', email: 's.rajapaksha@medsync.lk', branchId: 3 },
      { username: 'manager.branch1', firstName: 'Manager', lastName: 'Branch1', specialtyId: null, license: null, phone: '+94770123456', email: 'manager.b1@medsync.lk', branchId: 1 },
      { username: 'manager.branch2', firstName: 'Manager', lastName: 'Branch2', specialtyId: null, license: null, phone: '+94771234567', email: 'manager.b2@medsync.lk', branchId: 2 },
      { username: 'manager.branch3', firstName: 'Manager', lastName: 'Branch3', specialtyId: null, license: null, phone: '+94772345678', email: 'manager.b3@medsync.lk', branchId: 3 }
    ];

    for (const staff of staffData) {
      await client.query(
        'INSERT INTO medical_staff (user_id, first_name, last_name, specialty_id, license_number, phone, email, branch_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [userIds[staff.username], staff.firstName, staff.lastName, staff.specialtyId, staff.license, staff.phone, staff.email, staff.branchId, true]
      );
      console.log(`  ✓ Created medical staff: ${staff.firstName} ${staff.lastName}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Test database seeded successfully!');
    
    // Verify
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const staffCount = await client.query('SELECT COUNT(*) FROM medical_staff');
    console.log(`\nVerification:`);
    console.log(`  - Users: ${userCount.rows[0].count}`);
    console.log(`  - Medical Staff: ${staffCount.rows[0].count}`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding test database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedTestDatabase().catch(console.error);

# MedSync Database Setup Guide

This guide will help you set up the complete database schema for the MedSync clinic management system.

## Prerequisites

- PostgreSQL installed and running
- Node.js and npm installed
- Database created (e.g., `medsync_db`)

## Step-by-Step Setup

### 1. Create the Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE medsync_db;

# Exit psql
\q
```

### 2. Run the Database Schema

```bash
# Navigate to the backend directory
cd MedSync-Backend/server

# Run the database.sql file
psql -U postgres -d medsync_db -f database.sql
```

This will create:
- All ENUM types (role, appointment_status, etc.)
- Core tables (addresses, branches, users, etc.)
- Patient management tables
- Treatment and appointment tables
- Billing and insurance tables
- Audit logging system
- Sample data (branches, specialties, treatments, test patients, etc.)

### 3. Seed Users and Medical Staff

The database.sql file does NOT include users (because they need Argon2 password hashing). You must run the seed script:

```bash
# Make sure you're in the MedSync-Backend directory
cd MedSync-Backend

# Run the seed script
node server/seedUsers.js
```

This will create:
- 1 admin user (username: `admin`, password: `password123`)
- 2 doctor users with medical staff records:
  - `dr.silva` (Dr. Kasun Silva - General Medicine at Colombo Branch)
  - `dr.perera` (Dr. Amila Perera - Cardiology at Kandy Branch)

### 4. Verify the Setup

Connect to the database and run verification queries:

```bash
psql -U postgres -d medsync_db
```

Run these queries:

```sql
-- Check tables were created
\dt

-- Verify seed data
SELECT COUNT(*) FROM branches;        -- Should return 2
SELECT COUNT(*) FROM users;           -- Should return 3 (after running seedUsers.js)
SELECT COUNT(*) FROM medical_staff;   -- Should return 2 (after running seedUsers.js)
SELECT COUNT(*) FROM treatments;      -- Should return 5
SELECT COUNT(*) FROM patients;        -- Should return 2

-- Check foreign key relationships work
SELECT 
    p.id, 
    p.first_name, 
    p.last_name,
    a.city as address_city,
    b.name as branch_name
FROM patients p
JOIN addresses a ON p.address_id = a.id
JOIN branches b ON p.registered_branch = b.id;

-- Check appointments with all relationships
SELECT 
    a.id,
    a.appointment_datetime,
    a.status,
    p.first_name || ' ' || p.last_name as patient_name,
    m.first_name || ' ' || m.last_name as doctor_name,
    b.name as branch_name
FROM appointments a
JOIN patients p ON a.patient_id = p.id
JOIN medical_staff m ON a.doctor_id = m.id
JOIN branches b ON a.branch_id = b.id;
```

### 5. Configure Database Connection

Make sure your backend's database configuration matches your setup:

**File**: `MedSync-Backend/server/config/db.js`

```javascript
const pool = new Pool({
    user: 'postgres',        // Your PostgreSQL username
    host: 'localhost',
    database: 'medsync_db',  // Your database name
    password: 'your_password',
    port: 5432,
});
```

### 6. Start the Backend Server

```bash
cd MedSync-Backend
npm install
npm start
```

The server should start without database errors.

## Default Login Credentials

After running the seed script, you can log in with:

**Admin Account:**
- Username: `admin`
- Password: `password123`

**Doctor Accounts:**
- Username: `dr.silva` / Password: `password123`
- Username: `dr.perera` / Password: `password123`

⚠️ **IMPORTANT**: Change these passwords in production!

## Database Schema Overview

### Core Tables
- `users` - Authentication (username, password_hash, role)
- `branches` - Clinic branches
- `addresses` - Address records for branches and patients
- `specialties` - Medical specialties
- `medical_staff` - Doctors and staff (linked to users)

### Patient Management
- `patients` - Patient records
- `patient_contacts` - Emergency contacts
- `patient_insurance` - Insurance policies
- `insurance_providers` - Insurance companies

### Appointments & Treatments
- `appointments` - Scheduled appointments
- `treatment_categories` - Categories like Consultation, Diagnostic
- `treatments` - Service catalog with prices
- `treatment_records` - Actual treatments performed

### Billing
- `invoices` - Patient invoices
- `payments` - Payment records
- `insurance_claims` - Insurance claim tracking

### Audit
- `audit_log` - Change tracking for all operations
- `session` - Express session storage

## Testing the System

### Test Patient Registration
```bash
curl -X POST http://localhost:3000/api/patients \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Test",
    "last_name": "Patient",
    "date_of_birth": "1990-01-01",
    "gender": "Male",
    "address": {
      "line1": "123 Test St",
      "city": "Colombo",
      "postal_code": "00100"
    },
    "phone": "+94771234567",
    "email": "test@example.com",
    "registered_branch": 1
  }'
```

### Test Appointment Creation
```bash
curl -X POST http://localhost:3000/api/appointments \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": 1,
    "doctor_id": 1,
    "branch_id": 1,
    "appointment_datetime": "2024-12-20T10:00:00",
    "type": "Regular",
    "notes": "Regular checkup"
  }'
```

## Troubleshooting

### Foreign Key Violations
If you get foreign key violations:
1. Make sure database.sql was run completely
2. Verify seed script ran successfully: `node server/seedUsers.js`
3. Check that referenced records exist (branches, doctors, etc.)

### User Authentication Issues
If login fails:
1. Verify users were created via seed script (not directly in SQL)
2. Check password hashes are Argon2 format
3. Re-run seed script if needed: `node server/seedUsers.js`

### Missing Tables
If tables are missing:
```bash
# Drop and recreate everything
psql -U postgres -d medsync_db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

# Re-run schema
psql -U postgres -d medsync_db -f database.sql

# Re-run seed script
node server/seedUsers.js
```

## Adding More Test Data

You can add more test data directly via SQL or through the API:

### Add More Branches
```sql
INSERT INTO addresses (line1, city, postal_code) 
VALUES ('789 New Road', 'Galle', '80000');

INSERT INTO branches (name, address_id, phone, email) 
VALUES ('Galle Branch', <address_id>, '+94912345678', 'galle@medsync.lk');
```

### Add More Treatments
```sql
INSERT INTO treatments (name, description, price, category_id) 
VALUES ('X-Ray', 'Chest X-Ray examination', 3000.00, 2);
```

## Schema Modifications

If you need to modify the schema, remember to update:
1. `database.sql` - The schema definition
2. Backend controllers - To match new fields
3. Frontend forms - To collect new data
4. This documentation

## Next Steps

1. ✅ Database setup complete
2. ✅ Test users created
3. 🔲 Configure frontend API endpoints
4. 🔲 Test patient registration flow
5. 🔲 Test appointment booking flow
6. 🔲 Test billing and invoicing


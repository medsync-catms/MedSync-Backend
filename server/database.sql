-- MedSync CATMS PostgreSQL Database Schema
-- Complete schema for clinic appointment and treatment management system

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE role AS ENUM ('admin', 'doctor', 'nurse', 'receptionist', 'manager');
CREATE TYPE appointment_status AS ENUM ('Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled', 'No Show');
CREATE TYPE appointment_type AS ENUM ('Regular', 'Emergency', 'Walk-in', 'Follow-up');
CREATE TYPE invoice_status AS ENUM ('Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled');
CREATE TYPE payment_method AS ENUM ('Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Insurance', 'Cheque');
CREATE TYPE claim_status AS ENUM ('Submitted', 'Under Review', 'Approved', 'Rejected', 'Paid', 'Cancelled');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Addresses table
CREATE TABLE addresses (
    id SERIAL PRIMARY KEY,
    line1 TEXT NOT NULL,
    line2 TEXT,
    city TEXT NOT NULL,
    state TEXT,
    postal_code TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Branches table
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    address_id INTEGER NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
    phone TEXT,
    email TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Branch hours table
CREATE TABLE branch_hours (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    UNIQUE(branch_id, day_of_week)
);

-- Users table (for authentication and authorization)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role role NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session table (for express-session)
CREATE TABLE session (
    sid varchar NOT NULL COLLATE "default",
    sess json NOT NULL,
    expire timestamp(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid)
) WITH (OIDS=FALSE);

CREATE INDEX idx_session_expire ON session (expire);

-- Specialties table
CREATE TABLE specialties (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Medical staff table
CREATE TABLE medical_staff (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    specialty_id INTEGER REFERENCES specialties(id) ON DELETE SET NULL,
    license_number TEXT UNIQUE,
    phone TEXT,
    email TEXT,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PATIENT TABLES
-- ============================================================================

-- Patients table
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    gender TEXT NOT NULL,  -- Using TEXT for flexibility (Male, Female, Other, Prefer not to say)
    address_id INTEGER NOT NULL REFERENCES addresses(id) ON DELETE RESTRICT,
    phone TEXT NOT NULL,
    email TEXT,
    registered_branch INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient emergency contacts table
CREATE TABLE patient_contacts (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    relation TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insurance providers table
CREATE TABLE insurance_providers (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    contact_info JSONB,
    processing_requirements TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Patient insurance policies table
CREATE TABLE patient_insurance (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES insurance_providers(id) ON DELETE RESTRICT,
    policy_number TEXT NOT NULL,
    coverage_details JSONB,
    expiration_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(patient_id, provider_id, policy_number)
);

-- ============================================================================
-- TREATMENT/SERVICE TABLES
-- ============================================================================

-- Treatment categories table
CREATE TABLE treatment_categories (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Treatments/Services catalog table
CREATE TABLE treatments (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    category_id INTEGER NOT NULL REFERENCES treatment_categories(id) ON DELETE RESTRICT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Appointments table
CREATE TABLE appointments (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id INTEGER NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    appointment_datetime TIMESTAMP NOT NULL,
    status appointment_status DEFAULT 'Scheduled',
    type appointment_type DEFAULT 'Regular',
    notes TEXT,
    cancellation_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Treatment records table (what was actually performed during appointment)
CREATE TABLE treatment_records (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
    treatment_id INTEGER NOT NULL REFERENCES treatments(id) ON DELETE RESTRICT,
    quantity INTEGER DEFAULT 1 CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    consultation_notes TEXT,
    recorded_by INTEGER NOT NULL REFERENCES medical_staff(id) ON DELETE RESTRICT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- BILLING TABLES
-- ============================================================================

-- Invoices table
CREATE TABLE invoices (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
    invoice_number TEXT UNIQUE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    status invoice_status DEFAULT 'Draft',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payments table
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    payment_method payment_method NOT NULL,
    payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    transaction_reference TEXT,
    processed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insurance claims table
CREATE TABLE insurance_claims (
    id SERIAL PRIMARY KEY,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    patient_insurance_id INTEGER NOT NULL REFERENCES patient_insurance(id) ON DELETE RESTRICT,
    claim_number TEXT UNIQUE NOT NULL,
    claim_amount DECIMAL(10,2) NOT NULL CHECK (claim_amount >= 0),
    approved_amount DECIMAL(10,2) DEFAULT 0 CHECK (approved_amount >= 0),
    status claim_status DEFAULT 'Submitted',
    submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    response_date TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================

-- Audit log table
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Audit trigger function (simplified version for compatibility)
CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id TEXT;
BEGIN
    BEGIN
        v_user_id := current_setting('myapp.user_id');
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO audit_log (table_name, action, record_id, new_values, user_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id::TEXT, row_to_json(NEW), v_user_id::INTEGER);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO audit_log (table_name, action, record_id, old_values, new_values, user_id)
        VALUES (TG_TABLE_NAME, TG_OP, NEW.id::TEXT, row_to_json(OLD), row_to_json(NEW), v_user_id::INTEGER);
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO audit_log (table_name, action, record_id, old_values, user_id)
        VALUES (TG_TABLE_NAME, TG_OP, OLD.id::TEXT, row_to_json(OLD), v_user_id::INTEGER);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for patients table
CREATE TRIGGER patients_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON patients
FOR EACH ROW EXECUTE FUNCTION log_changes();

-- ============================================================================
-- SEED DATA (Minimal test data)
-- ============================================================================

-- Insert addresses for branches
INSERT INTO addresses (line1, line2, city, state, postal_code) VALUES
('123 Galle Road', NULL, 'Colombo', 'Western Province', '00300'),
('456 Temple Street', 'Near Clock Tower', 'Kandy', 'Central Province', '20000'),
('789 Beach Road', NULL, 'Galle', 'Southern Province', '80000');

-- Insert branches
INSERT INTO branches (name, address_id, phone, email, is_active) VALUES
('Colombo Branch', 1, '+94112345678', 'colombo@medsync.lk', true),
('Kandy Branch', 2, '+94812345678', 'kandy@medsync.lk', true),
('Galle Branch', 3, '+94912345678', 'galle@medsync.lk', true);

-- Insert branch hours (Monday to Friday, 8 AM to 6 PM for both branches)
INSERT INTO branch_hours (branch_id, day_of_week, open_time, close_time) VALUES
(1, 1, '08:00:00', '18:00:00'), -- Monday
(1, 2, '08:00:00', '18:00:00'), -- Tuesday
(1, 3, '08:00:00', '18:00:00'), -- Wednesday
(1, 4, '08:00:00', '18:00:00'), -- Thursday
(1, 5, '08:00:00', '18:00:00'), -- Friday
(2, 1, '08:00:00', '18:00:00'),
(2, 2, '08:00:00', '18:00:00'),
(2, 3, '08:00:00', '18:00:00'),
(2, 4, '08:00:00', '18:00:00'),
(2, 5, '08:00:00', '18:00:00');

-- Insert specialties
INSERT INTO specialties (name) VALUES
('General Medicine'),
('Cardiology'),
('Dermatology');

-- ============================================================================
-- USER SEEDING - IMPORTANT!
-- ============================================================================
-- Users require Argon2 password hashing. After running this SQL file,
-- run the seed script to create users and medical staff:
--   $ node server/seedUsers.js
--
-- Alternatively, create users manually via the API:
--   POST /api/auth/register
--   Body: {"username": "admin", "password": "password123", "role": "admin"}
-- ============================================================================

-- Medical staff will be created by the seedUsers.js script
-- (Commented out because they depend on user accounts)
-- INSERT INTO medical_staff (user_id, first_name, last_name, specialty_id, license_number, phone, email, branch_id, is_active) VALUES
-- (2, 'Kasun', 'Silva', 1, 'SLMC-12345', '+94771234567', 'k.silva@medsync.lk', 1, true),
-- (3, 'Amila', 'Perera', 2, 'SLMC-67890', '+94772345678', 'a.perera@medsync.lk', 2, true);

-- Insert treatment categories
INSERT INTO treatment_categories (name) VALUES
('Consultation'),
('Diagnostic'),
('Treatment');

-- Insert treatments
INSERT INTO treatments (name, description, price, category_id, is_active) VALUES
('General Consultation', 'Standard doctor consultation', 2500.00, 1, true),
('Cardiology Consultation', 'Specialist cardiology consultation', 5000.00, 1, true),
('Blood Test - Full Panel', 'Complete blood count and chemistry panel', 3500.00, 2, true),
('ECG', 'Electrocardiogram test', 2000.00, 2, true),
('Medication - Basic', 'Standard medication prescription', 1500.00, 3, true);

-- Insert insurance providers
INSERT INTO insurance_providers (name, contact_info, is_active) VALUES
('Lanka Health Insurance', '{"phone": "+94112223333", "email": "claims@lankahealthins.lk"}', true),
('National Insurance Trust', '{"phone": "+94112224444", "email": "medical@nit.lk"}', true);

-- Insert sample patient addresses
INSERT INTO addresses (line1, line2, city, state, postal_code) VALUES
('789 Duplication Road', 'Apartment 5B', 'Colombo', 'Western Province', '00400'),
('321 Peradeniya Road', NULL, 'Kandy', 'Central Province', '20100');

-- Insert sample patients
INSERT INTO patients (first_name, last_name, date_of_birth, gender, address_id, phone, email, registered_branch, is_active) VALUES
('Nimal', 'Fernando', '1985-05-15', 'Male', 3, '+94771111111', 'nimal.fernando@email.lk', 1, true),
('Sita', 'Rajapaksa', '1990-08-22', 'Female', 4, '+94772222222', 'sita.rajapaksa@email.lk', 2, true);

-- Insert patient emergency contacts
INSERT INTO patient_contacts (patient_id, name, phone, relation) VALUES
(1, 'Kumari Fernando', '+94773333333', 'Spouse'),
(2, 'Mahesh Rajapaksa', '+94774444444', 'Sibling');

-- Insert sample patient insurance
INSERT INTO patient_insurance (patient_id, provider_id, policy_number, coverage_details, expiration_date, is_active) VALUES
(1, 1, 'LHI-2024-001234', '{"coverage_percentage": 80, "max_claim": 500000}', '2025-12-31', true);

-- Insert sample appointment
INSERT INTO appointments (patient_id, doctor_id, branch_id, appointment_datetime, status, type, notes) VALUES
(1, 1, 1, '2024-12-15 10:00:00', 'Scheduled', 'Regular', 'Regular checkup');

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these queries to verify the setup:
-- SELECT COUNT(*) FROM branches; -- Should return 2
-- SELECT COUNT(*) FROM medical_staff; -- Should return 2
-- SELECT COUNT(*) FROM patients; -- Should return 2
-- SELECT COUNT(*) FROM treatments; -- Should return 5
-- SELECT * FROM patients p JOIN addresses a ON p.address_id = a.id;
-- SELECT * FROM appointments a 
--   JOIN patients p ON a.patient_id = p.id 
--   JOIN medical_staff m ON a.doctor_id = m.id 
--   JOIN branches b ON a.branch_id = b.id;

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
ALTER TABLE patients
    ADD COLUMN Emergency_contact_name TEXT,
    ADD COLUMN Emergency_contact_phone TEXT,
    ADD COLUMN Emergency_contact_relation TEXT;

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

-- ============================================================================
-- AUDIT TRIGGERS FOR ALL CRITICAL TABLES
-- ============================================================================

-- Audit triggers for all critical tables
CREATE TRIGGER patients_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON patients
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER appointments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON appointments
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER invoices_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER payments_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER insurance_claims_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON insurance_claims
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER treatment_records_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON treatment_records
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER medical_staff_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON medical_staff
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER patient_insurance_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON patient_insurance
FOR EACH ROW EXECUTE FUNCTION log_changes();

CREATE TRIGGER users_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION log_changes();

-- ============================================================================
-- NOTIFICATION SYSTEM
-- ============================================================================

-- Notifications table for automated notifications
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL, -- 'appointment_reminder', 'invoice_overdue', 'insurance_expiring'
    recipient_id INTEGER, -- patient_id or user_id
    recipient_type TEXT, -- 'patient', 'staff'
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    related_table TEXT,
    related_id INTEGER,
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    scheduled_for TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INVOICE AUTOMATION TRIGGERS
-- ============================================================================

-- Function to auto-update invoice status on payment
CREATE OR REPLACE FUNCTION update_invoice_status_on_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate total payments for the invoice
    UPDATE invoices 
    SET status = CASE 
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE invoice_id = NEW.invoice_id) >= total_amount 
        THEN 'Paid'::invoice_status
        ELSE 'Sent'::invoice_status
    END,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.invoice_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment insert
CREATE TRIGGER payment_status_update_trigger
AFTER INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION update_invoice_status_on_payment();

-- Function to auto-generate invoice on appointment completion
CREATE OR REPLACE FUNCTION auto_generate_invoice()
RETURNS TRIGGER AS $$
DECLARE
    invoice_total DECIMAL(10,2);
    invoice_number TEXT;
    attempts INTEGER := 0;
    invoice_created BOOLEAN := FALSE;
BEGIN
    -- Only proceed if status changed to 'Completed'
    IF NEW.status = 'Completed' AND (OLD.status IS NULL OR OLD.status != 'Completed') THEN
        -- Check if invoice already exists
        IF EXISTS (SELECT 1 FROM invoices WHERE appointment_id = NEW.id) THEN
            RETURN NEW;
        END IF;
        
        -- Calculate total from treatment records
        SELECT COALESCE(SUM(total_price), 0) INTO invoice_total
        FROM treatment_records 
        WHERE appointment_id = NEW.id;
        
        -- Only create invoice if there are treatments
        IF invoice_total > 0 THEN
            -- Generate unique invoice number
            WHILE NOT invoice_created AND attempts < 5 LOOP
                BEGIN
                    invoice_number := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                                    LPAD(FLOOR(1000 + RANDOM() * 9000)::TEXT, 4, '0');
                    
                    INSERT INTO invoices(patient_id, appointment_id, invoice_number, total_amount, status)
                    VALUES (NEW.patient_id, NEW.id, invoice_number, invoice_total, 'Draft');
                    
                    invoice_created := TRUE;
                EXCEPTION WHEN unique_violation THEN
                    attempts := attempts + 1;
                END;
            END LOOP;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for appointment completion
CREATE TRIGGER auto_invoice_generation_trigger
AFTER UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION auto_generate_invoice();

-- ============================================================================
-- APPOINTMENT VALIDATION TRIGGERS
-- ============================================================================

-- Function to prevent appointment conflicts
CREATE OR REPLACE FUNCTION prevent_appointment_conflicts()
RETURNS TRIGGER AS $$
DECLARE
    conflict_count INTEGER;
    appointment_time TIMESTAMP;
    start_window TIMESTAMP;
    end_window TIMESTAMP;
BEGIN
    -- Get appointment time
    appointment_time := NEW.appointment_datetime;
    
    -- Calculate ±30 minute window
    start_window := appointment_time - INTERVAL '30 minutes';
    end_window := appointment_time + INTERVAL '30 minutes';
    
    -- Check for conflicts
    SELECT COUNT(*) INTO conflict_count
    FROM appointments
    WHERE doctor_id = NEW.doctor_id
      AND status NOT IN ('Cancelled', 'No Show')
      AND appointment_datetime BETWEEN start_window AND end_window;
    
    -- If updating, exclude the current appointment
    IF TG_OP = 'UPDATE' THEN
        conflict_count := conflict_count - 1;
    END IF;
    
    -- Raise exception if conflict found
    IF conflict_count > 0 THEN
        RAISE EXCEPTION 'Doctor has a conflicting appointment at this time (within 30 minutes)';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for appointment conflicts
CREATE TRIGGER appointment_conflict_trigger
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION prevent_appointment_conflicts();

-- Function to validate clinic hours
CREATE OR REPLACE FUNCTION validate_appointment_hours()
RETURNS TRIGGER AS $$
DECLARE
    appointment_date DATE;
    day_of_week_num INTEGER;
    appointment_time TIME;
    open_time TIME;
    close_time TIME;
    is_emergency BOOLEAN;
BEGIN
    -- Check if this is an emergency appointment (allow override)
    is_emergency := (NEW.type = 'Emergency');
    
    -- Skip validation for emergency appointments
    IF is_emergency THEN
        RETURN NEW;
    END IF;
    
    -- Extract date and time components
    appointment_date := NEW.appointment_datetime::DATE;
    day_of_week_num := EXTRACT(DOW FROM appointment_date);
    appointment_time := NEW.appointment_datetime::TIME;
    
    -- Get branch hours for the day
    SELECT bh.open_time, bh.close_time INTO open_time, close_time
    FROM branch_hours bh
    WHERE bh.branch_id = NEW.branch_id AND bh.day_of_week = day_of_week_num;
    
    -- If no hours found, clinic is closed
    IF open_time IS NULL THEN
        RAISE EXCEPTION 'Clinic is closed on this day of the week';
    END IF;
    
    -- Check if appointment is within hours
    IF appointment_time < open_time OR appointment_time >= close_time THEN
        RAISE EXCEPTION 'Appointment time must be between % and % (clinic operating hours)', open_time, close_time;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for clinic hours validation
CREATE TRIGGER appointment_hours_trigger
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION validate_appointment_hours();

-- Function to validate patient registration
CREATE OR REPLACE FUNCTION validate_patient_for_appointment()
RETURNS TRIGGER AS $$
DECLARE
    patient_record RECORD;
BEGIN
    -- Get patient details
    SELECT * INTO patient_record
    FROM patients
    WHERE id = NEW.patient_id;
    
    -- Check if patient exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Patient not found';
    END IF;
    
    -- Check if patient is active
    IF NOT patient_record.is_active THEN
        RAISE EXCEPTION 'Patient account is inactive';
    END IF;
    
    -- Check required fields
    IF patient_record.first_name IS NULL OR patient_record.first_name = '' THEN
        RAISE EXCEPTION 'Patient first name is required';
    END IF;
    
    IF patient_record.last_name IS NULL OR patient_record.last_name = '' THEN
        RAISE EXCEPTION 'Patient last name is required';
    END IF;
    
    IF patient_record.phone IS NULL OR patient_record.phone = '' THEN
        RAISE EXCEPTION 'Patient phone number is required';
    END IF;
    
    IF patient_record.date_of_birth IS NULL THEN
        RAISE EXCEPTION 'Patient date of birth is required';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for patient validation
CREATE TRIGGER appointment_patient_validation_trigger
BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION validate_patient_for_appointment();

-- ============================================================================
-- INSURANCE POLICY VALIDATION TRIGGERS
-- ============================================================================

-- Function to check insurance expiration
CREATE OR REPLACE FUNCTION check_insurance_expiration()
RETURNS TRIGGER AS $$
DECLARE
    policy_expired BOOLEAN;
    days_until_expiry INTEGER;
BEGIN
    -- Check if policy is expired
    policy_expired := NEW.expiration_date < CURRENT_DATE;
    
    IF policy_expired THEN
        -- Auto-deactivate expired policy
        UPDATE patient_insurance 
        SET is_active = FALSE 
        WHERE id = NEW.id;
        
        RAISE EXCEPTION 'Insurance policy has expired on %. Policy has been deactivated.', NEW.expiration_date;
    END IF;
    
    -- Check for upcoming expiration (generate warnings)
    days_until_expiry := NEW.expiration_date - CURRENT_DATE;
    
    IF days_until_expiry <= 30 AND days_until_expiry > 0 THEN
        -- Create notification for expiring policy
        INSERT INTO notifications (type, recipient_id, recipient_type, title, message, related_table, related_id)
        VALUES (
            'insurance_expiring',
            NEW.patient_id,
            'patient',
            'Insurance Policy Expiring Soon',
            'Your insurance policy expires in ' || days_until_expiry || ' days. Please renew your coverage.',
            'patient_insurance',
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for insurance expiration check
CREATE TRIGGER insurance_expiration_trigger
BEFORE INSERT OR UPDATE ON patient_insurance
FOR EACH ROW EXECUTE FUNCTION check_insurance_expiration();

-- Function to validate claim amounts
CREATE OR REPLACE FUNCTION validate_claim_amount()
RETURNS TRIGGER AS $$
DECLARE
    invoice_total DECIMAL(10,2);
    policy_coverage JSONB;
    max_claim_amount DECIMAL(10,2);
    coverage_percentage DECIMAL(5,2);
BEGIN
    -- Get invoice total
    SELECT total_amount INTO invoice_total
    FROM invoices
    WHERE id = NEW.invoice_id;
    
    -- Get policy coverage details
    SELECT coverage_details INTO policy_coverage
    FROM patient_insurance
    WHERE id = NEW.patient_insurance_id;
    
    -- Extract coverage information
    coverage_percentage := COALESCE((policy_coverage->>'coverage_percentage')::DECIMAL, 0);
    max_claim_amount := COALESCE((policy_coverage->>'max_claim')::DECIMAL, invoice_total);
    
    -- Validate claim amount doesn't exceed invoice total
    IF NEW.claim_amount > invoice_total THEN
        RAISE EXCEPTION 'Claim amount (%.2f) cannot exceed invoice total (%.2f)', NEW.claim_amount, invoice_total;
    END IF;
    
    -- Validate against policy max claim limit
    IF NEW.claim_amount > max_claim_amount THEN
        RAISE EXCEPTION 'Claim amount (%.2f) exceeds policy maximum claim limit (%.2f)', NEW.claim_amount, max_claim_amount;
    END IF;
    
    -- Set approved amount based on coverage percentage
    IF NEW.status = 'Approved' AND NEW.approved_amount = 0 THEN
        NEW.approved_amount := NEW.claim_amount * (coverage_percentage / 100.0);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for claim amount validation
CREATE TRIGGER claim_amount_validation_trigger
BEFORE INSERT OR UPDATE ON insurance_claims
FOR EACH ROW EXECUTE FUNCTION validate_claim_amount();

-- Function to auto-update invoice on claim approval
CREATE OR REPLACE FUNCTION update_invoice_on_claim_approval()
RETURNS TRIGGER AS $$
DECLARE
    patient_id INTEGER;
    invoice_id INTEGER;
BEGIN
    -- Only proceed if status changed to 'Paid'
    IF NEW.status = 'Paid' AND (OLD.status IS NULL OR OLD.status != 'Paid') THEN
        -- Get patient and invoice IDs
        SELECT i.patient_id, i.id INTO patient_id, invoice_id
        FROM invoices i
        WHERE i.id = NEW.invoice_id;
        
        -- Create insurance payment record
        INSERT INTO payments (invoice_id, amount, payment_method, processed_by, notes)
        VALUES (
            invoice_id,
            NEW.approved_amount,
            'Insurance',
            (SELECT id FROM users WHERE role = 'admin' LIMIT 1), -- System user
            'Insurance claim payment - ' || NEW.claim_number
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for claim approval
CREATE TRIGGER claim_approval_trigger
AFTER UPDATE ON insurance_claims
FOR EACH ROW EXECUTE FUNCTION update_invoice_on_claim_approval();

-- ============================================================================
-- PAYMENT VALIDATION TRIGGERS
-- ============================================================================

-- Function to prevent overpayment
CREATE OR REPLACE FUNCTION prevent_overpayment()
RETURNS TRIGGER AS $$
DECLARE
    invoice_total DECIMAL(10,2);
    current_total_paid DECIMAL(10,2);
    new_total_paid DECIMAL(10,2);
BEGIN
    -- Get invoice total
    SELECT total_amount INTO invoice_total
    FROM invoices
    WHERE id = NEW.invoice_id;
    
    -- Get current total paid (excluding this payment)
    SELECT COALESCE(SUM(amount), 0) INTO current_total_paid
    FROM payments
    WHERE invoice_id = NEW.invoice_id;
    
    -- Calculate new total including this payment
    new_total_paid := current_total_paid + NEW.amount;
    
    -- Check if this would cause overpayment
    IF new_total_paid > invoice_total THEN
        RAISE EXCEPTION 'Payment amount would cause overpayment. Invoice total: %.2f, Current paid: %.2f, New payment: %.2f', 
                       invoice_total, current_total_paid, NEW.amount;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment validation
CREATE TRIGGER payment_overpayment_trigger
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION prevent_overpayment();

-- Function to validate payment method
CREATE OR REPLACE FUNCTION validate_payment_method()
RETURNS TRIGGER AS $$
DECLARE
    invoice_status TEXT;
BEGIN
    -- Get invoice status
    SELECT status INTO invoice_status
    FROM invoices
    WHERE id = NEW.invoice_id;
    
    -- Check if invoice exists and is not cancelled
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;
    
    IF invoice_status = 'Cancelled' THEN
        RAISE EXCEPTION 'Cannot process payment for cancelled invoice';
    END IF;
    
    -- Validate payment amount is positive
    IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;
    
    -- Validate transaction reference for card/bank payments
    IF NEW.payment_method IN ('Credit Card', 'Debit Card', 'Bank Transfer') THEN
        IF NEW.transaction_reference IS NULL OR NEW.transaction_reference = '' THEN
            RAISE EXCEPTION 'Transaction reference is required for % payments', NEW.payment_method;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment method validation
CREATE TRIGGER payment_method_validation_trigger
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION validate_payment_method();

-- ============================================================================
-- TREATMENT RECORD VALIDATION TRIGGERS
-- ============================================================================

-- Function to lock treatments after invoice
CREATE OR REPLACE FUNCTION lock_treatments_after_invoice()
RETURNS TRIGGER AS $$
DECLARE
    invoice_exists BOOLEAN;
BEGIN
    -- Check if invoice exists for this appointment
    SELECT EXISTS(SELECT 1 FROM invoices WHERE appointment_id = NEW.appointment_id) INTO invoice_exists;
    
    IF invoice_exists THEN
        -- Allow only consultation_notes updates
        IF TG_OP = 'UPDATE' THEN
            IF OLD.treatment_id != NEW.treatment_id OR 
               OLD.quantity != NEW.quantity OR 
               OLD.unit_price != NEW.unit_price THEN
                RAISE EXCEPTION 'Cannot modify treatment details after invoice has been generated. Only consultation notes can be updated.';
            END IF;
        ELSE
            RAISE EXCEPTION 'Cannot add or delete treatments after invoice has been generated for this appointment.';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for treatment lock
CREATE TRIGGER treatment_lock_trigger
BEFORE INSERT OR UPDATE OR DELETE ON treatment_records
FOR EACH ROW EXECUTE FUNCTION lock_treatments_after_invoice();

-- Function to auto-update appointment status
CREATE OR REPLACE FUNCTION update_appointment_on_treatment()
RETURNS TRIGGER AS $$
DECLARE
    appointment_status TEXT;
BEGIN
    -- Only proceed for INSERT operations
    IF TG_OP = 'INSERT' THEN
        -- Get current appointment status
        SELECT status INTO appointment_status
        FROM appointments
        WHERE id = NEW.appointment_id;
        
        -- Check if appointment is not cancelled or no show
        IF appointment_status NOT IN ('Cancelled', 'No Show') THEN
            -- Set appointment status to 'In Progress' if it's still 'Scheduled'
            IF appointment_status = 'Scheduled' THEN
                UPDATE appointments
                SET status = 'In Progress', updated_at = CURRENT_TIMESTAMP
                WHERE id = NEW.appointment_id;
            END IF;
        ELSE
            RAISE EXCEPTION 'Cannot add treatments to % appointment', appointment_status;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for appointment status update
CREATE TRIGGER appointment_status_update_trigger
AFTER INSERT ON treatment_records
FOR EACH ROW EXECUTE FUNCTION update_appointment_on_treatment();

-- ============================================================================
-- AUTOMATED NOTIFICATION TRIGGERS
-- ============================================================================

-- Function to check overdue invoices
CREATE OR REPLACE FUNCTION check_overdue_invoices()
RETURNS TRIGGER AS $$
DECLARE
    days_old INTEGER;
BEGIN
    -- Only proceed if status changed to 'Sent'
    IF NEW.status = 'Sent' AND (OLD.status IS NULL OR OLD.status != 'Sent') THEN
        -- Create notification for newly sent invoice
        INSERT INTO notifications (type, recipient_id, recipient_type, title, message, related_table, related_id)
        VALUES (
            'invoice_sent',
            NEW.patient_id,
            'patient',
            'New Invoice Available',
            'A new invoice has been generated for your recent appointment. Please review and make payment.',
            'invoices',
            NEW.id
        );
    END IF;
    
    -- Check for overdue invoices (30+ days old)
    days_old := EXTRACT(DAY FROM (CURRENT_TIMESTAMP - NEW.created_at));
    
    IF days_old >= 30 AND NEW.status = 'Sent' THEN
        -- Update status to overdue if not already
        IF NEW.status != 'Overdue' THEN
            UPDATE invoices 
            SET status = 'Overdue', updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW.id;
        END IF;
        
        -- Create overdue notification
        INSERT INTO notifications (type, recipient_id, recipient_type, title, message, related_table, related_id)
        VALUES (
            'invoice_overdue',
            NEW.patient_id,
            'patient',
            'Overdue Invoice Notice',
            'Your invoice has been outstanding for ' || days_old || ' days. Please make payment immediately.',
            'invoices',
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for overdue invoice check
CREATE TRIGGER overdue_invoice_trigger
AFTER INSERT OR UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION check_overdue_invoices();

-- Function to generate appointment reminders
CREATE OR REPLACE FUNCTION generate_appointment_reminders()
RETURNS TRIGGER AS $$
DECLARE
    appointment_date TIMESTAMP;
    hours_until_appointment INTEGER;
BEGIN
    -- Only proceed if appointment is scheduled
    IF NEW.status = 'Scheduled' AND (OLD.status IS NULL OR OLD.status != 'Scheduled') THEN
        appointment_date := NEW.appointment_datetime;
        hours_until_appointment := EXTRACT(EPOCH FROM (appointment_date - CURRENT_TIMESTAMP)) / 3600;
        
        -- Create reminder for 24 hours before appointment
        IF hours_until_appointment <= 24 AND hours_until_appointment > 0 THEN
            INSERT INTO notifications (type, recipient_id, recipient_type, title, message, related_table, related_id, scheduled_for)
            VALUES (
                'appointment_reminder',
                NEW.patient_id,
                'patient',
                'Appointment Reminder',
                'You have an appointment scheduled for ' || TO_CHAR(appointment_date, 'YYYY-MM-DD HH24:MI') || '. Please arrive 15 minutes early.',
                'appointments',
                NEW.id,
                appointment_date - INTERVAL '24 hours'
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for appointment reminders
CREATE TRIGGER appointment_reminder_trigger
AFTER INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION generate_appointment_reminders();

-- ============================================================================
-- STORED PROCEDURES
-- ============================================================================

-- Procedure to complete appointment workflow
CREATE OR REPLACE FUNCTION complete_appointment_workflow(p_appointment_id INTEGER)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    invoice_id INTEGER,
    invoice_number TEXT,
    total_amount DECIMAL
) AS $$
DECLARE
    appointment_record RECORD;
    treatment_total DECIMAL(10,2);
    invoice_record RECORD;
    invoice_num TEXT;
    attempts INTEGER := 0;
    invoice_created BOOLEAN := FALSE;
BEGIN
    -- Get appointment details
    SELECT * INTO appointment_record
    FROM appointments
    WHERE id = p_appointment_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Appointment not found'::TEXT, NULL::INTEGER, NULL::TEXT, NULL::DECIMAL;
        RETURN;
    END IF;
    
    -- Check if already completed
    IF appointment_record.status = 'Completed' THEN
        RETURN QUERY SELECT FALSE, 'Appointment is already completed'::TEXT, NULL::INTEGER, NULL::TEXT, NULL::DECIMAL;
        RETURN;
    END IF;
    
    -- Calculate treatment total
    SELECT COALESCE(SUM(total_price), 0) INTO treatment_total
    FROM treatment_records
    WHERE appointment_id = p_appointment_id;
    
    -- Check if treatments exist
    IF treatment_total = 0 THEN
        RETURN QUERY SELECT FALSE, 'Cannot complete appointment without treatment records'::TEXT, NULL::INTEGER, NULL::TEXT, NULL::DECIMAL;
        RETURN;
    END IF;
    
    -- Check if invoice already exists
    IF EXISTS (SELECT 1 FROM invoices WHERE appointment_id = p_appointment_id) THEN
        RETURN QUERY SELECT FALSE, 'Invoice already exists for this appointment'::TEXT, NULL::INTEGER, NULL::TEXT, NULL::DECIMAL;
        RETURN;
    END IF;
    
    -- Generate unique invoice number and create invoice
    WHILE NOT invoice_created AND attempts < 5 LOOP
        BEGIN
            invoice_num := 'INV-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                          LPAD(FLOOR(1000 + RANDOM() * 9000)::TEXT, 4, '0');
            
            INSERT INTO invoices(patient_id, appointment_id, invoice_number, total_amount, status)
            VALUES (appointment_record.patient_id, p_appointment_id, invoice_num, treatment_total, 'Draft')
            RETURNING * INTO invoice_record;
            
            invoice_created := TRUE;
        EXCEPTION WHEN unique_violation THEN
            attempts := attempts + 1;
        END;
    END LOOP;
    
    IF NOT invoice_created THEN
        RETURN QUERY SELECT FALSE, 'Failed to generate unique invoice number'::TEXT, NULL::INTEGER, NULL::TEXT, NULL::DECIMAL;
        RETURN;
    END IF;
    
    -- Update appointment status
    UPDATE appointments
    SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
    WHERE id = p_appointment_id;
    
    RETURN QUERY SELECT TRUE, 'Appointment completed successfully'::TEXT, invoice_record.id, invoice_record.invoice_number, invoice_record.total_amount;
END;
$$ LANGUAGE plpgsql;

-- Procedure to process insurance claim
CREATE OR REPLACE FUNCTION process_insurance_claim(
    claim_id INTEGER,
    approved_amount DECIMAL,
    new_status claim_status,
    rejection_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
    success BOOLEAN,
    message TEXT,
    claim_record RECORD,
    invoice_record RECORD
) AS $$
DECLARE
    claim_data RECORD;
    invoice_data RECORD;
BEGIN
    -- Get claim details
    SELECT * INTO claim_data
    FROM insurance_claims
    WHERE id = claim_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'Insurance claim not found'::TEXT, NULL::RECORD, NULL::RECORD;
        RETURN;
    END IF;
    
    -- Update claim status
    UPDATE insurance_claims
    SET status = new_status,
        approved_amount = CASE WHEN new_status = 'Approved' THEN process_insurance_claim.approved_amount ELSE insurance_claims.approved_amount END,
        rejection_reason = CASE WHEN new_status = 'Rejected' THEN process_insurance_claim.rejection_reason ELSE insurance_claims.rejection_reason END,
        response_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = claim_id
    RETURNING * INTO claim_data;
    
    -- If approved or paid, create payment record
    IF new_status IN ('Approved', 'Paid') THEN
        -- Calculate total paid amount for this invoice
        SELECT COALESCE(SUM(amount), 0) INTO total_paid
        FROM payments
        WHERE invoice_id = claim_data.invoice_id;
        
        -- Calculate remaining balance
        remaining_balance := invoice_data.total_amount - total_paid;
        
        -- Determine payment amount (don't exceed remaining balance)
        payment_amount := LEAST(approved_amount, remaining_balance);
        
        -- Only create payment if there's a remaining balance and approved amount > 0
        IF remaining_balance > 0 AND payment_amount > 0 THEN
            -- Create insurance payment
            INSERT INTO payments (invoice_id, amount, payment_method, processed_by, notes)
            VALUES (
                claim_data.invoice_id,
                payment_amount,
                'Insurance',
                (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
                'Insurance claim payment - ' || claim_data.claim_number || ' (Approved: ' || approved_amount || ', Paid: ' || payment_amount || ')'
            );
            
            -- Update invoice status based on payment
            IF payment_amount >= remaining_balance THEN
                -- Fully paid
                UPDATE invoices 
                SET status = 'Paid', updated_at = CURRENT_TIMESTAMP
                WHERE id = claim_data.invoice_id;
            ELSE
                -- Partially paid, keep as Sent or Overdue
                UPDATE invoices 
                SET status = CASE 
                    WHEN status = 'Draft' THEN 'Sent'
                    ELSE status 
                END, updated_at = CURRENT_TIMESTAMP
                WHERE id = claim_data.invoice_id;
            END IF;
        END IF;
        
        -- Refresh invoice data
        SELECT * INTO invoice_data
        FROM invoices
        WHERE id = claim_data.invoice_id;
    END IF;
    
    RETURN QUERY SELECT TRUE, 'Insurance claim processed successfully'::TEXT, claim_data, invoice_data;
END;
$$ LANGUAGE plpgsql;

-- Procedure to reconcile daily payments
CREATE OR REPLACE FUNCTION reconcile_daily_payments(target_date DATE)
RETURNS TABLE(
    payment_method payment_method,
    total_amount DECIMAL,
    transaction_count BIGINT,
    expected_total DECIMAL,
    discrepancy DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.payment_method,
        SUM(p.amount) as total_amount,
        COUNT(*) as transaction_count,
        SUM(p.amount) as expected_total, -- This would be compared with external systems
        0::DECIMAL as discrepancy
    FROM payments p
    WHERE DATE(p.payment_date) = target_date
    GROUP BY p.payment_method
    ORDER BY p.payment_method;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COLUMN ALTERATIONS
-- ============================================================================

-- Modify patients table phone column length
ALTER TABLE patients
DROP COLUMN phone,
ADD COLUMN phone varchar(15);

-- ============================================================================
-- DATABASE VIEWS FOR REPORTING
-- ============================================================================

-- View for patient outstanding summary
CREATE OR REPLACE VIEW patient_outstanding_summary AS
SELECT 
    p.id as patient_id,
    p.first_name || ' ' || p.last_name as patient_name,
    p.phone,
    p.email,
    COUNT(DISTINCT i.id) as total_invoices,
    SUM(i.total_amount) as total_amount,
    COALESCE(SUM(payments.total_paid), 0) as total_paid,
    SUM(i.total_amount) - COALESCE(SUM(payments.total_paid), 0) as outstanding_balance,
    MAX(i.created_at) as last_invoice_date,
    MIN(CASE WHEN i.status = 'Overdue' THEN i.created_at END) as oldest_overdue_date
FROM patients p
JOIN invoices i ON p.id = i.patient_id
LEFT JOIN (
    SELECT invoice_id, SUM(amount) as total_paid
    FROM payments
    GROUP BY invoice_id
) payments ON i.id = payments.invoice_id
WHERE i.status IN ('Draft', 'Sent', 'Overdue')
GROUP BY p.id, p.first_name, p.last_name, p.phone, p.email
HAVING SUM(i.total_amount) - COALESCE(SUM(payments.total_paid), 0) > 0;

-- View for insurance claim analytics
CREATE OR REPLACE VIEW insurance_claim_analytics AS
SELECT 
    DATE_TRUNC('month', ic.submission_date) as month,
    prov.name as provider_name,
    COUNT(*) as total_claims,
    SUM(CASE WHEN ic.status = 'Submitted' THEN 1 ELSE 0 END) as submitted_claims,
    SUM(CASE WHEN ic.status = 'Approved' THEN 1 ELSE 0 END) as approved_claims,
    SUM(CASE WHEN ic.status = 'Rejected' THEN 1 ELSE 0 END) as rejected_claims,
    SUM(CASE WHEN ic.status = 'Paid' THEN 1 ELSE 0 END) as paid_claims,
    SUM(ic.claim_amount) as total_claim_amount,
    SUM(ic.approved_amount) as total_approved_amount,
    AVG(ic.claim_amount) as avg_claim_amount,
    AVG(ic.approved_amount) as avg_approved_amount,
    CASE 
        WHEN COUNT(*) > 0 THEN 
            ROUND(100.0 * SUM(CASE WHEN ic.status IN ('Approved', 'Paid') THEN 1 ELSE 0 END) / COUNT(*), 2)
        ELSE 0 
    END as approval_rate,
    CASE 
        WHEN SUM(ic.claim_amount) > 0 THEN 
            ROUND(100.0 * SUM(ic.approved_amount) / SUM(ic.claim_amount), 2)
        ELSE 0 
    END as coverage_rate
FROM insurance_claims ic
JOIN patient_insurance pi ON ic.patient_insurance_id = pi.id
JOIN insurance_providers prov ON pi.provider_id = prov.id
GROUP BY DATE_TRUNC('month', ic.submission_date), prov.name
ORDER BY month DESC, provider_name;

-- View for appointment analytics
CREATE OR REPLACE VIEW appointment_analytics AS
SELECT 
    DATE_TRUNC('month', a.appointment_datetime) as month,
    b.name as branch_name,
    sp.name as specialty,
    COUNT(*) as total_appointments,
    SUM(CASE WHEN a.status = 'Scheduled' THEN 1 ELSE 0 END) as scheduled_appointments,
    SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) as completed_appointments,
    SUM(CASE WHEN a.status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_appointments,
    SUM(CASE WHEN a.status = 'No Show' THEN 1 ELSE 0 END) as no_show_appointments,
    SUM(CASE WHEN a.type = 'Emergency' THEN 1 ELSE 0 END) as emergency_appointments,
    SUM(CASE WHEN a.type = 'Walk-in' THEN 1 ELSE 0 END) as walk_in_appointments,
    CASE 
        WHEN COUNT(*) > 0 THEN 
            ROUND(100.0 * SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) / COUNT(*), 2)
        ELSE 0 
    END as completion_rate,
    CASE 
        WHEN COUNT(*) > 0 THEN 
            ROUND(100.0 * SUM(CASE WHEN a.status = 'Cancelled' THEN 1 ELSE 0 END) / COUNT(*), 2)
        ELSE 0 
    END as cancellation_rate,
    CASE 
        WHEN COUNT(*) > 0 THEN 
            ROUND(100.0 * SUM(CASE WHEN a.status = 'No Show' THEN 1 ELSE 0 END) / COUNT(*), 2)
        ELSE 0 
    END as no_show_rate
FROM appointments a
JOIN branches b ON a.branch_id = b.id
JOIN medical_staff m ON a.doctor_id = m.id
LEFT JOIN specialties sp ON m.specialty_id = sp.id
GROUP BY DATE_TRUNC('month', a.appointment_datetime), b.name, sp.name
ORDER BY month DESC, branch_name, specialty;

-- View for daily appointment summary
CREATE OR REPLACE VIEW daily_appointment_summary AS
SELECT 
    DATE(a.appointment_datetime) as appointment_date,
    b.name as branch_name,
    COUNT(*) as total_appointments,
    SUM(CASE WHEN a.status = 'Scheduled' THEN 1 ELSE 0 END) as scheduled,
    SUM(CASE WHEN a.status = 'Completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN a.status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled,
    SUM(CASE WHEN a.status = 'No Show' THEN 1 ELSE 0 END) as no_show,
    COUNT(DISTINCT a.patient_id) as unique_patients,
    COUNT(DISTINCT a.doctor_id) as doctors_working
FROM appointments a
JOIN branches b ON a.branch_id = b.id
GROUP BY DATE(a.appointment_datetime), b.name
ORDER BY appointment_date DESC, branch_name;

-- View for revenue analytics
CREATE OR REPLACE VIEW revenue_analytics AS
SELECT 
    DATE_TRUNC('month', i.created_at) as month,
    b.name as branch_name,
    COUNT(DISTINCT i.id) as total_invoices,
    SUM(i.total_amount) as total_revenue,
    SUM(CASE WHEN i.status = 'Paid' THEN i.total_amount ELSE 0 END) as collected_revenue,
    SUM(CASE WHEN i.status IN ('Draft', 'Sent', 'Overdue') THEN i.total_amount ELSE 0 END) as outstanding_revenue,
    COUNT(DISTINCT p.id) as unique_patients,
    AVG(i.total_amount) as avg_invoice_amount,
    SUM(CASE WHEN pay.payment_method = 'Cash' THEN pay.amount ELSE 0 END) as cash_revenue,
    SUM(CASE WHEN pay.payment_method IN ('Credit Card', 'Debit Card') THEN pay.amount ELSE 0 END) as card_revenue,
    SUM(CASE WHEN pay.payment_method = 'Insurance' THEN pay.amount ELSE 0 END) as insurance_revenue
FROM invoices i
JOIN branches b ON (
    SELECT a.branch_id 
    FROM appointments a 
    WHERE a.id = i.appointment_id
) = b.id
JOIN patients p ON i.patient_id = p.id
LEFT JOIN payments pay ON i.id = pay.invoice_id
GROUP BY DATE_TRUNC('month', i.created_at), b.name
ORDER BY month DESC, branch_name;

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

-- Insert branch hours (All 7 days, 8 AM to 6 PM for all branches)
INSERT INTO branch_hours (branch_id, day_of_week, open_time, close_time) VALUES
(1, 0, '08:00:00', '18:00:00'), -- Colombo Branch - Sunday
(1, 1, '08:00:00', '18:00:00'), -- Colombo Branch - Monday
(1, 2, '08:00:00', '18:00:00'), -- Colombo Branch - Tuesday
(1, 3, '08:00:00', '18:00:00'), -- Colombo Branch - Wednesday
(1, 4, '08:00:00', '18:00:00'), -- Colombo Branch - Thursday
(1, 5, '08:00:00', '18:00:00'), -- Colombo Branch - Friday
(1, 6, '08:00:00', '18:00:00'), -- Colombo Branch - Saturday
(2, 0, '08:00:00', '18:00:00'), -- Kandy Branch - Sunday
(2, 1, '08:00:00', '18:00:00'), -- Kandy Branch - Monday
(2, 2, '08:00:00', '18:00:00'), -- Kandy Branch - Tuesday
(2, 3, '08:00:00', '18:00:00'), -- Kandy Branch - Wednesday
(2, 4, '08:00:00', '18:00:00'), -- Kandy Branch - Thursday
(2, 5, '08:00:00', '18:00:00'), -- Kandy Branch - Friday
(2, 6, '08:00:00', '18:00:00'), -- Kandy Branch - Saturday
(3, 0, '08:00:00', '18:00:00'), -- Galle Branch - Sunday
(3, 1, '08:00:00', '18:00:00'), -- Galle Branch - Monday
(3, 2, '08:00:00', '18:00:00'), -- Galle Branch - Tuesday
(3, 3, '08:00:00', '18:00:00'), -- Galle Branch - Wednesday
(3, 4, '08:00:00', '18:00:00'), -- Galle Branch - Thursday
(3, 5, '08:00:00', '18:00:00'), -- Galle Branch - Friday
(3, 6, '08:00:00', '18:00:00'); -- Galle Branch - Saturday

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
-- Patient contacts will be created by the seed script with proper patient references

-- Insert sample patient insurance
-- Patient insurance will be created by the seed script with proper patient references

-- Insert sample appointment
-- Test appointments will be created by the seed script with proper medical_staff references

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


-- Update existing phone numbers in patients table
UPDATE patients
SET phone = REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
WHERE phone IS NOT NULL;

-- Update existing emergency contact phone numbers
UPDATE patients
SET Emergency_contact_phone = REGEXP_REPLACE(Emergency_contact_phone, '[^0-9]', '', 'g')
WHERE Emergency_contact_phone IS NOT NULL;

-- Update existing phone numbers in patient_contacts table
UPDATE patient_contacts
SET phone = REGEXP_REPLACE(phone, '[^0-9]', '', 'g')
WHERE phone IS NOT NULL;

-- Column alteration moved to before views creation

-- Needed for deleting a treatment record
ALTER TABLE treatment_records DISABLE TRIGGER treatment_lock_trigger;

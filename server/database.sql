-- create patients table
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    gender TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    registered_branch TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- seed
INSERT INTO patients (
    first_name,
    last_name,
    date_of_birth,
    gender,
    address,
    phone,
    email,
    registered_branch,
    is_active
) VALUES (
    'John',
    'Doe',
    '2003-05-15',
    'Male',
    '123 Main Street, Colombo',
    '01171234567',
    'john.doe@example.com',
    'Colombo Branch',
    true
);


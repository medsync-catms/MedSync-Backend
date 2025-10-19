const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');

// Load test environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.test') });

// Global test setup
beforeAll(async () => {
  // Setup test database connection
  console.log('Setting up test environment...');
  
  // Set test user ID for audit logging
  global.testUserId = 1; // Admin user ID
  
  // Mock console.log for cleaner test output
  global.originalConsoleLog = console.log;
  global.originalConsoleError = console.error;
  
  // Suppress console output during tests unless verbose
  if (!process.env.VERBOSE_TESTS) {
    console.log = () => {};
    console.error = () => {};
  }
});

afterAll(async () => {
  // Restore console
  console.log = global.originalConsoleLog;
  console.error = global.originalConsoleError;
  
  console.log('Test environment cleanup completed');
});

// Global test timeout
jest.setTimeout(30000);

// Mock session storage
global.mockSession = {
  passport: {
    user: null
  }
};

// Global test data cleanup tracker
global.testDataIds = {
  patients: [],
  appointments: [],
  invoices: [],
  payments: [],
  insurance: [],
  addresses: []
};

// Helper to track test data for cleanup
global.trackTestData = (type, id) => {
  if (!global.testDataIds[type]) {
    global.testDataIds[type] = [];
  }
  global.testDataIds[type].push(id);
};

// Helper to clean up tracked test data
global.cleanupTestData = async () => {
  const { dbHelper } = require('./helpers/db.helper');
  
  try {
    // Clean up in reverse order to respect foreign key constraints
    for (const type of ['payments', 'insurance', 'invoices', 'appointments', 'patients', 'addresses']) {
      if (global.testDataIds[type] && global.testDataIds[type].length > 0) {
        await dbHelper.cleanupTestData(type, global.testDataIds[type]);
        global.testDataIds[type] = [];
      }
    }
  } catch (error) {
    console.error('Error during test data cleanup:', error);
  }
};

// Run cleanup after each test suite
afterEach(async () => {
  await global.cleanupTestData();
});

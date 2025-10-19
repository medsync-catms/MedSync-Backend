const request = require('supertest');
const app = require('../../server/server');
const { authHelper } = require('../helpers/auth.helper');

describe('Authentication Integration Tests', () => {
  
  describe('Login Functionality', () => {
    
    test('should login as admin with valid credentials', async () => {
      const { user } = await authHelper.loginAs('admin');
      
      expect(user).toBeDefined();
      expect(user.username).toBe('admin');
      expect(user.role).toBe('admin');
    });

    test('should login as manager with valid credentials', async () => {
      const { user } = await authHelper.loginAs('manager');
      
      expect(user).toBeDefined();
      expect(user.username).toBe('manager.branch1');
      expect(user.role).toBe('manager');
    });

    test('should login as doctor with valid credentials', async () => {
      const { user } = await authHelper.loginAs('doctor');
      
      expect(user).toBeDefined();
      expect(user.username).toBe('dr.silva');
      expect(user.role).toBe('doctor');
    });

    test('should login as nurse with valid credentials', async () => {
      const { user } = await authHelper.loginAs('nurse');
      
      expect(user).toBeDefined();
      expect(user.username).toBe('nurse.fernando');
      expect(user.role).toBe('nurse');
    });

    test('should login as receptionist with valid credentials', async () => {
      const { user } = await authHelper.loginAs('receptionist');
      
      expect(user).toBeDefined();
      expect(user.username).toBe('reception.mendis');
      expect(user.role).toBe('receptionist');
    });

    test('should reject login with invalid username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'invalid_user',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'wrong_password'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid credentials');
    });

    test('should reject login with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should reject login with empty username', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: '',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    test('should reject login with empty password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: ''
        })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Session Management', () => {
    
    test('should maintain session after login', async () => {
      const { agent, user } = await authHelper.testSessionPersistence('doctor');
      
      // Make another authenticated request
      const response = await agent
        .get('/api/dashboard')
        .expect(200);

      expect(response.body.user.id).toBe(user.id);
      expect(response.body.user.username).toBe('dr.silva');
    });

    test('should logout successfully', async () => {
      await authHelper.testLogout('admin');
    });

    test('should not access protected routes after logout', async () => {
      const agent = authHelper.createFreshAgent();
      
      // Try to access protected route without login
      await agent
        .get('/api/dashboard')
        .expect(401);
    });

    test('should handle multiple login sessions', async () => {
      const agent1 = authHelper.createFreshAgent();
      const agent2 = authHelper.createFreshAgent();
      
      // Login with first agent
      const { user: user1 } = await authHelper.loginAs('admin', agent1);
      
      // Login with second agent
      const { user: user2 } = await authHelper.loginAs('doctor', agent2);
      
      expect(user1.username).toBe('admin');
      expect(user2.username).toBe('dr.silva');
      
      // Both should work independently
      await agent1.get('/api/dashboard').expect(200);
      await agent2.get('/api/dashboard').expect(200);
    });
  });

  describe('Authorization Tests', () => {
    
    test('should allow admin to access all endpoints', async () => {
      const agent = await authHelper.getAuthenticatedAgent('admin');
      
      const endpoints = [
        '/api/dashboard',
        '/api/patients',
        '/api/appointments',
        '/api/staff',
        '/api/reports'
      ];
      
      for (const endpoint of endpoints) {
        const response = await agent.get(endpoint).expect(200);
        expect(response.body).toBeDefined();
      }
    });

    test('should restrict doctor access to clinical endpoints', async () => {
      const agent = await authHelper.getAuthenticatedAgent('doctor');
      
      // Should access clinical endpoints
      await agent.get('/api/patients').expect(200);
      await agent.get('/api/appointments').expect(200);
      await agent.get('/api/treatments').expect(200);
      
      // Should not access administrative endpoints
      await agent.get('/api/staff').expect(403);
      await agent.get('/api/reports').expect(403);
    });

    test('should restrict nurse access to patient management', async () => {
      const agent = await authHelper.getAuthenticatedAgent('nurse');
      
      // Should access patient and appointment endpoints
      await agent.get('/api/patients').expect(200);
      await agent.get('/api/appointments').expect(200);
      
      // Should not access treatment management
      await agent.get('/api/treatments').expect(403);
      
      // Should not access administrative endpoints
      await agent.get('/api/staff').expect(403);
      await agent.get('/api/reports').expect(403);
    });

    test('should restrict receptionist access to basic operations', async () => {
      const agent = await authHelper.getAuthenticatedAgent('receptionist');
      
      // Should access patient and appointment endpoints
      await agent.get('/api/patients').expect(200);
      await agent.get('/api/appointments').expect(200);
      
      // Should not access clinical or administrative endpoints
      await agent.get('/api/treatments').expect(403);
      await agent.get('/api/staff').expect(403);
      await agent.get('/api/reports').expect(403);
    });

    test('should allow manager access to branch-specific operations', async () => {
      const agent = await authHelper.getAuthenticatedAgent('manager');
      
      // Should access most endpoints
      await agent.get('/api/patients').expect(200);
      await agent.get('/api/appointments').expect(200);
      await agent.get('/api/reports').expect(200);
      
      // Should not access system-wide staff management
      await agent.get('/api/staff').expect(403);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle malformed login request', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send('invalid json')
        .expect(400);
    });

    test('should handle login with SQL injection attempt', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: "admin'; DROP TABLE users; --",
          password: 'password123'
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    test('should handle login with XSS attempt', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: '<script>alert("xss")</script>',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  afterAll(async () => {
    await authHelper.cleanup();
  });
});

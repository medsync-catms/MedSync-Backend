const request = require('supertest');
const app = require('../../server/server');

class AuthHelper {
  constructor() {
    this.agents = new Map(); // Store authenticated agents by role
  }

  async loginAs(role, agent = null) {
    const testAgent = agent || request(app);
    
    const credentials = this.getCredentialsByRole(role);
    
    const response = await testAgent
      .post('/api/auth/login')
      .send({
        username: credentials.username,
        password: credentials.password
      })
      .expect(200);

    expect(response.body.message).toBe('Login successful');
    expect(response.body.user.role).toBe(credentials.expectedRole);

    // Store the agent for reuse
    this.agents.set(role, testAgent);
    
    return {
      agent: testAgent,
      user: response.body.user,
      session: response.body.session
    };
  }

  async logout(agent) {
    try {
      await agent.post('/api/auth/logout');
    } catch (error) {
      // Ignore logout errors in tests
    }
  }

  getCredentialsByRole(role) {
    const credentials = {
      admin: {
        username: 'admin',
        password: 'password123',
        expectedRole: 'admin'
      },
      manager: {
        username: 'manager.branch1',
        password: 'password123',
        expectedRole: 'manager'
      },
      doctor: {
        username: 'dr.silva',
        password: 'password123',
        expectedRole: 'doctor'
      },
      nurse: {
        username: 'nurse.fernando',
        password: 'password123',
        expectedRole: 'nurse'
      },
      receptionist: {
        username: 'reception.mendis',
        password: 'password123',
        expectedRole: 'receptionist'
      }
    };

    if (!credentials[role]) {
      throw new Error(`Unknown role: ${role}. Available roles: ${Object.keys(credentials).join(', ')}`);
    }

    return credentials[role];
  }

  async getAuthenticatedAgent(role) {
    if (this.agents.has(role)) {
      return this.agents.get(role);
    }

    const { agent } = await this.loginAs(role);
    return agent;
  }

  async makeAuthenticatedRequest(role, method, endpoint, data = null) {
    const agent = await this.getAuthenticatedAgent(role);
    
    let request = agent[method.toLowerCase()](endpoint);
    
    if (data) {
      request = request.send(data);
    }
    
    return request;
  }

  async testUnauthorizedAccess(role, method, endpoint, data = null) {
    const agent = await this.getAuthenticatedAgent(role);
    
    let request = agent[method.toLowerCase()](endpoint);
    
    if (data) {
      request = request.send(data);
    }
    
    return request.expect(403);
  }

  async testRouteAccess(role, method, endpoint, expectedStatus = 200, data = null) {
    const agent = await this.getAuthenticatedAgent(role);
    
    let request = agent[method.toLowerCase()](endpoint);
    
    if (data) {
      request = request.send(data);
    }
    
    return request.expect(expectedStatus);
  }

  // Helper to create a fresh agent for each test
  createFreshAgent() {
    return request(app);
  }

  // Helper to test login with invalid credentials
  async testInvalidLogin(username, password) {
    const agent = this.createFreshAgent();
    
    return agent
      .post('/api/auth/login')
      .send({ username, password })
      .expect(401);
  }

  // Helper to test session persistence
  async testSessionPersistence(role) {
    const { agent, user } = await this.loginAs(role);
    
    // Make a request that requires authentication
    const response = await agent
      .get('/api/dashboard')
      .expect(200);
    
    expect(response.body.user.id).toBe(user.id);
    
    return { agent, user };
  }

  // Helper to test logout
  async testLogout(role) {
    const { agent } = await this.loginAs(role);
    
    // Logout
    await agent
      .post('/api/auth/logout')
      .expect(200);
    
    // Try to access protected route
    await agent
      .get('/api/dashboard')
      .expect(401);
  }

  // Helper to test role-based access control
  async testRoleAccess(role, protectedEndpoints) {
    const results = {};
    
    for (const endpoint of protectedEndpoints) {
      const agent = await this.getAuthenticatedAgent(role);
      
      try {
        const response = await agent
          .get(endpoint)
          .expect(200);
        results[endpoint] = { status: 'allowed', response: response.body };
      } catch (error) {
        results[endpoint] = { status: 'denied', error: error.message };
      }
    }
    
    return results;
  }

  // Clean up all stored agents
  async cleanup() {
    for (const [role, agent] of this.agents) {
      try {
        await this.logout(agent);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    this.agents.clear();
  }
}

const authHelper = new AuthHelper();

module.exports = { authHelper };

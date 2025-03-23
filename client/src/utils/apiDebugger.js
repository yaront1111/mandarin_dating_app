// src/utils/apiDebugger.js
import axios from 'axios';

/**
 * API Debugger to help diagnose authentication and API issues
 */
class ApiDebugger {
  constructor() {
    this.isActive = true;
    console.log('API Debugger initialized');
    this._setupInterceptors();
  }

  /**
   * Setup axios interceptors for debugging
   */
  _setupInterceptors() {
    // Request interceptor
    axios.interceptors.request.use((config) => {
      if (!this.isActive) return config;

      console.group(`📤 API Request: ${config.method.toUpperCase()} ${config.url}`);
      console.log('Headers:', this._sanitizeHeaders(config.headers));

      if (config.data) {
        console.log('Request Data:', this._sanitizeData(config.data));
      }

      console.log('Auth Token Present:', !!config.headers.Authorization);
      console.groupEnd();

      return config;
    }, (error) => {
      if (this.isActive) {
        console.error('Request Error:', error);
      }
      return Promise.reject(error);
    });

    // Response interceptor
    axios.interceptors.response.use((response) => {
      if (!this.isActive) return response;

      console.group(`📥 API Response: ${response.config.method.toUpperCase()} ${response.config.url}`);
      console.log('Status:', response.status);
      console.log('Data:', response.data);
      console.groupEnd();

      return response;
    }, (error) => {
      if (this.isActive) {
        console.group('❌ API Error');
        console.error('Error:', error.message);

        if (error.response) {
          console.log('Status:', error.response.status);
          console.log('Data:', error.response.data);
          console.log('Headers:', this._sanitizeHeaders(error.response.headers));
        } else if (error.request) {
          console.log('Request was made but no response received');
          console.log('Request:', error.request);
        } else {
          console.log('Error setting up request:', error.message);
        }

        console.groupEnd();
      }
      return Promise.reject(error);
    });
  }

  /**
   * Sanitize headers for display (hide sensitive info)
   */
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = sanitized.Authorization.substring(0, 20) + '...';
    }
    return sanitized;
  }

  /**
   * Sanitize request data (hide passwords)
   */
  _sanitizeData(data) {
    if (typeof data !== 'object' || data === null) return data;

    const sanitized = { ...data };
    if (sanitized.password) {
      sanitized.password = '********';
    }
    return sanitized;
  }

  /**
   * Test API connection with current auth
   */
  async testConnection(endpoint = '/api/auth/test-connection') {
    console.log('Testing API connection...');

    // Get the token
    const token = sessionStorage.getItem('token');
    console.log('Token available:', !!token);

    // Make a test request
    try {
      const response = await axios.get(endpoint, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });

      console.log('✅ Connection test successful:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      return {
        success: false,
        error: error.message,
        response: error.response?.data || null,
        status: error.response?.status
      };
    }
  }

  /**
   * Test authentication with current token
   */
  async testAuth(endpoint = '/api/auth/me') {
    console.log('Testing authentication...');

    const token = sessionStorage.getItem('token');
    if (!token) {
      console.warn('No token available for auth test');
      return { success: false, error: 'No token available' };
    }

    try {
      const response = await axios.get(endpoint, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      console.log('✅ Authentication test successful:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('❌ Authentication test failed:', error.message);
      return {
        success: false,
        error: error.message,
        response: error.response?.data || null,
        status: error.response?.status
      };
    }
  }

  /**
   * Check token validity
   */
  checkToken() {
    const token = sessionStorage.getItem('token');
    if (!token) {
      console.warn('No token found in sessionStorage');
      return { valid: false, reason: 'No token found' };
    }

    try {
      // Parse token parts
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { valid: false, reason: 'Invalid token format' };
      }

      // Decode payload
      const payload = JSON.parse(atob(parts[1]));
      console.log('Token payload:', payload);

      // Check expiration
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return {
          valid: false,
          reason: 'Token expired',
          expiry: new Date(payload.exp * 1000).toLocaleString(),
          now: new Date(now * 1000).toLocaleString()
        };
      }

      return {
        valid: true,
        userId: payload.id || payload.sub,
        expiry: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : 'No expiry'
      };
    } catch (error) {
      console.error('Error parsing token:', error);
      return { valid: false, reason: 'Invalid token content', error: error.message };
    }
  }

  /**
   * Enable or disable debugger
   */
  setActive(active) {
    this.isActive = active;
    console.log(`API Debugger ${active ? 'enabled' : 'disabled'}`);
  }
}

// Create singleton instance
const apiDebugger = new ApiDebugger();
export default apiDebugger;

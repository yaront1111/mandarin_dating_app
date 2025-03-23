import apiService from './apiService.jsx';

const settingsService = {
  /**
   * Get user settings
   * @returns {Promise} Promise with user settings
   */
  getUserSettings: async () => {
    try {
      const response = await apiService.get('/users/settings');
      return response.data;
    } catch (error) {
      console.error('Error fetching user settings:', error);
      throw error;
    }
  },

  /**
   * Update user settings
   * @param {Object} settings - The settings object to update
   * @returns {Promise} Promise with updated settings
   */
  updateSettings: async (settings) => {
    try {
      // Removed extra "/api" from the endpoint
      const response = await apiService.put('/users/settings', settings);
      return response.data;
    } catch (error) {
      console.error('Error updating settings:', error);
      throw error;
    }
  },

  /**
   * Update notification settings
   * @param {Object} notificationSettings - The notification settings to update
   * @returns {Promise} Promise with updated settings
   */
  updateNotificationSettings: async (notificationSettings) => {
    try {
      // Removed extra "/api" from the endpoint
      const response = await apiService.put('/users/settings/notifications', {
        notifications: notificationSettings
      });
      return response.data;
    } catch (error) {
      console.error('Error updating notification settings:', error);
      throw error;
    }
  },

  /**
   * Update privacy settings
   * @param {Object} privacySettings - The privacy settings to update
   * @returns {Promise} Promise with updated settings
   */
  updatePrivacySettings: async (privacySettings) => {
    try {
      // Removed extra "/api" from the endpoint
      const response = await apiService.put('/users/settings/privacy', {
        privacy: privacySettings
      });
      return response.data;
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      throw error;
    }
  },

  /**
   * Delete user account
   * @param {string} password - User's password for confirmation
   * @returns {Promise} Promise with deletion status
   */
  deleteAccount: async (password) => {
    try {
      // Make sure your endpoint here is also correct (remove extra "/api" if needed)
      const response = await apiService.delete('/users/account', {
        data: { password }
      });
      return response.data;
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }
};

export default settingsService;

// models/index.js - Enhanced with ES modules and improved imports/exports
import User from './User.js';
import Message from './Message.js';
import Story from './Story.js';
import PhotoPermission from './PhotoPermission.js';
import Like from './Like.js';

// Export individual models
export {
  User,
  Message,
  Story,
  PhotoPermission,
  Like
};

// Create models object for backward compatibility
const models = {
  User,
  Message,
  Story,
  PhotoPermission,
  Like
};

export default models;

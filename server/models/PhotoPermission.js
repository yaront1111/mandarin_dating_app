// models/PhotoPermission.js - Enhanced with ES modules and improved validation
import mongoose from 'mongoose';
import logger from '../logger.js';

const { Schema, model } = mongoose;

/**
 * Schema for photo permission requests
 * Handles access requests for private photos between users
 */
const PhotoPermissionSchema = new Schema({
  // The photo (reference to the photo's ObjectId in the User model)
  photo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Photo ID is required'],
    index: true
  },

  // User requesting permission to see the photo
  requestedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Requesting user ID is required'],
    index: true
  },

  // Current status of the request
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Status must be pending, approved, or rejected'
    },
    default: 'pending',
    index: true
  },

  // Optional message with request
  message: {
    type: String,
    trim: true,
    maxlength: [200, 'Message cannot exceed 200 characters']
  },

  // When the permission was acted upon (approved/rejected)
  respondedAt: {
    type: Date,
    default: null
  },

  // Timestamps for tracking
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // When the permission expires (if approved)
  expiresAt: {
    type: Date,
    default: function() {
      // Default to 30 days from now if approved
      if (this.status === 'approved') {
        const date = new Date();
        date.setDate(date.getDate() + 30);
        return date;
      }
      return null;
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create a compound index to ensure uniqueness of photo-user pairs
PhotoPermissionSchema.index(
  { photo: 1, requestedBy: 1 },
  { unique: true, name: 'photo_requestedBy_unique' }
);

/**
 * Pre-validate hook to ensure a user isn't requesting permission to their own photo
 */
PhotoPermissionSchema.pre('validate', async function(next) {
  try {
    // If this is a new permission request
    if (this.isNew) {
      // Load the User model without causing circular dependency
      const User = model('User');

      // Find the owner of the photo
      const photoOwner = await User.findOne({ 'photos._id': this.photo });

      if (!photoOwner) {
        return next(new Error('Photo not found'));
      }

      // Check if the requester is the owner
      if (photoOwner._id.toString() === this.requestedBy.toString()) {
        return next(new Error('Cannot request permission for your own photo'));
      }

      // Check if the photo is actually private
      const photo = photoOwner.photos.id(this.photo);
      if (!photo) {
        return next(new Error('Photo not found'));
      }

      if (!photo.isPrivate) {
        return next(new Error('Permission not required for public photos'));
      }
    }

    next();
  } catch (error) {
    logger.error(`Error in PhotoPermission pre-validate hook: ${error.message}`);
    next(error);
  }
});

/**
 * Update timestamps when status changes
 */
PhotoPermissionSchema.pre('save', function(next) {
  // If status changed to approved or rejected, set respondedAt date
  if (this.isModified('status') && ['approved', 'rejected'].includes(this.status)) {
    this.respondedAt = new Date();

    // Set expiration date for approved permissions
    if (this.status === 'approved') {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30); // 30 days from now
      this.expiresAt = expiryDate;
    } else {
      this.expiresAt = null; // No expiration for rejected permissions
    }
  }

  next();
});

/**
 * Instance method to check if permission has expired
 * @returns {boolean} True if permission has expired
 */
PhotoPermissionSchema.methods.hasExpired = function() {
  return this.status === 'approved' &&
         this.expiresAt &&
         this.expiresAt < new Date();
};

/**
 * Instance method to approve a permission request
 * @param {Number} expiryDays - Optional: Number of days until expiration (default 30)
 * @returns {Promise<Object>} Updated document
 */
PhotoPermissionSchema.methods.approve = async function(expiryDays = 30) {
  this.status = 'approved';
  this.respondedAt = new Date();

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  this.expiresAt = expiryDate;

  return this.save();
};

/**
 * Instance method to reject a permission request
 * @param {String} message - Optional: Reason for rejection
 * @returns {Promise<Object>} Updated document
 */
PhotoPermissionSchema.methods.reject = async function(message) {
  this.status = 'rejected';
  this.respondedAt = new Date();
  this.expiresAt = null;

  if (message) {
    this.message = message;
  }

  return this.save();
};

/**
 * Static method to get all pending requests for a user's photos
 * @param {ObjectId|String} userId - User ID of the photo owner
 * @param {Object} options - Query options with pagination
 * @returns {Promise<Object>} Pending permission requests with pagination
 */
PhotoPermissionSchema.statics.getPendingForUser = async function(userId, options = {}) {
  try {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    // Load User model
    const User = model('User');

    // Find the user and extract their photo IDs
    const user = await User.findById(userId).select('photos');

    if (!user) {
      throw new Error('User not found');
    }

    // Get IDs of all private photos
    const privatePhotoIds = user.photos
      .filter(photo => photo.isPrivate)
      .map(photo => photo._id);

    if (privatePhotoIds.length === 0) {
      return {
        data: [],
        pagination: {
          total: 0,
          page,
          pages: 0,
          limit
        }
      };
    }

    // Query permissions
    const query = {
      photo: { $in: privatePhotoIds },
      status: 'pending'
    };

    const [permissions, total] = await Promise.all([
      this.find(query)
        .populate('requestedBy', 'nickname username photos avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.countDocuments(query)
    ]);

    return {
      data: permissions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    };
  } catch (error) {
    logger.error(`Error in getPendingForUser: ${error.message}`);
    throw error;
  }
};

// Create the model
const PhotoPermission = model('PhotoPermission', PhotoPermissionSchema);

export default PhotoPermission;

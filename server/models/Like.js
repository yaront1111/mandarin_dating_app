/**
 * Like model - Handles relationship likes between users
 *
 * This model stores "like" interactions between users with consistent ID handling.
 * It uses a compound index to ensure a user can only like another user once.
 */

import mongoose from 'mongoose';
import logger from '../logger.js';

const { Schema, model, Types } = mongoose;
const { ObjectId } = Types;

/**
 * Safely converts any ID to a MongoDB ObjectId if possible
 * @param {string|ObjectId} id - The ID to convert
 * @returns {ObjectId|null} The ObjectId or null if invalid
 */
const safeObjectId = (id) => {
  if (!id) return null;

  try {
    // If it's already an ObjectId instance, return it
    if (id instanceof ObjectId) return id;

    // If it's a valid ObjectId string, convert it
    if (ObjectId.isValid(id)) {
      return new ObjectId(id);
    }

    // Return null for invalid ID
    return null;
  } catch (err) {
    logger.error(`Error converting ID to ObjectId: ${err.message}`);
    return null;
  }
};

/**
 * Schema for the Like model
 */
const likeSchema = new Schema(
  {
    // User who initiated the like
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender is required"],
      index: true,
    },

    // User who was liked
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient is required"],
      index: true,
    },

    // Optional message with the like
    message: {
      type: String,
      maxlength: [200, "Message cannot exceed 200 characters"],
      trim: true,
    },

    // Flag showing if recipient has seen this like
    seen: {
      type: Boolean,
      default: false,
      index: true, // Index for efficient querying of unseen likes
    },

    // Timestamp for when the like was seen
    seenAt: {
      type: Date,
      default: null
    },

    // Metadata object for extensibility
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    // Add virtuals to JSON output
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Create compound index to ensure a user can only like another user once
likeSchema.index(
  { sender: 1, recipient: 1 },
  {
    unique: true,
    name: "unique_sender_recipient_idx",
  }
);

// Create index for recent likes for a user
likeSchema.index(
  { recipient: 1, createdAt: -1 },
  { name: "recent_likes_by_recipient_idx" }
);

/**
 * Validate both sender and recipient before saving
 */
likeSchema.pre("validate", function(next) {
  // Check the sender ID is valid
  if (!ObjectId.isValid(this.sender)) {
    return next(new Error("Invalid sender ID format"));
  }

  // Check the recipient ID is valid
  if (!ObjectId.isValid(this.recipient)) {
    return next(new Error("Invalid recipient ID format"));
  }

  // Ensure sender and recipient aren't the same
  if (this.sender.toString() === this.recipient.toString()) {
    return next(new Error("Cannot like yourself"));
  }

  next();
});

/**
 * Normalize IDs before saving
 */
likeSchema.pre("save", function (next) {
  // Convert sender to ObjectId
  const senderId = safeObjectId(this.sender);
  if (!senderId) {
    return next(new Error("Invalid sender ID"));
  }
  this.sender = senderId;

  // Convert recipient to ObjectId
  const recipientId = safeObjectId(this.recipient);
  if (!recipientId) {
    return next(new Error("Invalid recipient ID"));
  }
  this.recipient = recipientId;

  next();
});

/**
 * Add timestamp to seen field when it changes to true
 */
likeSchema.pre("save", function (next) {
  if (this.isModified("seen") && this.seen === true) {
    this.set("seenAt", new Date());
  }
  next();
});

/**
 * Helper statics to get data in common formats
 */
likeSchema.statics = {
  /**
   * Find all users who have liked a specific user
   * @param {ObjectId|string} userId - The user ID to check for likes
   * @param {Object} options - Query options with pagination
   * @returns {Promise} - Promise resolving to array of likes
   */
  async getLikesByRecipient(userId, options = {}) {
    const { page = 1, limit = 20, sort = { createdAt: -1 }, populate = true } = options;

    const query = { recipient: safeObjectId(userId) };

    try {
      let likesQuery = this.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit);

      // Optionally populate sender information
      if (populate) {
        likesQuery = likesQuery.populate("sender", "nickname username photos isOnline lastActive");
      }

      const [likes, total] = await Promise.all([
        likesQuery.exec(),
        this.countDocuments(query),
      ]);

      return {
        data: likes,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
      };
    } catch (err) {
      logger.error(`Error in getLikesByRecipient: ${err.message}`);
      throw err;
    }
  },

  /**
   * Find all users a specific user has liked
   * @param {ObjectId|string} userId - The user ID who sent likes
   * @param {Object} options - Query options with pagination
   * @returns {Promise} - Promise resolving to array of likes
   */
  async getLikesBySender(userId, options = {}) {
    const { page = 1, limit = 20, sort = { createdAt: -1 }, populate = true } = options;

    const query = { sender: safeObjectId(userId) };

    try {
      let likesQuery = this.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit);

      // Optionally populate recipient information
      if (populate) {
        likesQuery = likesQuery.populate("recipient", "nickname username photos isOnline lastActive");
      }

      const [likes, total] = await Promise.all([
        likesQuery.exec(),
        this.countDocuments(query),
      ]);

      return {
        data: likes,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
      };
    } catch (err) {
      logger.error(`Error in getLikesBySender: ${err.message}`);
      throw err;
    }
  },

  /**
   * Find mutual likes (matches) for a user
   * @param {ObjectId|string} userId - The user ID to find matches for
   * @param {Object} options - Query options with pagination
   * @returns {Promise} - Promise resolving to array of matched users
   */
  async getMatches(userId, options = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    try {
      // Convert to valid ObjectId
      const userObjectId = safeObjectId(userId);
      if (!userObjectId) {
        throw new Error("Invalid user ID format");
      }

      // Find users who the current user has liked
      const likedUsers = await this.find({ sender: userObjectId })
        .select("recipient")
        .lean();

      const likedUserIds = likedUsers.map(like => like.recipient);

      // Find users who have liked the current user and are also liked by the current user
      const matchesAggregation = await this.aggregate([
        {
          $match: {
            sender: { $in: likedUserIds },
            recipient: userObjectId,
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "sender",
            foreignField: "_id",
            as: "senderUser"
          }
        },
        { $unwind: "$senderUser" },
        {
          $project: {
            _id: 1,
            sender: 1,
            createdAt: 1,
            "senderUser._id": 1,
            "senderUser.nickname": 1,
            "senderUser.username": 1,
            "senderUser.photos": 1,
            "senderUser.isOnline": 1,
            "senderUser.lastActive": 1,
            "senderUser.details": 1,
          }
        },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);

      // Count total matches
      const matchCount = await this.aggregate([
        {
          $match: {
            sender: { $in: likedUserIds },
            recipient: userObjectId,
          }
        },
        { $count: "total" }
      ]);

      const total = matchCount.length > 0 ? matchCount[0].total : 0;

      return {
        data: matchesAggregation,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit,
        },
      };
    } catch (err) {
      logger.error(`Error in getMatches: ${err.message}`);
      throw err;
    }
  },

  /**
   * Check if two users match (both liked each other)
   * @param {ObjectId|string} userId1 - First user ID
   * @param {ObjectId|string} userId2 - Second user ID
   * @returns {Promise<boolean>} - Whether users match
   */
  async checkMatch(userId1, userId2) {
    try {
      // Convert to valid ObjectIds
      const user1 = safeObjectId(userId1);
      const user2 = safeObjectId(userId2);

      if (!user1 || !user2) {
        throw new Error("Invalid user ID format");
      }

      // Check both directions of likes
      const [like1to2, like2to1] = await Promise.all([
        this.exists({ sender: user1, recipient: user2 }),
        this.exists({ sender: user2, recipient: user1 }),
      ]);

      return !!(like1to2 && like2to1);
    } catch (err) {
      logger.error(`Error in checkMatch: ${err.message}`);
      throw err;
    }
  }
};

/**
 * Instance methods
 */
likeSchema.methods = {
  /**
   * Mark this like as seen
   * @returns {Promise} - Updated like document
   */
  async markAsSeen() {
    if (this.seen) return this;

    this.seen = true;
    this.seenAt = new Date();
    return this.save();
  },

  /**
   * Add a message to this like
   * @param {string} message - Message to add
   * @returns {Promise} - Updated like document
   */
  async addMessage(message) {
    if (!message || message.trim().length === 0) {
      throw new Error("Message cannot be empty");
    }

    if (message.length > 200) {
      throw new Error("Message cannot exceed 200 characters");
    }

    this.message = message.trim();
    return this.save();
  }
};

// Create a virtual for convenience to check if this is a match
likeSchema.virtual('isMatch').get(async function() {
  // This must be called with await since it's an async virtual
  try {
    return await this.constructor.checkMatch(this.sender, this.recipient);
  } catch (err) {
    logger.error(`Error in isMatch virtual: ${err.message}`);
    return false;
  }
});

const Like = model("Like", likeSchema);

export default Like;

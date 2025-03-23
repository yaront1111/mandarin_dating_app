// models/Story.js - Production-ready implementation with optimized queries and robust error handling
import mongoose from "mongoose"
import logger from "../logger.js"

const { Schema, model } = mongoose

// Define a reaction schema for story reactions
const ReactionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ["like", "love", "laugh", "wow", "sad", "angry"],
    default: "like",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// Define a viewer schema for tracking story views
const ViewerSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  viewedAt: {
    type: Date,
    default: Date.now,
  },
})

/**
 * Story schema - user-created content with various types (image, video, text)
 */
const StorySchema = new Schema(
  {
    // User who created the story
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
      index: true,
    },

    // Type of story
    type: {
      type: String,
      enum: {
        values: ["image", "video", "text"],
        message: "Story type must be image, video, or text",
      },
      required: [true, "Story type is required"],
      index: true,
    },

    // Added for client-side compatibility
    mediaType: {
      type: String,
      enum: ["image", "video", "text"],
    },

    // Media URL for image/video stories
    media: {
      type: String,
    },

    // For consistency with client expectations
    mediaUrl: {
      type: String,
    },

    // Content for text stories
    content: {
      type: String,
      trim: true,
      validate: {
        validator: function (val) {
          // Text stories must have content
          if (this.type === "text" && (!val || val.trim().length === 0)) {
            return false
          }
          return true
        },
        message: "Text stories must have content",
      },
    },

    // Added for client-side compatibility
    text: {
      type: String,
    },

    // Background color (primarily for text stories)
    backgroundColor: {
      type: String,
      default: "#000000",
    },

    // Added for client-side compatibility
    backgroundStyle: {
      type: String,
    },

    // Font style for text stories
    fontStyle: {
      type: String,
    },

    // Store extra styles as an object
    extraStyles: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Duration in hours that the story should be visible
    duration: {
      type: Number,
      default: 24, // Duration in hours
      min: [1, "Duration must be at least 1 hour"],
      max: [72, "Duration cannot exceed 72 hours"],
    },

    // Users who have viewed the story
    viewers: [ViewerSchema],

    // User reactions to the story
    reactions: [ReactionSchema],

    // When the story was created
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // When the story expires
    expiresAt: {
      type: Date,
      default: function () {
        const date = new Date(this.createdAt || Date.now())
        date.setHours(date.getHours() + (this.duration || 24))
        return date
      },
      index: true,
    },

    // Flag for highlighting premium content
    isPremium: {
      type: Boolean,
      default: false,
    },

    // Cached user data for faster retrieval
    userData: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Virtual for determining if a story is expired
StorySchema.virtual("isExpired").get(function () {
  if (!this.createdAt) return true
  return new Date() > this.expiresAt
})

// Virtual for view count
StorySchema.virtual("viewCount").get(function () {
  return this.viewers ? this.viewers.length : 0
})

// Virtual for reaction count
StorySchema.virtual("reactionCount").get(function () {
  return this.reactions ? this.reactions.length : 0
})

// Middleware to ensure consistent data before saving
StorySchema.pre("save", function (next) {
  try {
    // Calculate expiration date
    const expiryDate = new Date(this.createdAt || Date.now())
    expiryDate.setHours(expiryDate.getHours() + (this.duration || 24))
    this.expiresAt = expiryDate

    // Ensure mediaType matches type for consistency
    if (this.type && !this.mediaType) {
      this.mediaType = this.type
    }

    // Ensure text and content are consistent
    if (this.content && !this.text && this.type === "text") {
      this.text = this.content
    }

    if (this.text && !this.content && this.type === "text") {
      this.content = this.text
    }

    // Ensure mediaUrl matches media
    if (this.media && !this.mediaUrl) {
      this.mediaUrl = this.media
    }

    if (this.mediaUrl && !this.media) {
      this.media = this.mediaUrl
    }

    // Ensure backgroundStyle matches backgroundColor
    if (this.backgroundColor && !this.backgroundStyle) {
      this.backgroundStyle = this.backgroundColor
    }

    if (this.backgroundStyle && !this.backgroundColor) {
      this.backgroundColor = this.backgroundStyle
    }

    // Type-specific validations
    if ((this.type === "image" || this.type === "video") && !this.media && !this.mediaUrl) {
      return next(new Error("Media is required for image and video stories"))
    }

    if (this.type === "text" && !this.content && !this.text) {
      return next(new Error("Content is required for text stories"))
    }

    next()
  } catch (error) {
    logger.error(`Error in Story pre-save middleware: ${error.message}`)
    next(error)
  }
})

// Create TTL index on expiresAt for auto-deletion of expired stories
StorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Create compound index for efficient user story queries
StorySchema.index({ user: 1, expiresAt: 1 })

// Create compound index for efficient viewer queries
StorySchema.index({ "viewers.user": 1, expiresAt: 1 })

/**
 * Static method to find active stories by user
 * @param {ObjectId|String} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Active stories
 */
StorySchema.statics.findActiveByUser = async function (userId, options = {}) {
  const { page = 1, limit = 20 } = options
  const skip = (page - 1) * limit

  try {
    const now = new Date()

    const query = {
      user: userId,
      expiresAt: { $gt: now },
    }

    const [stories, total] = await Promise.all([
      this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "nickname username name profilePicture avatar")
        .lean(),
      this.countDocuments(query),
    ])

    return {
      data: stories,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    }
  } catch (error) {
    logger.error(`Error in findActiveByUser: ${error.message}`)
    throw error
  }
}

/**
 * Static method to find all active stories for the feed
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Feed stories
 */
StorySchema.statics.findAllActive = async function (options = {}) {
  const { page = 1, limit = 50 } = options
  const skip = (page - 1) * limit

  try {
    const now = new Date()

    // Get all active stories
    const query = {
      expiresAt: { $gt: now },
    }

    const [stories, total] = await Promise.all([
      this.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "nickname username name profilePicture avatar")
        .lean(),
      this.countDocuments(query),
    ])

    return {
      data: stories,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    }
  } catch (error) {
    logger.error(`Error in findAllActive: ${error.message}`)
    throw error
  }
}

/**
 * Instance method to add a viewer
 * @param {ObjectId|String} userId - Viewing user's ID
 * @returns {Promise<Object>} Updated story
 */
StorySchema.methods.addViewer = async function (userId) {
  // Check if already viewed
  const alreadyViewed = this.viewers.some((v) => v.user && v.user.toString() === userId.toString())

  if (!alreadyViewed) {
    this.viewers.push({
      user: userId,
      viewedAt: new Date(),
    })

    return this.save()
  }

  return this
}

/**
 * Instance method to add a reaction
 * @param {ObjectId|String} userId - User ID adding the reaction
 * @param {String} type - Reaction type
 * @returns {Promise<Object>} Updated story
 */
StorySchema.methods.addReaction = async function (userId, type = "like") {
  // Check for existing reaction
  const existingIndex = this.reactions.findIndex((r) => r.user && r.user.toString() === userId.toString())

  if (existingIndex >= 0) {
    // Update existing reaction
    this.reactions[existingIndex].type = type
    this.reactions[existingIndex].updatedAt = new Date()
  } else {
    // Add new reaction
    this.reactions.push({
      user: userId,
      type,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  return this.save()
}

/**
 * Instance method to remove a reaction
 * @param {ObjectId|String} userId - User ID removing the reaction
 * @returns {Promise<Object>} Updated story
 */
StorySchema.methods.removeReaction = async function (userId) {
  this.reactions = this.reactions.filter((r) => !r.user || r.user.toString() !== userId.toString())

  return this.save()
}

/**
 * Check if a user has viewed this story
 * @param {ObjectId|String} userId - User ID to check
 * @returns {Boolean} Whether the user has viewed the story
 */
StorySchema.methods.isViewedBy = function (userId) {
  return this.viewers.some((v) => v.user && v.user.toString() === userId.toString())
}

const Story = model("Story", StorySchema)

export default Story

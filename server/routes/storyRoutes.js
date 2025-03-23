import express from "express"
import { protect } from "../middleware/auth.js"
import { canCreateStory } from "../middleware/permissions.js"
import upload from "../middleware/upload.js"
import { check, validationResult } from "express-validator"
import Story from "../models/Story.js"
import User from "../models/User.js"
import logger from "../logger.js"
import mongoose from "mongoose"

const router = express.Router()

/**
 * Validate ObjectId
 * @param {string} id - ID to validate
 * @returns {boolean} Whether the ID is valid
 */
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id)
}

/**
 * Check for recent story creation by the same user
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} Whether user has created a story recently
 */
const hasRecentStoryCreation = async (userId) => {
  try {
    // Look for stories created in the last 5 seconds by this user
    const recentTime = new Date(Date.now() - 5000) // 5 seconds ago
    const count = await Story.countDocuments({
      user: userId,
      createdAt: { $gt: recentTime },
    })
    return count > 0
  } catch (err) {
    logger.error(`Error checking recent story creation: ${err.message}`)
    return false // Default to false to not block creation on error
  }
}

/**
 * Format story for response
 * @param {Object} story - Story object
 * @returns {Object} Formatted story
 */
const formatStoryResponse = (story) => {
  // Add userData for compatibility with frontend
  if (story.user && typeof story.user === "object") {
    story.userData = { ...story.user }
  }
  return story
}

// @route   GET /api/stories
// @desc    Get all active stories
// @access  Public
router.get("/", async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 50

    // Only return active (non-expired) stories
    const now = new Date()

    const stories = await Story.find({ expiresAt: { $gt: now } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "nickname username name profilePicture avatar")
      .lean()

    // Format stories for response
    const formattedStories = stories.map(formatStoryResponse)

    // Get total count for pagination
    const total = await Story.countDocuments({ expiresAt: { $gt: now } })

    res.json({
      success: true,
      data: formattedStories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    logger.error(`Error fetching stories: ${err.message}`)
    res.status(500).json({
      success: false,
      error: "Server error",
    })
  }
})

// @route   POST /api/stories
// @desc    Create a new story with media
// @access  Private
router.post(
  "/",
  protect,
  canCreateStory,
  upload.single("media"),
  [
    check("type").isIn(["image", "video", "text"]).withMessage("Invalid story type"),
    check("content").if(check("type").equals("text")).notEmpty().withMessage("Content is required for text stories"),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      })
    }

    try {
      const { type, content, backgroundColor, backgroundStyle, fontStyle, duration } = req.body

      // Additional validation
      if ((type === "image" || type === "video") && !req.file) {
        return res.status(400).json({
          success: false,
          error: "Media file is required for image and video stories",
        })
      }

      // Check for recent submissions to prevent duplicates
      if (await hasRecentStoryCreation(req.user._id || req.user.id)) {
        return res.status(429).json({
          success: false,
          error: "Please wait a few seconds before creating another story",
        })
      }

      // Create story object
      const storyData = {
        user: req.user._id || req.user.id,
        type,
        mediaType: type,
        content: type === "text" ? content : undefined,
        text: type === "text" ? content : undefined,
        backgroundColor: backgroundColor || "#000000",
        backgroundStyle: backgroundStyle || backgroundColor || "#000000",
        fontStyle: fontStyle || "default",
        duration: Number(duration) || 24,
      }

      // Add media if provided
      if (req.file) {
        storyData.media = `/uploads/${req.file.filename}`
        storyData.mediaUrl = `/uploads/${req.file.filename}`
      }

      const newStory = new Story(storyData)
      const story = await newStory.save()

      // Update user's lastStoryCreated timestamp
      if (req.updateLastStoryCreated) {
        await User.findByIdAndUpdate(req.user._id || req.user.id, {
          lastStoryCreated: new Date(),
        })
      }

      // Populate user information
      const populatedStory = await Story.findById(story._id)
        .populate("user", "nickname username name profilePicture avatar email")
        .lean()

      // Format for response
      const formattedStory = formatStoryResponse(populatedStory)

      res.status(201).json({
        success: true,
        data: formattedStory,
        story: formattedStory, // Include both for compatibility
      })
    } catch (err) {
      logger.error(`Error creating story: ${err.message}`)
      res.status(500).json({
        success: false,
        error: err.message || "Server error",
      })
    }
  },
)

// @route   POST /api/stories/text
// @desc    Create a new text-only story
// @access  Private
router.post(
  "/text",
  protect,
  canCreateStory,
  [check("content").notEmpty().withMessage("Content is required for text stories")],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      })
    }

    try {
      const { content, text, backgroundColor, backgroundStyle, fontStyle, duration, extraStyles } = req.body

      // Use either content or text field
      const storyContent = content || text

      // Ensure we have a valid user ID
      const userId = req.user._id || req.user.id
      if (!userId) {
        logger.error("No user ID found in request")
        return res.status(400).json({
          success: false,
          error: "User ID is required",
        })
      }

      // Check for recent submissions to prevent duplicates
      if (await hasRecentStoryCreation(userId)) {
        return res.status(429).json({
          success: false,
          error: "Please wait a few seconds before creating another story",
        })
      }

      const newStory = new Story({
        user: userId,
        type: "text",
        mediaType: "text",
        content: storyContent,
        text: storyContent,
        backgroundColor: backgroundColor || "#000000",
        backgroundStyle: backgroundStyle || backgroundColor || "#000000",
        fontStyle: fontStyle || "default",
        duration: Number(duration) || 24, // Default 24 hours
        extraStyles: extraStyles || {},
      })

      const story = await newStory.save()

      // Update user's lastStoryCreated timestamp
      if (req.updateLastStoryCreated) {
        await User.findByIdAndUpdate(userId, {
          lastStoryCreated: new Date(),
        })
      }

      // Populate user data
      const populatedStory = await Story.findById(story._id)
        .populate("user", "nickname username name profilePicture avatar email")
        .lean()

      // Format for response
      const formattedStory = formatStoryResponse(populatedStory)

      res.status(201).json({
        success: true,
        data: formattedStory,
        story: formattedStory, // Include both for compatibility
      })
    } catch (err) {
      logger.error(`Error creating text story: ${err.message}`)
      res.status(500).json({
        success: false,
        error: err.message || "Server error",
      })
    }
  },
)

// @route   GET /api/stories/:id
// @desc    Get a story by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    // Validate ID
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid story ID format",
      })
    }

    const story = await Story.findById(req.params.id)
      .populate("user", "nickname username name profilePicture avatar")
      .lean()

    if (!story) {
      return res.status(404).json({
        success: false,
        error: "Story not found",
      })
    }

    // Format for response
    const formattedStory = formatStoryResponse(story)

    res.json({
      success: true,
      data: formattedStory,
    })
  } catch (err) {
    logger.error(`Error fetching story: ${err.message}`)
    res.status(500).json({
      success: false,
      error: "Server error",
    })
  }
})

// @route   GET /api/stories/user/:userId
// @desc    Get stories for a specific user
// @access  Public
router.get("/user/:userId", async (req, res) => {
  try {
    // Validate ID
    if (!isValidObjectId(req.params.userId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid user ID format",
      })
    }

    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20

    // Only return active (non-expired) stories
    const now = new Date()

    const stories = await Story.find({
      user: req.params.userId,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("user", "nickname username name profilePicture avatar email")
      .lean()

    // Format stories for response
    const formattedStories = stories.map(formatStoryResponse)

    // Get total count for pagination
    const total = await Story.countDocuments({
      user: req.params.userId,
      expiresAt: { $gt: now },
    })

    res.json({
      success: true,
      data: formattedStories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    logger.error(`Error fetching user stories: ${err.message}`)
    res.status(500).json({
      success: false,
      error: "Server error",
    })
  }
})

// @route   DELETE /api/stories/:id
// @desc    Delete a story
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    // Validate ID
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid story ID format",
      })
    }

    const story = await Story.findById(req.params.id)

    if (!story) {
      return res.status(404).json({
        success: false,
        error: "Story not found",
      })
    }

    // Check user authorization
    if (story.user.toString() !== (req.user._id || req.user.id).toString()) {
      return res.status(401).json({
        success: false,
        error: "User not authorized",
      })
    }

    await Story.deleteOne({ _id: req.params.id })
    res.json({
      success: true,
      message: "Story removed",
    })
  } catch (err) {
    logger.error(`Error deleting story: ${err.message}`)
    res.status(500).json({
      success: false,
      error: "Server error",
    })
  }
})

// @route   POST /api/stories/:id/view
// @desc    Mark a story as viewed
// @access  Private
router.post("/:id/view", protect, async (req, res) => {
  try {
    // Validate ID
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid story ID format",
      })
    }

    const story = await Story.findById(req.params.id)

    if (!story) {
      return res.status(404).json({
        success: false,
        error: "Story not found",
      })
    }

    // Check if user has already viewed this story
    const userId = req.user._id || req.user.id
    const alreadyViewed = story.viewers.some((v) => v.user && v.user.toString() === userId.toString())

    if (alreadyViewed) {
      return res.json({
        success: true,
        message: "Story already viewed",
      })
    }

    // Add user to viewers array
    story.viewers.push({
      user: userId,
      viewedAt: new Date(),
    })

    await story.save()

    res.json({
      success: true,
      message: "Story marked as viewed",
    })
  } catch (err) {
    logger.error(`Error marking story as viewed: ${err.message}`)
    res.status(500).json({
      success: false,
      error: "Server error",
    })
  }
})

// @route   POST /api/stories/:id/react
// @desc    React to a story
// @access  Private
router.post(
  "/:id/react",
  protect,
  [check("reactionType").isIn(["like", "love", "laugh", "wow", "sad", "angry"]).withMessage("Invalid reaction type")],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      })
    }

    try {
      // Validate ID
      if (!isValidObjectId(req.params.id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid story ID format",
        })
      }

      const { reactionType } = req.body
      const story = await Story.findById(req.params.id)

      if (!story) {
        return res.status(404).json({
          success: false,
          error: "Story not found",
        })
      }

      // Use the model method to add reaction
      await story.addReaction(req.user._id || req.user.id, reactionType)

      res.json({
        success: true,
        message: "Reaction added",
        data: story.reactions,
      })
    } catch (err) {
      logger.error(`Error adding reaction to story: ${err.message}`)
      res.status(500).json({
        success: false,
        error: "Server error",
      })
    }
  },
)

// @route   DELETE /api/stories/:id/react
// @desc    Remove a reaction from a story
// @access  Private
router.delete("/:id/react", protect, async (req, res) => {
  try {
    // Validate ID
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid story ID format",
      })
    }

    const story = await Story.findById(req.params.id)

    if (!story) {
      return res.status(404).json({
        success: false,
        error: "Story not found",
      })
    }

    // Use the model method to remove reaction
    await story.removeReaction(req.user._id || req.user.id)

    res.json({
      success: true,
      message: "Reaction removed",
      data: story.reactions,
    })
  } catch (err) {
    logger.error(`Error removing reaction from story: ${err.message}`)
    res.status(500).json({
      success: false,
      error: "Server error",
    })
  }
})

// @route   GET /api/stories/:id/viewers
// @desc    Get viewers of a story
// @access  Private (only story owner)
router.get("/:id/viewers", protect, async (req, res) => {
  try {
    // Validate ID
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid story ID format",
      })
    }

    const story = await Story.findById(req.params.id)

    if (!story) {
      return res.status(404).json({
        success: false,
        error: "Story not found",
      })
    }

    // Check if user is the story owner
    if (story.user.toString() !== (req.user._id || req.user.id).toString()) {
      return res.status(401).json({
        success: false,
        error: "User not authorized to view this information",
      })
    }

    // Populate viewer information
    const populatedStory = await Story.findById(req.params.id).populate({
      path: "viewers.user",
      select: "nickname username name profilePicture avatar",
    })

    res.json({
      success: true,
      data: populatedStory.viewers,
    })
  } catch (err) {
    logger.error(`Error fetching story viewers: ${err.message}`)
    res.status(500).json({
      success: false,
      error: "Server error",
    })
  }
})

export default router

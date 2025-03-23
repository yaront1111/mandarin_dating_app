// middleware/permissions.js - Enhanced with ES modules and improved error handling
import { User } from "../models/index.js"
import logger from "../logger.js"

/**
 * Middleware to check if user can send messages (not just winks)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const canSendMessages = async (req, res, next) => {
  try {
    // Ensure the user is authenticated
    if (!req.user || !req.user._id) {
      logger.error("canSendMessages middleware used without authentication")
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      })
    }

    const user = await User.findById(req.user._id)

    if (!user) {
      logger.warn(`User not found in canSendMessages middleware: ${req.user._id}`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    if (!user.canSendMessages()) {
      logger.debug(`Message permission denied for user ${user._id} (account tier: ${user.accountTier})`)
      return res.status(403).json({
        success: false,
        error: "Free accounts can only send winks. Upgrade to send messages.",
        code: "UPGRADE_REQUIRED",
        subscriptionDetails: {
          accountTier: user.accountTier,
          canSendMessages: false,
        },
      })
    }

    next()
  } catch (err) {
    logger.error(`Error checking message permissions: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Server error while checking permissions",
    })
  }
}

/**
 * Middleware to check if user can create a story
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const canCreateStory = async (req, res, next) => {
  try {
    // Ensure the user is authenticated
    if (!req.user || !req.user._id) {
      logger.error("canCreateStory middleware used without authentication")
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      })
    }

    const user = await User.findById(req.user._id)

    if (!user) {
      logger.warn(`User not found in canCreateStory middleware: ${req.user._id}`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    if (!user.canCreateStory()) {
      // Calculate time remaining in cooldown
      const cooldownPeriod = 72 * 60 * 60 * 1000 // 72 hours in milliseconds
      const timeSinceLastStory = user.lastStoryCreated ? Date.now() - user.lastStoryCreated.getTime() : cooldownPeriod
      const timeRemaining = Math.max(0, cooldownPeriod - timeSinceLastStory)
      const hoursRemaining = Math.ceil(timeRemaining / (60 * 60 * 1000))

      logger.debug(`Story creation denied for user ${user._id} (cooldown: ${hoursRemaining} hours remaining)`)

      return res.status(403).json({
        success: false,
        error: `Free accounts can only create 1 story every 72 hours. Please try again in ${hoursRemaining} hours.`,
        code: "COOLDOWN_ACTIVE",
        cooldownDetails: {
          cooldownRemaining: timeRemaining,
          hoursRemaining,
          nextAvailable: user.lastStoryCreated
            ? new Date(user.lastStoryCreated.getTime() + cooldownPeriod)
            : new Date(),
        },
      })
    }

    // If we get here, user can create a story
    // Update lastStoryCreated timestamp after successful story creation
    req.updateLastStoryCreated = true

    next()
  } catch (err) {
    logger.error(`Error checking story creation permissions: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Server error while checking permissions",
    })
  }
}

/**
 * Middleware to check if user can like another user
 * Free users have a daily limit, premium users have unlimited likes
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const canLikeUser = async (req, res, next) => {
  try {
    // Ensure the user is authenticated
    if (!req.user || !req.user._id) {
      logger.error("canLikeUser middleware used without authentication")
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      })
    }

    // Get the full user object with account tier info
    const user = await User.findById(req.user._id)

    if (!user) {
      logger.warn(`User not found in canLikeUser middleware: ${req.user._id}`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Store the user object for use in the route handler
    req.userObj = user

    // Premium users can always like
    // Note: Using only PAID since that's the actual tier name in the User model
    if (user.accountTier === "PAID") {
      return next()
    }

    // Female users get unlimited likes
    if (user.accountTier === "FEMALE") {
      return next()
    }

    // Couple accounts get unlimited likes
    if (user.accountTier === "COUPLE") {
      return next()
    }

    // Free users have a daily limit
    if (user.accountTier === "FREE") {
      // Check if they've reached their daily limit
      if (user.dailyLikesRemaining <= 0) {
        // Check when likes will reset
        const now = new Date()
        const resetTime = user.dailyLikesReset
        const timeToReset = resetTime > now ? Math.ceil((resetTime - now) / (1000 * 60 * 60)) : 0

        logger.debug(
          `Like permission denied for user ${user._id} (remaining: ${user.dailyLikesRemaining}, reset in: ${timeToReset} hours)`,
        )

        return res.status(403).json({
          success: false,
          error: "You have reached your daily like limit. Upgrade to premium for unlimited likes!",
          code: "DAILY_LIMIT_REACHED",
          likeDetails: {
            accountTier: user.accountTier,
            dailyLikesRemaining: 0,
            dailyLikesReset: user.dailyLikesReset,
            resetInHours: timeToReset,
          },
        })
      }
    }

    next()
  } catch (err) {
    logger.error(`Error in canLikeUser middleware: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Server error while checking permissions",
    })
  }
}

/**
 * Middleware to check if the user has blocked the target user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkBlockStatus = async (req, res, next) => {
  try {
    const targetUserId = req.params.id || req.body.userId || req.body.recipientId

    if (!targetUserId) {
      return next() // No target user to check
    }

    // Ensure we have a valid user
    if (!req.user || !req.user._id) {
      return next()
    }

    const user = await User.findById(req.user._id)

    if (!user) {
      return next()
    }

    // Check if the user has blocked the target
    if (user.hasBlocked && user.hasBlocked(targetUserId)) {
      logger.debug(`User ${user._id} attempted to interact with blocked user ${targetUserId}`)
      return res.status(403).json({
        success: false,
        error: "You have blocked this user",
        code: "USER_BLOCKED",
      })
    }

    // Check if the user is blocked by the target
    const targetUser = await User.findById(targetUserId)
    if (targetUser && targetUser.hasBlocked && targetUser.hasBlocked(user._id)) {
      logger.debug(`User ${user._id} attempted to interact with user ${targetUserId} who has blocked them`)
      return res.status(403).json({
        success: false,
        error: "You cannot interact with this user",
        code: "BLOCKED_BY_USER",
      })
    }

    next()
  } catch (err) {
    logger.error(`Error in checkBlockStatus middleware: ${err.message}`, { stack: err.stack })
    next() // Continue even if there's an error checking block status
  }
}

export { canSendMessages, canCreateStory, canLikeUser, checkBlockStatus }

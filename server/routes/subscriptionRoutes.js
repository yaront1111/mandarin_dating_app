import express from "express"
import { protect } from "../middleware/auth.js"
import logger from "../logger.js"
import { User } from "../models/index.js"

const router = express.Router()

/**
 * @route   GET /api/subscription/status
 * @desc    Get user's subscription status
 * @access  Private
 */
router.get("/status", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

    if (!user) {
      logger.warn(`User not found when checking subscription status: ${req.user._id}`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Calculate time until subscription expiry
    let daysRemaining = 0
    if (user.subscriptionExpiry) {
      const now = new Date()
      const expiryDate = new Date(user.subscriptionExpiry)
      daysRemaining = Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)))
    }

    // Calculate time until likes reset for free users
    let likesResetHours = 0
    if (user.accountTier === "FREE" && user.dailyLikesReset) {
      const now = new Date()
      const resetTime = new Date(user.dailyLikesReset)
      likesResetHours = Math.max(0, Math.ceil((resetTime - now) / (1000 * 60 * 60)))
    }

    // Calculate time until story creation is available again
    let storyCreationHours = 0
    if (user.accountTier === "FREE" && user.lastStoryCreated) {
      const now = new Date()
      const cooldownPeriod = 72 * 60 * 60 * 1000 // 72 hours
      const nextAvailable = new Date(user.lastStoryCreated.getTime() + cooldownPeriod)
      if (nextAvailable > now) {
        storyCreationHours = Math.ceil((nextAvailable - now) / (1000 * 60 * 60))
      }
    }

    logger.debug(`Subscription status retrieved for user ${user._id} (tier: ${user.accountTier})`)

    return res.status(200).json({
      success: true,
      data: {
        accountTier: user.accountTier,
        isPaid: user.isPaid,
        subscriptionExpiry: user.subscriptionExpiry,
        daysRemaining,
        features: {
          canSendMessages: user.canSendMessages(),
          canCreateStory: user.canCreateStory(),
          dailyLikesRemaining: user.dailyLikesRemaining,
          likesResetHours,
          storyCreationHours,
        },
      },
    })
  } catch (err) {
    logger.error(`Error retrieving subscription status: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Server error while retrieving subscription status",
    })
  }
})

/**
 * @route   POST /api/subscription/upgrade
 * @desc    Upgrade user to paid account
 * @access  Private
 */
router.post("/upgrade", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

    if (!user) {
      logger.warn(`User not found when upgrading subscription: ${req.user._id}`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Check if user is already on a paid plan
    if (user.isPaid && user.subscriptionExpiry && user.subscriptionExpiry > new Date()) {
      logger.info(`User ${user._id} attempted to upgrade but already has an active subscription`)
      return res.status(400).json({
        success: false,
        error: "You already have an active subscription",
        code: "ALREADY_SUBSCRIBED",
        data: {
          accountTier: user.accountTier,
          subscriptionExpiry: user.subscriptionExpiry,
        },
      })
    }

    // In a real app, this would process payment and validate the transaction
    // For now, we'll just upgrade the user

    // Set subscription for 30 days
    const subscriptionExpiry = new Date()
    subscriptionExpiry.setDate(subscriptionExpiry.getDate() + 30)

    user.isPaid = true
    user.subscriptionExpiry = subscriptionExpiry

    // Update account tier
    if (user.accountTier === "FREE") {
      user.accountTier = "PAID"
    }

    await user.save()

    logger.info(`User ${user._id} upgraded to paid subscription until ${subscriptionExpiry}`)

    return res.status(200).json({
      success: true,
      message: "Subscription upgraded successfully",
      data: {
        accountTier: user.accountTier,
        isPaid: user.isPaid,
        subscriptionExpiry: user.subscriptionExpiry,
      },
    })
  } catch (err) {
    logger.error(`Error upgrading subscription: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Server error while upgrading subscription",
    })
  }
})

/**
 * @route   POST /api/subscription/cancel
 * @desc    Cancel user's subscription
 * @access  Private
 */
router.post("/cancel", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

    if (!user) {
      logger.warn(`User not found when canceling subscription: ${req.user._id}`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Check if user has an active subscription
    if (!user.isPaid || !user.subscriptionExpiry || user.subscriptionExpiry <= new Date()) {
      logger.info(`User ${user._id} attempted to cancel but has no active subscription`)
      return res.status(400).json({
        success: false,
        error: "You don't have an active subscription to cancel",
        code: "NO_ACTIVE_SUBSCRIPTION",
      })
    }

    // In a real app, this would cancel recurring payments
    // For now, we'll just mark the subscription as ending at the current expiry date

    logger.info(`User ${user._id} canceled subscription (will expire on ${user.subscriptionExpiry})`)

    return res.status(200).json({
      success: true,
      message: "Subscription canceled. You will have access until your current period ends.",
      data: {
        accountTier: user.accountTier,
        isPaid: user.isPaid,
        subscriptionExpiry: user.subscriptionExpiry,
      },
    })
  } catch (err) {
    logger.error(`Error canceling subscription: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Server error while canceling subscription",
    })
  }
})

export default router

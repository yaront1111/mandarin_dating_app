/**
 * routes/authRoutes.js
 *
 * Contains authentication-related endpoints.
 * This file uses ES Modules and modern practices for a production-ready API.
 */

import express from "express"
import jwt from "jsonwebtoken"
import { check, validationResult } from "express-validator"
import { User } from "../models/index.js" // Adjust the path according to your project structure
import { protect, generateToken, asyncHandler } from "../middleware/auth.js"
import config from "../config.js"
import logger from "../logger.js"
import rateLimit from "express-rate-limit"
import crypto from "crypto"

const router = express.Router()

// Configure rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // max 10 requests per IP per windowMs
  message: {
    success: false,
    error: "Too many authentication attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Update the password validator function to be more explicit
const passwordValidator = (value) => {
  // Check for minimum length
  if (value.length < 8) {
    return "Password must be at least 8 characters"
  }

  // Check for uppercase letter
  if (!/(?=.*[A-Z])/.test(value)) {
    return "Password must include at least one uppercase letter"
  }

  // Check for lowercase letter
  if (!/(?=.*[a-z])/.test(value)) {
    return "Password must include at least one lowercase letter"
  }

  // Check for number
  if (!/(?=.*\d)/.test(value)) {
    return "Password must include at least one number"
  }

  // Check for special character
  if (!/(?=.*[@$!%*?&])/.test(value)) {
    return "Password must include at least one special character (@$!%*?&)"
  }

  return true
}

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  "/register",
  authLimiter,
  [
    check("email", "Please include a valid email").isEmail(),
    check("password").custom(passwordValidator),
    check("nickname", "Nickname is required").notEmpty().trim().isLength({ min: 3, max: 30 }),
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg,
      })
    }

    const { email, password, nickname, details, accountTier, isCouple } = req.body

    try {
      // Check if user already exists
      let user = await User.findOne({ email })
      if (user) {
        logger.warn(`Registration attempt with existing email: ${email}`)
        return res.status(400).json({
          success: false,
          error: "User already exists",
          code: "EMAIL_EXISTS",
        })
      }

      // Create new user instance with all profile details
      user = new User({
        email,
        password,
        nickname,
        isVerified: false,
        version: 1,
        details: details || {},
        accountTier: accountTier || "FREE",
        isCouple: isCouple || false,
      })

      // Generate verification token (email sending to be implemented in production)
      const verificationToken = user.createVerificationToken()

      await user.save()

      // Create token payload for authentication
      const payload = {
        id: user.id,
        role: user.role,
        version: user.version,
      }

      const token = generateToken(payload)

      res.status(201).json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          role: user.role,
          isVerified: user.isVerified,
          accountTier: user.accountTier,
        },
        message: "Registration successful! Please verify your email address.",
      })
    } catch (err) {
      logger.error(`Registration error: ${err.message}`)

      // Provide more specific error messages for validation errors
      if (err.name === "ValidationError") {
        const messages = Object.values(err.errors).map((val) => val.message)
        return res.status(400).json({
          success: false,
          error: messages[0], // Return the first validation error
        })
      }

      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   POST /api/auth/login
// @desc    Authenticate user and return token
// @access  Public
router.post(
  "/login",
  authLimiter,
  [check("email", "Please include a valid email").isEmail(), check("password", "Password is required").exists()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg,
      })
    }

    const { email, password } = req.body

    try {
      // Find user (explicitly selecting the password field)
      const user = await User.findOne({ email }).select("+password")

      if (!user) {
        logger.warn(`Login attempt with non-existent email: ${email}`)
        return res.status(400).json({
          success: false,
          error: "Invalid credentials",
        })
      }

      // Check if account is locked
      if (user.isLocked && user.isLocked()) {
        const lockTime = new Date(user.lockUntil)
        logger.warn(`Login attempt on locked account: ${email}`)
        return res.status(403).json({
          success: false,
          error: `Account is temporarily locked. Try again after ${lockTime.toLocaleString()}`,
        })
      }

      // Verify password
      const isMatch = await user.correctPassword(password, user.password)
      if (!isMatch) {
        await user.incrementLoginAttempts()
        logger.warn(`Failed login attempt for user: ${email}`)
        return res.status(400).json({ success: false, error: "Invalid credentials" })
      }

      // Reset login attempts upon successful login
      user.loginAttempts = 0
      user.lockUntil = undefined
      await user.save()

      // Update user's last active timestamp
      await User.findByIdAndUpdate(user._id, { lastActive: Date.now() })

      const payload = {
        id: user.id,
        role: user.role,
        version: user.version || 1,
      }

      const token = generateToken(payload)
      const refreshToken = user.createRefreshToken()
      await user.save()

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          nickname: user.nickname,
          role: user.role,
          isVerified: user.isVerified,
          accountTier: user.accountTier,
        },
      })
    } catch (err) {
      logger.error(`Login error: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   GET /api/auth/me
// @desc    Get current user details
// @access  Private
router.get(
  "/me",
  protect,
  asyncHandler(async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select("-password")
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" })
      }
      res.json({ success: true, data: user })
    } catch (err) {
      logger.error(`Get user error: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   POST /api/auth/refresh-token
// @desc    Refresh authentication token
// @access  Public
router.post(
  "/refresh-token",
  asyncHandler(async (req, res) => {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({ success: false, error: "Token is required" })
    }

    try {
      // IMPORTANT: Ignore expiration when verifying the token for refresh purposes
      const decoded = jwt.verify(token, config.JWT_SECRET, { ignoreExpiration: true })

      // Get user from database
      const user = await User.findById(decoded.id).select("-password")

      if (!user) {
        return res.status(401).json({ success: false, error: "User not found" })
      }

      // Check if token has been revoked by comparing versions
      if (decoded.version !== user.version) {
        return res.status(401).json({ success: false, error: "Token has been revoked" })
      }

      // Check if token is too old (optional security measure)
      const tokenIssuedAt = decoded.iat * 1000 // Convert to milliseconds
      const now = Date.now()
      const maxRefreshAge = 30 * 24 * 60 * 60 * 1000 // 30 days in milliseconds

      if (now - tokenIssuedAt > maxRefreshAge) {
        return res.status(401).json({ success: false, error: "Token too old for refresh" })
      }

      // Create new token payload
      const payload = {
        id: user.id,
        role: user.role,
        version: user.version,
      }

      // Generate new token
      const newToken = generateToken(payload)

      // Log successful refresh
      logger.info(`Token refreshed for user: ${user.id}`)

      // Return new token
      res.json({ success: true, token: newToken })
    } catch (err) {
      // Log the specific error for debugging
      logger.error(`Token refresh error: ${err.message}, ${err.name}`)

      // Return a more specific error message based on the type of error
      if (err.name === "JsonWebTokenError") {
        return res.status(401).json({ success: false, error: "Invalid token format" })
      } else if (err.name === "TokenExpiredError") {
        // This shouldn't happen with ignoreExpiration: true, but just in case
        return res.status(401).json({ success: false, error: "Token expired" })
      } else {
        return res.status(401).json({ success: false, error: "Invalid token" })
      }
    }
  }),
)

// @route   POST /api/auth/logout
// @desc    Logout user and invalidate tokens
// @access  Private
router.post(
  "/logout",
  protect,
  asyncHandler(async (req, res) => {
    try {
      const user = await User.findById(req.user._id)
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" })
      }
      user.refreshToken = undefined
      user.refreshTokenExpires = undefined
      user.version = (user.version || 0) + 1
      await user.save()
      await User.findByIdAndUpdate(user._id, { isOnline: false, lastActive: Date.now() })
      res.json({ success: true, message: "Logged out successfully" })
    } catch (err) {
      logger.error(`Logout error: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   POST /api/auth/verify-email
// @desc    Verify user email address
// @access  Public
router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = req.body
    if (!token) {
      return res.status(400).json({ success: false, error: "Verification token is required" })
    }
    try {
      const hashedToken = crypto.createHash("sha256").update(token).digest("hex")
      const user = await User.findOne({
        verificationToken: hashedToken,
        verificationTokenExpires: { $gt: Date.now() },
      })
      if (!user) {
        return res.status(400).json({ success: false, error: "Invalid or expired verification token" })
      }
      user.isVerified = true
      user.verificationToken = undefined
      user.verificationTokenExpires = undefined
      await user.save()
      res.json({ success: true, message: "Email verified successfully" })
    } catch (err) {
      logger.error(`Email verification error: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   POST /api/auth/forgot-password
// @desc    Request a password reset
// @access  Public
router.post(
  "/forgot-password",
  [check("email", "Please include a valid email").isEmail()],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg })
    }
    const { email } = req.body
    try {
      const user = await User.findOne({ email })
      if (!user) {
        return res.json({
          success: true,
          message: "If your email is registered, you will receive reset instructions",
        })
      }
      const resetToken = user.createPasswordResetToken()
      await user.save()
      res.json({
        success: true,
        message: "If your email is registered, you will receive reset instructions",
      })
    } catch (err) {
      logger.error(`Forgot password error: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   POST /api/auth/reset-password
// @desc    Reset user password
// @access  Public
router.post(
  "/reset-password",
  [check("token", "Reset token is required").exists(), check("password").custom(passwordValidator)],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg })
    }
    const { token, password } = req.body
    try {
      const hashedToken = crypto.createHash("sha256").update(token).digest("hex")
      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      })
      if (!user) {
        return res.status(400).json({ success: false, error: "Invalid or expired reset token" })
      }
      user.password = password
      user.passwordResetToken = undefined
      user.passwordResetExpires = undefined
      user.version = (user.version || 0) + 1
      await user.save()
      res.json({ success: true, message: "Password reset successful" })
    } catch (err) {
      logger.error(`Password reset error: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   POST /api/auth/change-password
// @desc    Change current password
// @access  Private
router.post(
  "/change-password",
  protect,
  [check("currentPassword", "Current password is required").exists(), check("newPassword").custom(passwordValidator)],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg })
    }
    const { currentPassword, newPassword } = req.body
    try {
      const user = await User.findById(req.user._id).select("+password")
      if (!user) {
        return res.status(404).json({ success: false, error: "User not found" })
      }
      const isMatch = await user.correctPassword(currentPassword, user.password)
      if (!isMatch) {
        return res.status(400).json({ success: false, error: "Current password is incorrect" })
      }
      user.password = newPassword
      user.version = (user.version || 0) + 1
      await user.save()
      const payload = {
        id: user.id,
        role: user.role,
        version: user.version,
      }
      const token = generateToken(payload)
      res.json({ success: true, message: "Password changed successfully", token })
    } catch (err) {
      logger.error(`Change password error: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// @route   GET /api/auth/test-connection
// @desc    Test API connectivity
// @access  Public
router.get("/test-connection", (req, res) => {
  res.json({
    success: true,
    message: "API connection successful",
    timestamp: new Date().toISOString(),
  })
})

export default router

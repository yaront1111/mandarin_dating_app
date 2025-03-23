// middleware/auth.js - Enhanced with ES modules, improved error handling and security
import jwt from "jsonwebtoken"
import { User } from "../models/index.js"
import config from "../config.js"
import logger from "../logger.js"

/**
 * Generate JWT token
 * @param {Object} payload - Data to encode in the token
 * @param {string} expiresIn - Token expiration time (e.g., '7d', '1h')
 * @returns {string} JWT token
 */
const generateToken = (payload, expiresIn = config.JWT_EXPIRE) => {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn })
}

/**
 * Verify JWT token without throwing errors
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET)
  } catch (error) {
    logger.debug(`Token verification failed: ${error.message}`)
    return null
  }
}

/**
 * Verify socket token (used by socket connections)
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const verifySocketToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET)
  } catch (error) {
    logger.debug(`Socket token verification failed: ${error.message}`)
    return null
  }
}

/**
 * Middleware to protect routes - requires authentication
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const protect = async (req, res, next) => {
  let token

  try {
    // Get token from various possible locations
    // 1. Authorization header with Bearer scheme
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1]
    }
    // 2. x-auth-token header (legacy/alternative)
    else if (req.header("x-auth-token")) {
      token = req.header("x-auth-token")
    }
    // 3. Cookie (if using cookie-based auth)
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token
    }

    // Check if no token
    if (!token) {
      logger.debug(`Access denied: No token provided - ${req.method} ${req.originalUrl}`)
      return res.status(401).json({
        success: false,
        error: "Authentication required. Please log in.",
      })
    }

    // Verify token
    let decoded
    try {
      decoded = jwt.verify(token, config.JWT_SECRET)
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        logger.debug(`Token expired: ${jwtError.message}`)
        return res.status(401).json({
          success: false,
          error: "Your session has expired. Please log in again.",
          code: "TOKEN_EXPIRED",
        })
      } else {
        logger.debug(`Invalid token: ${jwtError.message}`)
        return res.status(401).json({
          success: false,
          error: "Invalid authentication token.",
          code: "INVALID_TOKEN",
        })
      }
    }

    // Set user in request
    if (decoded.id) {
      // If token contains user ID, look up the user
      const user = await User.findById(decoded.id).select("+version")

      if (!user) {
        logger.debug(`Token contained non-existent user ID: ${decoded.id}`)
        return res.status(401).json({
          success: false,
          error: "User not found. Please log in again.",
          code: "USER_NOT_FOUND",
        })
      }

      // Check if token version matches user version (for token invalidation)
      if (user.version && decoded.version && user.version !== decoded.version) {
        logger.debug(`Token version mismatch: token=${decoded.version}, user=${user.version}`)
        return res.status(401).json({
          success: false,
          error: "Your session is no longer valid. Please log in again.",
          code: "TOKEN_REVOKED",
        })
      }

      // Set user object on request
      req.user = user
      return next()
    } else if (decoded.user) {
      // If token contains user object, set it directly (for backwards compatibility)
      req.user = decoded.user
      return next()
    }

    // If we get here, token format is invalid
    logger.debug(`Token has invalid format: ${JSON.stringify(decoded)}`)
    return res.status(401).json({
      success: false,
      error: "Invalid token format",
      code: "INVALID_TOKEN_FORMAT",
    })
  } catch (err) {
    logger.error(`Auth middleware error: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Authentication error",
    })
  }
}

// Add a new middleware to enhance the protect middleware with better ID handling
/**
 * Enhanced protection middleware that ensures consistent user ID handling
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const enhancedProtect = async (req, res, next) => {
  try {
    // First apply the standard protection middleware
    await protect(req, res, (err) => {
      if (err) return next(err)

      // Then enhance the user object with consistent ID handling
      if (req.user) {
        // Ensure _id is always a string
        if (req.user._id) {
          req.user._id = req.user._id.toString()
        }

        // Ensure id is always available and is a string
        if (!req.user.id && req.user._id) {
          req.user.id = req.user._id.toString()
        } else if (req.user.id) {
          req.user.id = req.user.id.toString()
        }
      }

      next()
    })
  } catch (err) {
    logger.error(`Enhanced auth middleware error: ${err.message}`, { stack: err.stack })
    return res.status(500).json({
      success: false,
      error: "Authentication error",
    })
  }
}

/**
 * Middleware to restrict access by role
 * @param {...string} roles - Roles allowed to access the route
 * @returns {Function} Middleware function
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.error("restrictTo middleware used without protect middleware")
      return res.status(500).json({
        success: false,
        error: "Server configuration error",
      })
    }

    if (!roles.includes(req.user.role)) {
      logger.debug(`Access denied: User ${req.user._id} (role: ${req.user.role}) attempted to access restricted route`)
      return res.status(403).json({
        success: false,
        error: "You do not have permission to perform this action",
      })
    }

    next()
  }
}

/**
 * Async handler wrapper to handle promise rejections
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    logger.error(`Unhandled error in route handler: ${err.message}`, {
      stack: err.stack,
      path: req.path,
      method: req.method,
    })
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === "production" ? "Server error occurred" : err.message,
    })
  })
}

/**
 * Optional authentication middleware - doesn't require auth but will
 * populate req.user if a valid token is provided
 */
const optionalAuth = async (req, res, next) => {
  let token

  // Get token from header (check both x-auth-token and Authorization header)
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1]
  } else if (req.header("x-auth-token")) {
    token = req.header("x-auth-token")
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token
  }

  // If no token, continue without setting user
  if (!token) {
    return next()
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET, { ignoreExpiration: true })

    // Set user in request if found
    if (decoded.id) {
      const user = await User.findById(decoded.id)
      if (user) {
        req.user = user
      }
    }

    next()
  } catch (err) {
    // Token is invalid but we continue without auth
    next()
  }
}

// Export the new middleware
export {
  generateToken,
  verifyToken,
  verifySocketToken,
  protect,
  enhancedProtect,
  restrictTo,
  asyncHandler,
  optionalAuth,
}

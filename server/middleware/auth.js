// middleware/auth.js - Enhanced with ES modules, improved error handling, and security
import jwt from "jsonwebtoken";
import { User } from "../models/index.js";
import config from "../config.js";
import logger from "../logger.js";

/**
 * Generate a JWT token.
 * @param {Object} payload - Data to encode in the token.
 * @param {string} expiresIn - Token expiration time (e.g., '7d', '1h'). Defaults to config.JWT_EXPIRE.
 * @returns {string} JWT token.
 */
const generateToken = (payload, expiresIn = config.JWT_EXPIRE) => {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn });
};

/**
 * Verify a JWT token without throwing errors.
 * @param {string} token - JWT token to verify.
 * @returns {Object|null} Decoded token payload if valid, or null if invalid.
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    logger.debug(`Token verification failed: ${error.message}`);
    return null;
  }
};

/**
 * Verify a JWT token for socket connections.
 * @param {string} token - JWT token to verify.
 * @returns {Object|null} Decoded token payload if valid, or null if invalid.
 */
const verifySocketToken = (token) => {
  try {
    return jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    logger.debug(`Socket token verification failed: ${error.message}`);
    return null;
  }
};

/**
 * Express middleware to protect routes by requiring a valid authentication token.
 * Checks for the token in the Authorization header, x-auth-token header, or cookies.
 * If a valid token is provided, attaches the authenticated user to req.user.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next function.
 */
const protect = async (req, res, next) => {
  let token;
  try {
    // Attempt to retrieve token from headers or cookies
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.header("x-auth-token")) {
      token = req.header("x-auth-token");
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // Deny access if no token is provided
    if (!token) {
      logger.debug(`Access denied: No token provided - ${req.method} ${req.originalUrl}`);
      return res.status(401).json({
        success: false,
        error: "Authentication required. Please log in.",
      });
    }

    // Verify the token
    let decoded;
    try {
      decoded = jwt.verify(token, config.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === "TokenExpiredError") {
        logger.debug(`Token expired: ${jwtError.message}`);
        return res.status(401).json({
          success: false,
          error: "Your session has expired. Please log in again.",
          code: "TOKEN_EXPIRED",
        });
      } else {
        logger.debug(`Invalid token: ${jwtError.message}`);
        return res.status(401).json({
          success: false,
          error: "Invalid authentication token.",
          code: "INVALID_TOKEN",
        });
      }
    }

    // If token contains a user ID, look up the user in the database
    if (decoded.id) {
      const user = await User.findById(decoded.id).select("+version");
      if (!user) {
        logger.debug(`Token contained non-existent user ID: ${decoded.id}`);
        return res.status(401).json({
          success: false,
          error: "User not found. Please log in again.",
          code: "USER_NOT_FOUND",
        });
      }

      // Check that the token version matches the user's version (for token invalidation)
      if (user.version && decoded.version && user.version !== decoded.version) {
        logger.debug(`Token version mismatch: token=${decoded.version}, user=${user.version}`);
        return res.status(401).json({
          success: false,
          error: "Your session is no longer valid. Please log in again.",
          code: "TOKEN_REVOKED",
        });
      }

      // Attach the authenticated user to the request object
      req.user = user;
      return next();
    } else if (decoded.user) {
      // For backward compatibility if token contains a user object
      req.user = decoded.user;
      return next();
    }

    // If the token format is invalid, return an error
    logger.debug(`Token has invalid format: ${JSON.stringify(decoded)}`);
    return res.status(401).json({
      success: false,
      error: "Invalid token format",
      code: "INVALID_TOKEN_FORMAT",
    });
  } catch (err) {
    logger.error(`Auth middleware error: ${err.message}`, { stack: err.stack });
    return res.status(500).json({
      success: false,
      error: "Authentication error",
    });
  }
};

/**
 * Enhanced protection middleware that first applies the standard protect middleware,
 * then ensures that user IDs are consistently formatted as strings.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next function.
 */
const enhancedProtect = async (req, res, next) => {
  try {
    // First, run the protect middleware
    await protect(req, res, (err) => {
      if (err) return next(err);
      // Ensure that _id and id fields are strings for consistency
      if (req.user) {
        if (req.user._id) req.user._id = req.user._id.toString();
        if (!req.user.id && req.user._id) {
          req.user.id = req.user._id.toString();
        } else if (req.user.id) {
          req.user.id = req.user.id.toString();
        }
      }
      next();
    });
  } catch (err) {
    logger.error(`Enhanced auth middleware error: ${err.message}`, { stack: err.stack });
    return res.status(500).json({
      success: false,
      error: "Authentication error",
    });
  }
};

/**
 * Middleware to restrict route access based on user roles.
 * Example usage: restrictTo("admin", "moderator")
 * @param {...string} roles - List of roles allowed to access the route.
 * @returns {Function} Express middleware function.
 */
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      logger.error("restrictTo middleware used without protect middleware");
      return res.status(500).json({
        success: false,
        error: "Server configuration error",
      });
    }
    if (!roles.includes(req.user.role)) {
      logger.debug(`Access denied: User ${req.user._id} (role: ${req.user.role}) attempted to access restricted route`);
      return res.status(403).json({
        success: false,
        error: "You do not have permission to perform this action",
      });
    }
    next();
  };
};

/**
 * Async handler wrapper to catch errors in asynchronous route handlers.
 * Usage: router.get('/route', asyncHandler(async (req, res) => { ... }))
 * @param {Function} fn - Asynchronous route handler function.
 * @returns {Function} Express middleware function.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    logger.error(`Unhandled error in route handler: ${err.message}`, {
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === "production" ? "Server error occurred" : err.message,
    });
  });
};

/**
 * Optional authentication middleware.
 * If a valid token is provided, populates req.user.
 * Does not block the route if no token is provided.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next function.
 */
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.header("x-auth-token")) {
    token = req.header("x-auth-token");
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // Continue without authentication if no token is present
  if (!token) return next();
  try {
    // Verify token without enforcing expiration
    const decoded = jwt.verify(token, config.JWT_SECRET, { ignoreExpiration: true });
    if (decoded.id) {
      const user = await User.findById(decoded.id);
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (err) {
    // On token error, proceed without setting req.user
    next();
  }
};

export {
  generateToken,
  verifyToken,
  verifySocketToken,
  protect,
  enhancedProtect,
  restrictTo,
  asyncHandler,
  optionalAuth,
};

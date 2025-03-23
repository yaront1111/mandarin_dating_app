// middleware/cors.js - Enhanced with ES modules and improved CORS configuration
import cors from "cors";
import logger from "../logger.js";

/**
 * CORS configuration middleware
 *
 * This module configures CORS settings based on environment.
 * It allows requests from specified origins, with a more flexible
 * approach for development environments.
 *
 * @returns {Function} Express middleware
 */
const configureCors = () => {
  // In production, use specific domains from environment variables; in development, allow multiple localhost ports.
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : [process.env.FRONTEND_URL || "https://yourdomain.com"]
      : ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"];

  // Log the allowed origins
  logger.info(`CORS configured with origins: ${JSON.stringify(allowedOrigins)}`);

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) {
        logger.debug("Request with no origin allowed");
        return callback(null, true);
      }

      // Check if origin is allowed
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        logger.debug(`CORS allowed for origin: ${origin}`);
        return callback(null, true);
      }

      // Log rejected origins for debugging
      logger.warn(`CORS rejected for origin: ${origin}`);
      const msg = "CORS policy does not allow access from the specified Origin";
      return callback(new Error(msg), false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Cache-Control",
      "x-no-cache",    // Allow x-no-cache header
      "x-auth-token"   // Allow x-auth-token header
    ],
    exposedHeaders: [
      "Content-Length",
      "X-Rate-Limit-Limit",
      "X-Rate-Limit-Remaining",
      "X-Rate-Limit-Reset"
    ],
    credentials: true, // Enable credentials for auth scenarios
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });
};

/**
 * Custom CORS error handler
 * Provides better error messages for CORS failures
 */
const corsErrorHandler = (err, req, res, next) => {
  if (err.message.includes("CORS")) {
    logger.warn(`CORS Error: ${err.message}`, {
      origin: req.headers.origin,
      method: req.method,
      path: req.path,
    });

    return res.status(403).json({
      success: false,
      error: "Cross-Origin Request Blocked",
      message: "The request was blocked by CORS policy. If you are the API consumer, please contact the administrator.",
      code: "CORS_ERROR",
    });
  }
  next(err);
};

/**
 * Default export: function to apply CORS configuration directly to an Express app.
 * This alternative approach uses a slightly different configuration.
 */
const applyCors = (app) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000"];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, etc)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
          const msg = "The CORS policy for this site does not allow access from the specified Origin.";
          return callback(new Error(msg), false);
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
        "x-auth-token",  // Allow x-auth-token header
        "x-no-cache"     // Allow x-no-cache header
      ],
    })
  );
};

export default applyCors;
export { configureCors, corsErrorHandler };

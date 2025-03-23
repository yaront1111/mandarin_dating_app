// server.js - Enhanced with ES modules and improved application setup
import express from "express"
import http from "http"
import path from "path"
import helmet from "helmet"
import cookieParser from "cookie-parser"
import fs from "fs"
import compression from "compression"
import { fileURLToPath } from "url"
import mongoSanitize from "express-mongo-sanitize"

// Import custom modules
import logger, { requestLogger, gracefulShutdown } from "./logger.js"
import config from "./config.js"
import { connectDB, closeConnection } from "./db.js"
import routes from "./routes/index.js"
import { initSubscriptionTasks } from "./cron/subscriptionTasks.js"
import { configureCors, corsErrorHandler } from "./middleware/cors.js"

// Get directory name in ES modules context
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Initialize Express app
const app = express()

// Trust proxy - set this to fix rate limiter issues with proxies
app.set("trust proxy", 1)

// Create HTTP server
const server = http.createServer(app)

// Apply security middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable for easier development, configure properly in production
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
)

// Enable compression for responses
app.use(
  compression({
    level: 6, // Balanced compression level
    threshold: 1024, // Only compress responses larger than 1KB
    filter: (req, res) => {
      // Always compress HTML, JSON, and text responses
      if (
        req.headers["accept"]?.includes("text/html") ||
        req.headers["accept"]?.includes("application/json") ||
        req.headers["accept"]?.includes("text/")
      ) {
        return true
      }

      // Don't compress already compressed files
      if (req.url.match(/\.(jpg|jpeg|png|gif|webp|zip|mp4|webm|woff|woff2)$/)) {
        return false
      }

      // Use default compression filter for everything else
      return compression.filter(req, res)
    },
  }),
)

// Apply MongoDB data sanitization
app.use(mongoSanitize())

// Body parser middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Cookie parser
app.use(cookieParser())

// Enable CORS
app.use(configureCors())
app.use(corsErrorHandler)

// Request logging
app.use(requestLogger)

// Set static folder for public assets
app.use(express.static(path.join(__dirname, "public")))

// Define base upload path - use an absolute path to avoid confusion
const uploadsBasePath = path.join(process.cwd(), "uploads")

// Ensure uploads directory exists
if (!fs.existsSync(uploadsBasePath)) {
  fs.mkdirSync(uploadsBasePath, { recursive: true })
  logger.info(`Created uploads directory: ${uploadsBasePath}`)
}

// Ensure required subdirectories exist
const requiredDirs = ["images", "photos", "videos", "messages", "profiles", "stories", "temp", "deleted"]
requiredDirs.forEach((dir) => {
  const dirPath = path.join(uploadsBasePath, dir)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
    logger.info(`Created uploads subdirectory: ${dirPath}`)
  }
})

// Log all directories to help debug
logger.info(`Main uploads directory: ${uploadsBasePath}`)
requiredDirs.forEach((dir) => {
  logger.info(`  - ${dir} directory: ${path.join(uploadsBasePath, dir)}`)
})

// Set up static file serving for uploaded files - with debug info
app.use(
  "/uploads",
  (req, res, next) => {
    logger.debug(`Upload request for: ${req.path}`)
    next()
  },
  express.static(uploadsBasePath, {
    maxAge: "1d", // Cache for 1 day
    etag: true,
    lastModified: true,
    index: false, // Don't serve directory indexes
    dotfiles: "ignore",
  }),
)

// Add a diagnostic endpoint to check file existence
app.get("/api/check-file", (req, res) => {
  const filePath = req.query.path
  if (!filePath) {
    return res.status(400).json({ success: false, error: "No file path provided" })
  }

  const fullPath = path.join(uploadsBasePath, filePath)

  // Prevent path traversal
  if (!fullPath.startsWith(uploadsBasePath)) {
    return res.status(403).json({ success: false, error: "Invalid file path" })
  }

  fs.stat(fullPath, (err, stats) => {
    if (err) {
      return res.json({
        success: false,
        error: err.message,
        exists: false,
        requestedPath: filePath,
        fullPath: fullPath,
      })
    }

    return res.json({
      success: true,
      exists: true,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      requestedPath: filePath,
      fullPath: fullPath,
    })
  })
})

// Add request ID to each request for better logging
app.use((req, res, next) => {
  req.id = Date.now().toString(36) + Math.random().toString(36).substr(2)
  next()
})

// API version prefix
const API_PREFIX = "/api"

// API routes
app.use(API_PREFIX, routes)

// Global error handler
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500

  logger.error(`Global error handler: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    status: statusCode,
    requestId: req.id,
  })

  // In production, don't expose error details
  const errorMessage =
    process.env.NODE_ENV === "production" && statusCode === 500 ? "Internal server error" : err.message

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  })
})

// Handle 404 routes
app.use((req, res) => {
  logger.warn(`Route not found: ${req.method} ${req.originalUrl}`)
  res.status(404).json({
    success: false,
    error: "Resource not found",
  })
})

/**
 * Initialize application
 * Connects to database, starts server, sets up cron jobs
 */
const initializeApp = async () => {
  try {
    // Connect to MongoDB
    await connectDB()

    // Start server
    const PORT = process.env.PORT || config.PORT || 5000

    server.listen(PORT, async () => {
      logger.info(`Server running in ${process.env.NODE_ENV || "development"} mode on port ${PORT}`)

      try {
        // Initialize Socket.IO after server is listening
        const { default: initSocketServer } = await import("./socket/index.js")
        const io = await initSocketServer(server)

        // Store io in app for potential use in routes
        app.set("io", io)

        logger.info("Socket.IO server initialized successfully")
      } catch (err) {
        logger.error(`Failed to initialize Socket.IO: ${err.message}`)
      }

      // Initialize subscription tasks
      initSubscriptionTasks()

      logger.info("Server initialization complete")
    })
  } catch (err) {
    logger.error(`Server initialization failed: ${err.message}`)
    process.exit(1)
  }
}

// Handle graceful shutdown
const shutdownHandler = async (signal) => {
  logger.info(`${signal} signal received: Starting graceful shutdown`)

  // Give current requests a chance to finish
  server.close(async () => {
    logger.info("HTTP server closed")

    try {
      // Close database connection
      await closeConnection()

      // Shutdown logger gracefully
      await gracefulShutdown()

      logger.info("All connections closed gracefully")
      process.exit(0)
    } catch (err) {
      logger.error(`Error during shutdown: ${err.message}`)
      process.exit(1)
    }
  })

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error("Forced shutdown after timeout")
    process.exit(1)
  }, 30000) // 30 seconds
}

// Register shutdown handlers
process.on("SIGTERM", () => shutdownHandler("SIGTERM"))
process.on("SIGINT", () => shutdownHandler("SIGINT"))

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack })
  // Don't crash the server in production
  if (process.env.NODE_ENV !== "production") {
    server.close(() => process.exit(1))
  }
})

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack })

  // Always exit on uncaught exceptions, but try to do it gracefully
  shutdownHandler("uncaughtException")
})

// Start the application
initializeApp()

export { app, server }

// middleware/upload.js - Enhanced with ES modules, improved file validation, and directory organization
import multer from "multer"
import path from "path"
import fs from "fs"
import crypto from "crypto"
import { fileTypeFromBuffer } from "file-type"
import config from "../config.js"
import logger from "../logger.js"

// Create base uploads directory if it doesn't exist
const uploadDir = path.join(process.cwd(), "uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
  logger.info(`Created uploads directory: ${uploadDir}`)
}

// Sub-directories for different file types with enhanced organization
const directories = {
  images: path.join(uploadDir, "images"),
  photos: path.join(uploadDir, "photos"),
  videos: path.join(uploadDir, "videos"),
  messages: path.join(uploadDir, "messages"),
  profiles: path.join(uploadDir, "profiles"),
  stories: path.join(uploadDir, "stories"),
  temp: path.join(uploadDir, "temp"),
  deleted: path.join(uploadDir, "deleted"), // For soft-deleted files
}

// Ensure all sub-directories exist
Object.values(directories).forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    logger.info(`Created directory: ${dir}`)
  }
})

/**
 * Generate a secure filename to prevent path traversal and ensure uniqueness
 * @param {string} originalname - Original filename
 * @returns {string} Secure filename
 */
const generateSecureFilename = (originalname) => {
  const timestamp = Date.now()
  const randomString = crypto.randomBytes(8).toString("hex")
  const extension = path.extname(originalname).toLowerCase()
  const sanitizedName = path
    .basename(originalname, extension)
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase()

  return `${timestamp}-${randomString}-${sanitizedName}${extension}`
}

/**
 * Get appropriate upload directory based on file type and route
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @returns {string} Directory path
 */
const getUploadDirectory = (req, file) => {
  const url = req.originalUrl.toLowerCase()

  // If route includes "/photos" but file is an image, use images directory
  if (url.includes("/photos") && file.mimetype.startsWith("image/")) {
    return directories.images
  }

  // For image routes, use images directory
  if (url.includes("/images") || url.includes("/upload/image")) {
    return directories.images
  }

  // Classify by URL first
  if (url.includes("/photos")) {
    return directories.photos
  } else if (url.includes("/messages")) {
    return directories.messages
  } else if (url.includes("/stories")) {
    return directories.stories
  } else if (url.includes("/profiles") || url.includes("/users")) {
    return directories.profiles
  }

  // Then classify by file type if not already categorized
  if (file.mimetype.startsWith("image/")) {
    return directories.images
  } else if (file.mimetype.startsWith("video/")) {
    return directories.videos
  }

  // Default fallback
  return directories.temp
}

// Configure storage with enhanced security and organization
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Always use the images directory for uploaded photos
      const uploadPath = path.join(process.cwd(), "uploads", "images");

      // Ensure the directory exists
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
        logger.info(`Created upload directory: ${uploadPath}`);
      }

      logger.debug(`Setting upload destination: ${uploadPath}`);
      cb(null, uploadPath);
    } catch (error) {
      logger.error(`Error determining upload destination: ${error.message}`);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      // Create a unique filename that includes original extension
      const fileExt = path.extname(file.originalname).toLowerCase();
      const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

      logger.debug(`Generated filename for upload: ${uniqueName}`);
      cb(null, uniqueName);
    } catch (error) {
      logger.error(`Error generating filename: ${error.message}`);
      cb(error);
    }
  },
});

/**
 * Validate file type and contents
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const fileFilter = async (req, file, cb) => {
  // Allowed MIME types
  const allowedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
  const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv", "video/webm"]
  const allowedDocumentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]

  try {
    // Check declared MIME type
    const isDeclaredImage = allowedImageTypes.includes(file.mimetype)
    const isDeclaredVideo = allowedVideoTypes.includes(file.mimetype)
    const isDeclaredDocument = allowedDocumentTypes.includes(file.mimetype)

    if (!isDeclaredImage && !isDeclaredVideo && !isDeclaredDocument) {
      logger.warn(`Rejected file upload with disallowed MIME type: ${file.mimetype}`)
      return cb(new Error("Only images, videos, and documents are allowed"), false)
    }

    // Basic extension check
    const ext = path.extname(file.originalname).toLowerCase()
    const allowedImageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"]
    const allowedVideoExts = [".mp4", ".mov", ".avi", ".wmv", ".webm"]
    const allowedDocumentExts = [".pdf", ".doc", ".docx"]

    const isValidImageExt = allowedImageExts.includes(ext)
    const isValidVideoExt = allowedVideoExts.includes(ext)
    const isValidDocumentExt = allowedDocumentExts.includes(ext)

    if (isDeclaredImage && !isValidImageExt) {
      logger.warn(`Rejected image upload with invalid extension: ${ext}`)
      return cb(new Error("Invalid image file extension"), false)
    }

    if (isDeclaredVideo && !isValidVideoExt) {
      logger.warn(`Rejected video upload with invalid extension: ${ext}`)
      return cb(new Error("Invalid video file extension"), false)
    }

    if (isDeclaredDocument && !isValidDocumentExt) {
      logger.warn(`Rejected document upload with invalid extension: ${ext}`)
      return cb(new Error("Invalid document file extension"), false)
    }

    // Deep validation will be done after upload using file-type
    // This is just a first pass to reject obviously invalid files

    cb(null, true)
  } catch (error) {
    logger.error(`Error in file filter: ${error.message}`)
    cb(new Error("Error validating file"), false)
  }
}

/**
 * Perform deep validation of uploaded file
 * @param {Object} file - Multer file object
 * @returns {Promise<boolean>} True if file is valid
 */
const validateFileContents = async (file) => {
  try {
    if (!file || !file.path) {
      return false
    }

    const buffer = fs.readFileSync(file.path)
    const fileType = await fileTypeFromBuffer(buffer)

    if (!fileType) {
      logger.warn(`Could not determine file type for ${file.originalname}`)
      return false
    }

    const declaredMime = file.mimetype
    const actualMime = fileType.mime

    // Check for MIME type mismatch (excluding edge cases like jpg/jpeg)
    const isJpegEdgeCase =
      (declaredMime === "image/jpg" && actualMime === "image/jpeg") ||
      (declaredMime === "image/jpeg" && actualMime === "image/jpg")

    if (declaredMime !== actualMime && !isJpegEdgeCase) {
      logger.warn(`MIME type mismatch: declared ${declaredMime}, actual ${actualMime}`)
      return false
    }

    return true
  } catch (error) {
    logger.error(`Error validating file contents: ${error.message}`)
    return false
  }
}

/**
 * Move a file to the deleted directory instead of deleting it
 * @param {string} filePath - Path to the file to soft-delete
 * @returns {Promise<boolean>} - Whether the operation was successful
 */
const softDeleteFile = async (filePath) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      logger.warn(`Cannot soft-delete non-existent file: ${filePath}`)
      return false
    }

    // Generate a unique filename for the deleted file
    const filename = path.basename(filePath)
    const timestamp = Date.now()
    const deletedFilename = `${timestamp}-${filename}`
    const deletedFilePath = path.join(directories.deleted, deletedFilename)

    // Move file to deleted directory
    fs.renameSync(filePath, deletedFilePath)
    logger.info(`File soft-deleted: ${filePath} -> ${deletedFilePath}`)

    return true
  } catch (error) {
    logger.error(`Error soft-deleting file: ${error.message}`)
    return false
  }
}

/**
 * Clean up invalid file by moving it to deleted directory
 * @param {Object} file - Multer file object
 */
const cleanupInvalidFile = (file) => {
  if (file && file.path && fs.existsSync(file.path)) {
    try {
      softDeleteFile(file.path)
      logger.debug(`Moved invalid file to deleted directory: ${file.path}`)
    } catch (error) {
      logger.error(`Error cleaning up invalid file: ${error.message}`)
      // Fallback to direct deletion if soft delete fails
      try {
        fs.unlinkSync(file.path)
        logger.debug(`Deleted invalid file: ${file.path}`)
      } catch (unlinkError) {
        logger.error(`Error deleting invalid file: ${unlinkError.message}`)
      }
    }
  }
}

// Initialize upload with enhanced configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE || 10 * 1024 * 1024, // Default 10MB
    files: 1,
  },
  fileFilter: fileFilter,
})

/**
 * Middleware to validate uploaded file after multer processes it
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const validateUpload = async (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const isValid = await validateFileContents(req.file);

  if (!isValid) {
    cleanupInvalidFile(req.file);
    return res.status(400).json({
      success: false,
      error: "The uploaded file appears to be corrupted or is not the type it claims to be.",
    });
  }

  // Set the correct URL for the file
  if (req.file) {
    // Get just the filename without the path
    const fileName = path.basename(req.file.path);

    // Get the subdirectory (like "images", "photos", etc.)
    const subDir = path.basename(path.dirname(req.file.path));

    // Set the URL in the consistent format: /uploads/subdirectory/filename
    req.file.url = `/uploads/${subDir}/${fileName}`;

    logger.debug(`File URL set to: ${req.file.url}`);
  }

  next();
};

// Create a wrapped upload middleware that includes validation
const createUploadMiddleware = (field) => {
  return [upload.single(field), validateUpload]
}

// Export various upload configurations
export const uploadImage = createUploadMiddleware("image")
export const uploadVideo = createUploadMiddleware("video")
export const uploadFile = createUploadMiddleware("file")
export const uploadProfilePicture = createUploadMiddleware("profilePicture")
export const uploadPhoto = createUploadMiddleware("photo")
export const uploadStory = createUploadMiddleware("media")

// Export utility functions
export { softDeleteFile, cleanupInvalidFile, directories }

// Export the base upload for custom configurations
export default upload

// middleware/upload.js - Enhanced with ES modules, improved file validation, and directory organization

import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import config from "../config.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Setup Base Uploads Directory and Subdirectories
// ---------------------------------------------------------------------------

// Define the base uploads directory (using process.cwd() to ensure absolute path)
const uploadDir = path.join(process.cwd(), "uploads");

// Create the base uploads directory if it does not exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logger.info(`Created uploads directory: ${uploadDir}`);
}

// Define subdirectories for different file types
const directories = {
  images: path.join(uploadDir, "images"),
  photos: path.join(uploadDir, "photos"),
  videos: path.join(uploadDir, "videos"),
  messages: path.join(uploadDir, "messages"),
  profiles: path.join(uploadDir, "profiles"),
  stories: path.join(uploadDir, "stories"),
  temp: path.join(uploadDir, "temp"),
  deleted: path.join(uploadDir, "deleted"), // For soft-deleted files
};

// Ensure all required subdirectories exist
Object.values(directories).forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created directory: ${dir}`);
  }
});

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Generate a secure filename to prevent path traversal and ensure uniqueness.
 * @param {string} originalname - The original filename.
 * @returns {string} A secure, unique filename.
 */
const generateSecureFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString("hex");
  const extension = path.extname(originalname).toLowerCase();
  const sanitizedName = path
    .basename(originalname, extension)
    .replace(/[^a-z0-9]/gi, "-")
    .toLowerCase();
  return `${timestamp}-${randomString}-${sanitizedName}${extension}`;
};

/**
 * Determine the appropriate upload directory based on the request URL and file type.
 * This helps align files in proper subdirectories.
 * @param {Object} req - Express request object.
 * @param {Object} file - Multer file object.
 * @returns {string} The directory path for the upload.
 */
const getUploadDirectory = (req, file) => {
  const url = req.originalUrl.toLowerCase();

  // Prioritize URL-based classification
  if (url.includes("/photos") && file.mimetype.startsWith("image/")) {
    return directories.photos;
  }
  if (url.includes("/images") || url.includes("/upload/image")) {
    return directories.images;
  }
  if (url.includes("/messages")) {
    return directories.messages;
  }
  if (url.includes("/stories")) {
    return directories.stories;
  }
  if (url.includes("/profiles") || url.includes("/users")) {
    return directories.profiles;
  }

  // Then classify by MIME type if not already determined by URL
  if (file.mimetype.startsWith("image/")) {
    return directories.images;
  }
  if (file.mimetype.startsWith("video/")) {
    return directories.videos;
  }
  // Default fallback directory
  return directories.temp;
};

/**
 * Validate file type and extension (basic first-pass validation).
 * @param {Object} req - Express request object.
 * @param {Object} file - Multer file object.
 * @param {Function} cb - Callback function (cb(error, boolean)).
 */
const fileFilter = async (req, file, cb) => {
  // Allowed MIME types for images, videos, and documents
  const allowedImageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  const allowedVideoTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-ms-wmv", "video/webm"];
  const allowedDocumentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  try {
    const isDeclaredImage = allowedImageTypes.includes(file.mimetype);
    const isDeclaredVideo = allowedVideoTypes.includes(file.mimetype);
    const isDeclaredDocument = allowedDocumentTypes.includes(file.mimetype);

    if (!isDeclaredImage && !isDeclaredVideo && !isDeclaredDocument) {
      logger.warn(`Rejected file upload with disallowed MIME type: ${file.mimetype}`);
      return cb(new Error("Only images, videos, and documents are allowed"), false);
    }

    // Check file extension
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedImageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
    const allowedVideoExts = [".mp4", ".mov", ".avi", ".wmv", ".webm"];
    const allowedDocumentExts = [".pdf", ".doc", ".docx"];

    const isValidImageExt = allowedImageExts.includes(ext);
    const isValidVideoExt = allowedVideoExts.includes(ext);
    const isValidDocumentExt = allowedDocumentExts.includes(ext);

    if (isDeclaredImage && !isValidImageExt) {
      logger.warn(`Rejected image upload with invalid extension: ${ext}`);
      return cb(new Error("Invalid image file extension"), false);
    }
    if (isDeclaredVideo && !isValidVideoExt) {
      logger.warn(`Rejected video upload with invalid extension: ${ext}`);
      return cb(new Error("Invalid video file extension"), false);
    }
    if (isDeclaredDocument && !isValidDocumentExt) {
      logger.warn(`Rejected document upload with invalid extension: ${ext}`);
      return cb(new Error("Invalid document file extension"), false);
    }

    // Pass initial validation; deep validation is handled later.
    cb(null, true);
  } catch (error) {
    logger.error(`Error in file filter: ${error.message}`);
    cb(new Error("Error validating file"), false);
  }
};

/**
 * Deeply validate the contents of an uploaded file.
 * Reads the file buffer and checks its MIME type using the file-type package.
 * @param {Object} file - Multer file object.
 * @returns {Promise<boolean>} True if file contents are valid; otherwise, false.
 */
const validateFileContents = async (file) => {
  try {
    if (!file || !file.path) {
      return false;
    }
    const buffer = fs.readFileSync(file.path);
    const fileType = await fileTypeFromBuffer(buffer);
    if (!fileType) {
      logger.warn(`Could not determine file type for ${file.originalname}`);
      return false;
    }
    const declaredMime = file.mimetype;
    const actualMime = fileType.mime;
    const isJpegEdgeCase =
      (declaredMime === "image/jpg" && actualMime === "image/jpeg") ||
      (declaredMime === "image/jpeg" && actualMime === "image/jpg");
    if (declaredMime !== actualMime && !isJpegEdgeCase) {
      logger.warn(`MIME type mismatch: declared ${declaredMime}, actual ${actualMime}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.error(`Error validating file contents: ${error.message}`);
    return false;
  }
};

/**
 * Soft-delete a file by moving it to the "deleted" directory.
 * This supports soft deletion for files that are no longer valid.
 * @param {string} filePath - The absolute path of the file to soft-delete.
 * @returns {Promise<boolean>} True if the file was successfully moved.
 */
const softDeleteFile = async (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Cannot soft-delete non-existent file: ${filePath}`);
      return false;
    }
    const filename = path.basename(filePath);
    const timestamp = Date.now();
    const deletedFilename = `${timestamp}-${filename}`;
    const deletedFilePath = path.join(directories.deleted, deletedFilename);
    fs.renameSync(filePath, deletedFilePath);
    logger.info(`File soft-deleted: ${filePath} -> ${deletedFilePath}`);
    return true;
  } catch (error) {
    logger.error(`Error soft-deleting file: ${error.message}`);
    return false;
  }
};

/**
 * Clean up an invalid file by attempting to soft-delete it first,
 * falling back to direct deletion if necessary.
 * @param {Object} file - Multer file object.
 */
const cleanupInvalidFile = (file) => {
  if (file && file.path && fs.existsSync(file.path)) {
    try {
      softDeleteFile(file.path);
      logger.debug(`Moved invalid file to deleted directory: ${file.path}`);
    } catch (error) {
      logger.error(`Error cleaning up invalid file: ${error.message}`);
      try {
        fs.unlinkSync(file.path);
        logger.debug(`Deleted invalid file: ${file.path}`);
      } catch (unlinkError) {
        logger.error(`Error deleting invalid file: ${unlinkError.message}`);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Multer Configuration
// ---------------------------------------------------------------------------

/**
 * Configure multer storage using our getUploadDirectory helper for destination,
 * and generate a secure filename for each uploaded file.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      // Use getUploadDirectory to align files in the correct subdirectory
      const uploadPath = getUploadDirectory(req, file);
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
      // Use our secure filename generator
      const filename = generateSecureFilename(file.originalname);
      logger.debug(`Generated filename for upload: ${filename}`);
      cb(null, filename);
    } catch (error) {
      logger.error(`Error generating filename: ${error.message}`);
      cb(error);
    }
  },
});

/**
 * Create a multer instance with configured storage, limits, and file filter.
 */
const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE || 10 * 1024 * 1024, // Default to 10MB if not specified
    files: 1,
  },
  fileFilter: fileFilter,
});

// ---------------------------------------------------------------------------
// Post-Upload Validation Middleware
// ---------------------------------------------------------------------------

/**
 * Middleware to validate the uploaded file after multer processes it.
 * Performs deep validation of file contents and, if valid, sets a URL for client use.
 * If invalid, cleans up the file and sends an error response.
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next function.
 */
const validateUpload = async (req, res, next) => {
  if (!req.file) return next();

  const isValid = await validateFileContents(req.file);
  if (!isValid) {
    cleanupInvalidFile(req.file);
    return res.status(400).json({
      success: false,
      error: "The uploaded file appears to be corrupted or is not the type it claims to be.",
    });
  }

  // Build a URL for the uploaded file using the appropriate subdirectory
  if (req.file) {
    const fileName = path.basename(req.file.path);
    const subDir = path.basename(path.dirname(req.file.path));
    req.file.url = `/uploads/${subDir}/${fileName}`;
    logger.debug(`File URL set to: ${req.file.url}`);
  }
  next();
};

/**
 * Factory function to create an upload middleware for a given field.
 * Returns an array of middlewares: multer upload and file validation.
 * @param {string} field - The field name to handle.
 * @returns {Array} Array of middlewares.
 */
const createUploadMiddleware = (field) => {
  return [upload.single(field), validateUpload];
};

// ---------------------------------------------------------------------------
// Export Specialized Upload Middlewares and Utilities
// ---------------------------------------------------------------------------
export const uploadImage = createUploadMiddleware("image");
export const uploadVideo = createUploadMiddleware("video");
export const uploadFile = createUploadMiddleware("file");
export const uploadProfilePicture = createUploadMiddleware("profilePicture");
export const uploadPhoto = createUploadMiddleware("photo");
export const uploadStory = createUploadMiddleware("media");

// Export utility functions and directories for external use
export { softDeleteFile, cleanupInvalidFile, directories };

// Export the base multer instance for custom configurations if needed
export default upload;

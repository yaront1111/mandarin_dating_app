import express from "express"
import multer from "multer"
import path from "path"
import fs from "fs"
import sharp from "sharp"
import { fileTypeFromBuffer } from "file-type"
import mongoose from "mongoose"
import { User, PhotoPermission, Message, Like } from "../models/index.js"
import config from "../config.js"
import { protect, enhancedProtect, asyncHandler } from "../middleware/auth.js"
import logger from "../logger.js"
import { canLikeUser } from "../middleware/permissions.js"

const router = express.Router()

// ==========================
// Multer configuration
// ==========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(config.FILE_UPLOAD_PATH, "images")
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true })
    }
    cb(null, uploadPath)
  },
  filename: (req, file, cb) => {
    const fileExt = path.extname(file.originalname).toLowerCase()
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`
    cb(null, uniqueName)
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE, // e.g., 5MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"]
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif"]
    const isValidMime = allowedMimeTypes.includes(file.mimetype)
    const ext = path.extname(file.originalname).toLowerCase()
    const isValidExt = allowedExtensions.includes(ext)
    if (isValidMime && isValidExt) {
      return cb(null, true)
    }
    cb(new Error("Only image files (jpg, jpeg, png, gif) are allowed"))
  },
})

// ==========================
// Helper functions
// ==========================
/**
 * Safely converts any value to a string suitable for MongoDB queries.
 */
const safeId = (id) => {
  if (!id) return null
  return typeof id === "object" && id.toString ? id.toString() : String(id)
}

/**
 * Middleware to patch the user object so that IDs are strings.
 */
const flexibleIdMiddleware = (req, res, next) => {
  req._originalUser = req.user
  if (req.user) {
    req.user = {
      ...req.user,
      _id: safeId(req.user._id),
      id: safeId(req.user.id || req.user._id),
    }
  }
  next()
}

// ==========================
// Routes
// ==========================

/**
 * @route   GET /api/users/likes
 * @desc    Get all users liked by the current user
 * @access  Private
 */
router.get(
  "/likes",
  protect,
  asyncHandler(async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1
      const limit = Number.parseInt(req.query.limit, 10) || 50
      const skip = (page - 1) * limit

      // Extract user ID with fallbacks
      let userId
      if (req.user) {
        if (req.user._id) {
          userId = req.user._id
          if (typeof userId === "object") {
            userId = userId.toString()
          }
        } else if (req.user.id) {
          userId = req.user.id
        }
      }
      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "User ID not found in request",
        })
      }

      const db = mongoose.connection
      const likesCollection = db.collection("likes")

      const likesQuery = [
        { $match: { sender: userId } },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]
      const totalQuery = [{ $match: { sender: userId } }, { $count: "total" }]

      const [likesResult, totalResult] = await Promise.all([
        likesCollection.aggregate(likesQuery).toArray(),
        likesCollection.aggregate(totalQuery).toArray(),
      ])

      const total = totalResult.length > 0 ? totalResult[0].total : 0

      if (likesResult.length > 0) {
        const recipientIds = likesResult.map((like) => like.recipient)
        const usersCollection = db.collection("users")
        const users = await usersCollection
          .find(
            { _id: { $in: recipientIds } },
            { projection: { nickname: 1, username: 1, photos: 1, isOnline: 1, lastActive: 1 } },
          )
          .toArray()

        const userMap = {}
        users.forEach((user) => {
          userMap[user._id.toString()] = user
        })

        for (const like of likesResult) {
          const recipientId = like.recipient.toString()
          if (userMap[recipientId]) {
            like.recipient = userMap[recipientId]
          }
        }
      }

      res.status(200).json({
        success: true,
        count: likesResult.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: likesResult,
      })
    } catch (err) {
      logger.error(`Error fetching likes: ${err.message}`)
      res.status(500).json({
        success: false,
        error: "Server error while fetching likes",
      })
    }
  }),
)

/**
 * @route   GET /api/users
 * @desc    Get all online users (with filters) except current user
 * @access  Private
 */
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    logger.debug(`Fetching online users for user ${req.user._id}`)
    try {
      const page = Number.parseInt(req.query.page, 10) || 1
      const limit = Number.parseInt(req.query.limit, 10) || 20
      const skip = (page - 1) * limit
      const query = { _id: { $ne: req.user._id } }

      if (req.query.online === "true") {
        query.isOnline = true
      }
      if (req.query.gender) {
        query["details.gender"] = req.query.gender
      }
      if (req.query.minAge) {
        query["details.age"] = {
          ...(query["details.age"] || {}),
          $gte: Number.parseInt(req.query.minAge, 10),
        }
      }
      if (req.query.maxAge) {
        query["details.age"] = {
          ...(query["details.age"] || {}),
          $lte: Number.parseInt(req.query.maxAge, 10),
        }
      }
      if (req.query.location) {
        query["details.location"] = { $regex: req.query.location, $options: "i" }
      }
      if (req.query.interest) {
        query["details.interests"] = { $in: [req.query.interest] }
      }

      const users = await User.find(query)
        .select("nickname details photos isOnline lastActive")
        .sort({ isOnline: -1, lastActive: -1 })
        .skip(skip)
        .limit(limit)

      const total = await User.countDocuments(query)

      logger.debug(`Found ${users.length} users matching filters`)
      res.status(200).json({
        success: true,
        count: users.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: users,
      })
    } catch (err) {
      logger.error(`Error fetching users: ${err.message}`)
      res.status(400).json({ success: false, error: err.message })
    }
  }),
)

/**
 * @route   GET /api/users/:id
 * @desc    Get a single user profile and message history with that user
 * @access  Private
 */
router.get(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    logger.debug(`Fetching user profile for ${req.params.id}`)
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, error: "Invalid user ID format" })
      }

      const user = await User.findById(req.params.id).select("nickname details photos isOnline lastActive createdAt")
      if (!user) {
        logger.warn(`User not found: ${req.params.id}`)
        return res.status(404).json({ success: false, error: "User not found" })
      }

      const page = Number.parseInt(req.query.page, 10) || 1
      const limit = Number.parseInt(req.query.limit, 10) || 50
      const skip = (page - 1) * limit

      const messages = await Message.find({
        $or: [
          { sender: req.user._id, recipient: req.params.id },
          { sender: req.params.id, recipient: req.user._id },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)

      const totalMessages = await Message.countDocuments({
        $or: [
          { sender: req.user._id, recipient: req.params.id },
          { sender: req.params.id, recipient: req.user._id },
        ],
      })

      const isLiked = await Like.exists({
        sender: req.user._id,
        recipient: req.params.id,
      })
      const isMutualLike = await Like.exists({
        sender: req.params.id,
        recipient: req.user._id,
      })

      logger.debug(`Returning user profile with ${messages.length} messages`)
      res.status(200).json({
        success: true,
        data: {
          user,
          messages,
          messagesPagination: {
            total: totalMessages,
            page,
            pages: Math.ceil(totalMessages / limit),
          },
          isLiked: !!isLiked,
          isMutualLike: !!isMutualLike,
        },
      })
    } catch (err) {
      logger.error(`Error fetching user: ${err.message}`)
      res.status(400).json({ success: false, error: err.message })
    }
  }),
)

/**
 * @route   GET /api/users/:id/photo-permissions
 * @desc    Get photo permission statuses for a user with improved error handling
 * @access  Private
 */
router.get(
  "/:id/photo-permissions",
  enhancedProtect, // Use enhancedProtect instead of protect
  asyncHandler(async (req, res) => {
    logger.debug(`Fetching photo permissions for user ${req.params.id} requested by ${req.user._id}`)

    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({
          success: false,
          error: "Invalid user ID format",
        })
      }

      const user = await User.findById(req.params.id).select("photos")
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        })
      }

      // Get all private photo IDs
      const privatePhotoIds = user.photos.filter((photo) => photo.isPrivate).map((photo) => photo._id)

      if (privatePhotoIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
        })
      }

      // Find all permission requests for these photos by the current user
      const permissions = await PhotoPermission.find({
        photo: { $in: privatePhotoIds },
        requestedBy: req.user._id,
      })

      // Format the permissions for the client
      const formattedPermissions = permissions.map((permission) => ({
        photo: permission.photo,
        status: permission.status,
        createdAt: permission.createdAt,
        updatedAt: permission.updatedAt,
        respondedAt: permission.respondedAt,
        expiresAt: permission.expiresAt,
      }))

      logger.debug(`Found ${formattedPermissions.length} permission records for user ${req.user._id}`)

      res.status(200).json({
        success: true,
        data: formattedPermissions,
      })
    } catch (err) {
      logger.error(`Error fetching photo permissions: ${err.message}`)
      res.status(500).json({
        success: false,
        error: "Server error while fetching photo permissions",
      })
    }
  }),
)

/**
 * @route   PUT /api/users/profile
 * @desc    Update current user's profile
 * @access  Private
 */
router.put(
  "/profile",
  protect,
  asyncHandler(async (req, res) => {
    logger.debug(`Updating profile for user ${req.user._id}`)
    try {
      const { nickname, details } = req.body
      if (nickname && nickname.trim().length < 3) {
        return res.status(400).json({ success: false, error: "Nickname must be at least 3 characters" })
      }
      if (details && details.age && (details.age < 18 || details.age > 120)) {
        return res.status(400).json({ success: false, error: "Age must be between 18 and 120" })
      }
      const updateData = {}
      if (nickname) updateData.nickname = nickname.trim()
      if (details) {
        updateData.details = { ...req.user.details }
        if (details.age !== undefined) {
          updateData.details.age = Number.parseInt(details.age, 10)
        }
        if (details.gender !== undefined) {
          updateData.details.gender = details.gender
        }
        if (details.location !== undefined) {
          updateData.details.location = details.location.trim()
        }
        if (details.bio !== undefined) {
          if (details.bio.length > 500) {
            return res.status(400).json({ success: false, error: "Bio cannot exceed 500 characters" })
          }
          updateData.details.bio = details.bio.trim()
        }
        if (details.interests !== undefined) {
          if (typeof details.interests === "string") {
            updateData.details.interests = details.interests
              .split(",")
              .map((i) => i.trim())
              .filter(Boolean)
          } else if (Array.isArray(details.interests)) {
            if (details.interests.length > 10) {
              return res.status(400).json({ success: false, error: "Cannot have more than 10 interests" })
            }
            updateData.details.interests = details.interests
          }
        }

        // Handle new fields
        if (details.iAm !== undefined) {
          updateData.details.iAm = details.iAm
        }

        if (details.lookingFor !== undefined) {
          if (Array.isArray(details.lookingFor)) {
            if (details.lookingFor.length > 3) {
              return res.status(400).json({ success: false, error: "Cannot have more than 3 'looking for' options" })
            }
            updateData.details.lookingFor = details.lookingFor
          }
        }

        if (details.intoTags !== undefined) {
          if (Array.isArray(details.intoTags)) {
            if (details.intoTags.length > 20) {
              return res.status(400).json({ success: false, error: "Cannot have more than 20 'into' tags" })
            }
            updateData.details.intoTags = details.intoTags
          }
        }

        if (details.turnOns !== undefined) {
          if (Array.isArray(details.turnOns)) {
            if (details.turnOns.length > 20) {
              return res.status(400).json({ success: false, error: "Cannot have more than 20 'turn ons' tags" })
            }
            updateData.details.turnOns = details.turnOns
          }
        }

        if (details.maritalStatus !== undefined) {
          updateData.details.maritalStatus = details.maritalStatus
        }
      }

      logger.debug(`Updating user with data: ${JSON.stringify(updateData)}`)

      const updatedUser = await User.findByIdAndUpdate(req.user._id, updateData, {
        new: true,
        runValidators: true,
      })
      logger.info(`Profile updated for user ${req.user._id}`)
      res.status(200).json({ success: true, data: updatedUser })
    } catch (err) {
      logger.error(`Error updating profile: ${err.message}`)
      if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0]
        return res
          .status(400)
          .json({ success: false, error: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists` })
      }
      res.status(400).json({ success: false, error: err.message })
    }
  }),
)
// Replace the corresponding section in your userRoutes.js file

/**
 * @route   POST /api/users/photos
 * @desc    Upload photo for current user with enhanced security and processing
 * @access  Private
 */
router.post(
  "/photos",
  protect,
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    logger.debug(`Processing photo upload for user ${req.user._id}`)
    let filePath = null
    let processingSuccessful = false

    try {
      if (!req.file) {
        logger.warn("Photo upload failed: No file provided")
        return res.status(400).json({ success: false, error: "Please upload a file" })
      }

      const isPrivate = req.body.isPrivate === "true" || req.body.isPrivate === true

      // Check photo count limit
      if (req.user.photos && req.user.photos.length >= 10) {
        fs.unlinkSync(req.file.path)
        return res.status(400).json({
          success: false,
          error: "Maximum number of photos (10) reached. Delete some photos to upload more.",
        })
      }

      filePath = req.file.path
      logger.debug(`File saved to: ${filePath}`)

      const fileBuffer = fs.readFileSync(filePath)
      const fileType = await fileTypeFromBuffer(fileBuffer)

      if (!fileType || !fileType.mime.startsWith("image/")) {
        fs.unlinkSync(filePath)
        return res.status(400).json({ success: false, error: "File is not a valid image" })
      }

      try {
        const image = sharp(filePath)
        const metadata = await image.metadata()

        // Resize image if needed
        const resizedFilePath = filePath + "_resized"
        if (metadata.width > 1200 || metadata.height > 1200) {
          await image
            .resize(1200, 1200, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .toFile(resizedFilePath)

          fs.unlinkSync(filePath)
          fs.renameSync(resizedFilePath, filePath)
          logger.debug(`Image resized and saved back to: ${filePath}`)
        }

        processingSuccessful = true

        // Get the file name only (not the full path)
        const fileName = path.basename(filePath)

        // This is critical: create the correct URL format
        // It should be a web-accessible path that maps to your static file middleware
        const photoUrl = `/uploads/images/${fileName}`

        logger.debug(`Generated photo URL: ${photoUrl}`)

        const photoMetadata = {
          contentType: metadata.format,
          size: metadata.size,
          dimensions: { width: metadata.width, height: metadata.height },
        }

        const photo = {
          url: photoUrl,
          isPrivate,
          metadata: photoMetadata,
        }

        const isFirstPhoto = !req.user.photos || req.user.photos.length === 0
        req.user.photos.push(photo)
        await req.user.save()

        const newPhoto = req.user.photos[req.user.photos.length - 1]

        logger.info(`Photo uploaded successfully for user ${req.user._id} (isPrivate: ${isPrivate})`)
        logger.debug(
          `Photo details: ${JSON.stringify({
            id: newPhoto._id,
            url: newPhoto.url,
            isPrivate: newPhoto.isPrivate,
          })}`,
        )

        res.status(200).json({
          success: true,
          data: newPhoto,
          isProfilePhoto: isFirstPhoto,
          url: photoUrl, // Include the URL explicitly for clarity
        })
      } catch (processingErr) {
        logger.error(`Error processing image: ${processingErr.message}`)
        throw processingErr
      }
    } catch (err) {
      logger.error(`Error uploading photo: ${err.message}`)
      res.status(400).json({ success: false, error: err.message })
    } finally {
      if (!processingSuccessful && filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath)
          logger.debug(`Cleaned up failed upload file: ${filePath}`)
        } catch (cleanupErr) {
          logger.error(`Error during file cleanup: ${cleanupErr.message}`)
        }
      }
    }
  }),
)
/**
 * @route   PUT /api/users/photos/:id/privacy
 * @desc    Update photo privacy setting
 * @access  Private
 */
router.put(
  "/photos/:id/privacy",
  protect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id
    const { isPrivate } = req.body
    logger.debug(`Updating privacy for photo ${photoId} to ${isPrivate}`)
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({ success: false, error: "Invalid photo ID format" })
    }
    if (typeof isPrivate !== "boolean") {
      return res.status(400).json({ success: false, error: "isPrivate must be a boolean value" })
    }
    const user = await User.findOne({ _id: req.user._id, "photos._id": photoId })
    if (!user) {
      logger.warn(`Photo ${photoId} not found or not owned by user ${req.user._id}`)
      return res.status(404).json({ success: false, error: "Photo not found or not owned by you" })
    }
    const photoIndex = user.photos.findIndex((p) => p._id.toString() === photoId)
    user.photos[photoIndex].isPrivate = isPrivate
    await user.save()
    logger.info(`Photo ${photoId} privacy updated to ${isPrivate}`)
    res.status(200).json({ success: true, data: user.photos[photoIndex] })
  }),
)

/**
 * @route   PUT /api/users/photos/:id/profile
 * @desc    Set photo as profile photo
 * @access  Private
 */
router.put(
  "/photos/:id/profile",
  protect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id
    logger.debug(`Setting photo ${photoId} as profile photo for user ${req.user._id}`)
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({ success: false, error: "Invalid photo ID format" })
    }
    const user = await User.findOne({ _id: req.user._id, "photos._id": photoId })
    if (!user) {
      logger.warn(`Photo ${photoId} not found or not owned by user ${req.user._id}`)
      return res.status(404).json({ success: false, error: "Photo not found or not owned by you" })
    }
    const photoIndex = user.photos.findIndex((p) => p._id.toString() === photoId)
    const photo = user.photos.splice(photoIndex, 1)[0]
    user.photos.unshift(photo)
    await user.save()
    logger.info(`Photo ${photoId} set as profile photo for user ${req.user._id}`)
    res.status(200).json({ success: true, data: user.photos })
  }),
)

/**
 * @route   DELETE /api/users/photos/:id
 * @desc    Delete a photo (soft delete by moving to deleted folder)
 * @access  Private
 */
router.delete(
  "/photos/:id",
  protect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id
    logger.debug(`Soft-deleting photo ${photoId} for user ${req.user._id}`)

    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({ success: false, error: "Invalid photo ID format" })
    }

    const user = await User.findOne({ _id: req.user._id, "photos._id": photoId })
    if (!user) {
      logger.warn(`Photo ${photoId} not found or not owned by user ${req.user._id}`)
      return res.status(404).json({ success: false, error: "Photo not found or not owned by you" })
    }

    if (user.photos.length === 1) {
      return res.status(400).json({ success: false, error: "Cannot delete your only photo" })
    }

    if (user.photos[0]._id.toString() === photoId) {
      return res
        .status(400)
        .json({ success: false, error: "Cannot delete your profile photo. Set another photo as profile first." })
    }

    const photoIndex = user.photos.findIndex((p) => p._id.toString() === photoId)
    const photo = user.photos[photoIndex]
    const filename = photo.url.split("/").pop()

    // Remove photo from user's photos array
    user.photos.splice(photoIndex, 1)
    await user.save()

    // Import the soft delete function from upload middleware
    const { softDeleteFile } = await import("../middleware/upload.js")

    // Get the full file path
    const filePath = path.join(config.FILE_UPLOAD_PATH, "photos", filename)

    // Soft delete the file (move to deleted folder)
    if (fs.existsSync(filePath)) {
      const result = await softDeleteFile(filePath)
      if (result) {
        logger.info(`Photo ${photoId} soft-deleted for user ${req.user._id}`)
      } else {
        logger.warn(`Could not soft-delete photo file at ${filePath}`)
      }
    } else {
      logger.warn(`Photo file not found at ${filePath}`)
    }

    res.status(200).json({
      success: true,
      message: "Photo deleted successfully",
      data: {
        photoId,
        wasDeleted: true,
      },
    })
  }),
)

/**
 * @route   POST /api/users/photos/:id/request
 * @desc    Request permission to view a private photo (with improved error handling)
 * @access  Private
 */
router.post(
  "/photos/:id/request",
  enhancedProtect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id
    const { userId } = req.body

    logger.debug(`User ${req.user._id} requesting access to photo ${photoId} from user ${userId}`)

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(photoId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid photo ID or user ID format",
      })
    }

    // Find the photo owner
    const owner = await User.findById(userId)
    if (!owner) {
      logger.warn(`Photo access request failed: User ${userId} not found`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Find the specific photo
    const photo = owner.photos.id(photoId)
    if (!photo) {
      logger.warn(`Photo access request failed: Photo ${photoId} not found`)
      return res.status(404).json({
        success: false,
        error: "Photo not found",
      })
    }

    // Check if the photo is private
    if (!photo.isPrivate) {
      logger.warn(`Photo access request failed: Photo ${photoId} is not private`)
      return res.status(400).json({
        success: false,
        error: "Photo is not private",
      })
    }

    // Check if the user is requesting access to their own photo
    if (owner._id.toString() === req.user._id.toString()) {
      logger.warn(`Photo access request failed: User ${req.user._id} trying to request access to their own photo`)
      return res.status(400).json({
        success: false,
        error: "You cannot request access to your own photo",
      })
    }

    try {
      // Check for existing permission request
      let permission = await PhotoPermission.findOne({
        photo: photoId,
        requestedBy: req.user._id,
      })

      if (permission) {
        // If request already exists, return success with a message
        logger.info(`Permission request already exists: ${permission._id}`)
        return res.status(200).json({
          success: true,
          data: permission,
          message: "Permission request already exists",
        })
      }

      // Create new permission request
      permission = new PhotoPermission({
        photo: photoId,
        requestedBy: req.user._id,
        status: "pending",
      })

      await permission.save()

      // Send notification via socket if available
      try {
        const io = req.app.get("io")
        const { sendPhotoPermissionRequestNotification } = await import("../socket/socketHandlers.js")

        if (io && sendPhotoPermissionRequestNotification) {
          const requester = await User.findById(req.user._id).select("nickname photos")

          await sendPhotoPermissionRequestNotification(io, requester, owner, permission)
          logger.info(`Photo permission request notification sent to user ${owner._id}`)
        }
      } catch (notificationError) {
        logger.error(`Error sending photo permission request notification: ${notificationError.message}`)
      }

      logger.info(`Photo access request created: ${permission._id}`)
      res.status(201).json({
        success: true,
        data: permission,
      })
    } catch (error) {
      logger.error(`Error creating permission request: ${error.message}`)

      // Handle duplicate key error
      if (error.code === 11000) {
        // Find the existing permission and return it
        const existingPermission = await PhotoPermission.findOne({
          photo: photoId,
          requestedBy: req.user._id,
        })

        return res.status(200).json({
          success: true,
          data: existingPermission,
          message: "Permission request already exists",
        })
      }

      res.status(500).json({
        success: false,
        error: error.message || "Server error while creating permission request",
      })
    }
  }),
)

/**
 * @route   GET /api/users/photos/permissions
 * @desc    Get all photo permission requests for the current user
 * @access  Private
 */
router.get(
  "/photos/permissions",
  protect,
  asyncHandler(async (req, res) => {
    logger.debug(`Fetching photo permissions for user ${req.user._id}`)
    try {
      const photoIds = req.user.photos.map((photo) => photo._id)
      const page = Number.parseInt(req.query.page, 10) || 1
      const limit = Number.parseInt(req.query.limit, 10) || 20
      const skip = (page - 1) * limit
      const query = { photo: { $in: photoIds } }
      if (req.query.status && ["pending", "approved", "rejected"].includes(req.query.status)) {
        query.status = req.query.status
      }
      const permissions = await PhotoPermission.find(query)
        .populate("requestedBy", "nickname photos")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
      const total = await PhotoPermission.countDocuments(query)
      logger.debug(`Found ${permissions.length} permission requests`)
      res.status(200).json({
        success: true,
        count: permissions.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: permissions,
      })
    } catch (err) {
      logger.error(`Error fetching photo permissions: ${err.message}`)
      res.status(400).json({ success: false, error: err.message })
    }
  }),
)

/**
 * @route   PUT /api/photos/permissions/:id
 * @desc    Approve or reject a photo permission request
 * @access  Private
 */
router.put(
  "/photos/permissions/:id",
  protect,
  asyncHandler(async (req, res) => {
    const permissionId = req.params.id
    const { status } = req.body
    logger.debug(`Updating photo permission ${permissionId} to ${status}`)
    if (!mongoose.Types.ObjectId.isValid(permissionId)) {
      return res.status(400).json({ success: false, error: "Invalid permission ID format" })
    }
    if (!["approved", "rejected"].includes(status)) {
      logger.warn(`Invalid permission status: ${status}`)
      return res.status(400).json({ success: false, error: 'Status must be either "approved" or "rejected"' })
    }
    const permission = await PhotoPermission.findById(permissionId)
    if (!permission) {
      logger.warn(`Permission ${permissionId} not found`)
      return res.status(404).json({ success: false, error: "Permission request not found" })
    }
    const owner = await User.findOne({ _id: req.user._id, "photos._id": permission.photo })
    if (!owner) {
      logger.warn(`User ${req.user._id} not authorized to update permission ${permissionId}`)
      return res.status(401).json({ success: false, error: "Not authorized to update this permission" })
    }
    permission.status = status
    await permission.save()

    // Send notification via socket if available
    try {
      const io = req.app.get("io")
      const { sendPhotoPermissionResponseNotification } = await import("../socket/socketHandlers.js")

      if (io && sendPhotoPermissionResponseNotification) {
        const requester = await User.findById(permission.requestedBy)

        await sendPhotoPermissionResponseNotification(io, owner, requester, permission)
        logger.info(`Photo permission response notification sent to user ${requester._id}`)
      }
    } catch (notificationError) {
      logger.error(`Error sending photo permission response notification: ${notificationError.message}`)
    }

    logger.info(`Permission ${permissionId} updated to ${status}`)
    res.status(200).json({ success: true, data: permission })
  }),
)

/**
 * @route   GET /api/users/search
 * @desc    Search users with advanced filtering
 * @access  Private
 */
router.get(
  "/search",
  protect,
  asyncHandler(async (req, res) => {
    logger.debug(`Searching users with filters`)
    try {
      const page = Number.parseInt(req.query.page, 10) || 1
      const limit = Number.parseInt(req.query.limit, 10) || 20
      const skip = (page - 1) * limit
      const query = { _id: { $ne: req.user._id } }
      if (req.query.nickname) {
        query.nickname = { $regex: req.query.nickname, $options: "i" }
      }
      if (req.query.gender) {
        query["details.gender"] = req.query.gender
      }
      if (req.query.minAge) {
        query["details.age"] = {
          ...(query["details.age"] || {}),
          $gte: Number.parseInt(req.query.minAge, 10),
        }
      }
      if (req.query.maxAge) {
        query["details.age"] = {
          ...(query["details.age"] || {}),
          $lte: Number.parseInt(req.query.maxAge, 10),
        }
      }
      if (req.query.location) {
        query["details.location"] = { $regex: req.query.location, $options: "i" }
      }
      if (req.query.interests) {
        const interests = req.query.interests.split(",")
        query["details.interests"] = { $in: interests }
      }
      if (req.query.online === "true") {
        query.isOnline = true
      }
      const users = await User.find(query)
        .select("nickname details photos isOnline lastActive")
        .sort({ isOnline: -1, lastActive: -1 })
        .skip(skip)
        .limit(limit)
      const total = await User.countDocuments(query)
      logger.debug(`Found ${users.length} users matching search criteria`)
      res.status(200).json({
        success: true,
        count: users.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: users,
      })
    } catch (err) {
      logger.error(`Error searching users: ${err.message}`)
      res.status(400).json({ success: false, error: err.message })
    }
  }),
)

/**
 * @route   GET /api/users/matches
 * @desc    Get all mutual likes (matches) for the current user
 * @access  Private
 */
router.get(
  "/matches",
  protect,
  asyncHandler(async (req, res) => {
    logger.debug(`Fetching matches for user ${req.user._id}`)
    try {
      const page = Number.parseInt(req.query.page, 10) || 1
      const limit = Number.parseInt(req.query.limit, 10) || 20
      const skip = (page - 1) * limit
      const likedUsers = await Like.find({ sender: req.user._id }).select("recipient")
      const likedUserIds = likedUsers.map((like) => like.recipient)
      const matches = await Like.find({
        sender: { $in: likedUserIds },
        recipient: req.user._id,
      })
        .populate("sender", "nickname photos isOnline lastActive details")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
      const total = await Like.countDocuments({
        sender: { $in: likedUserIds },
        recipient: req.user._id,
      })
      logger.debug(`Found ${matches.length} matches`)
      res.status(200).json({
        success: true,
        count: matches.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: matches,
      })
    } catch (err) {
      logger.error(`Error fetching matches: ${err.message}`)
      res.status(400).json({ success: false, error: err.message })
    }
  }),
)

// Update the like route to send notifications
router.post(
  "/:id/like",
  protect,
  canLikeUser,
  asyncHandler(async (req, res) => {
    logger.debug(`User ${req.user._id} liking user ${req.params.id}`)
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, error: "Invalid user ID format" })
      }
      const targetUser = await User.findById(req.params.id)
      if (!targetUser) {
        return res.status(404).json({ success: false, error: "User not found" })
      }
      const user = req.userObj
      const existingLike = await Like.findOne({
        sender: req.user._id,
        recipient: req.params.id,
      })
      if (existingLike) {
        return res.status(400).json({
          success: false,
        })
      }
      const like = new Like({
        sender: req.user._id,
        recipient: req.params.id,
      })
      await like.save()
      if (user.accountTier === "FREE") {
        user.dailyLikesRemaining -= 1
        await user.save()
      }
      const mutualLike = await Like.findOne({
        sender: req.params.id,
        recipient: req.user._id,
      })

      // Send notification via socket if available
      try {
        const io = req.app.get("io")
        const { sendLikeNotification } = await import("../socket/socketHandlers.js")

        if (io && sendLikeNotification) {
          const senderUser = await User.findById(req.user._id).select("nickname photos")

          await sendLikeNotification(io, senderUser, targetUser, {
            _id: like._id,
            isMatch: !!mutualLike,
          })

          logger.info(`Like notification sent to user ${targetUser._id}`)
        }
      } catch (notificationError) {
        logger.error(`Error sending like notification: ${notificationError.message}`)
      }

      res.status(200).json({
        success: true,
        message: `You liked ${targetUser.nickname}`,
        likesRemaining: user.dailyLikesRemaining,
        isMatch: !!mutualLike,
      })
    } catch (err) {
      logger.error(`Error liking user: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

/**
 * @route   DELETE /api/users/:id/like
 * @desc    Unlike a user
 * @access  Private
 */
router.delete(
  "/:id/like",
  protect,
  asyncHandler(async (req, res) => {
    logger.debug(`User ${req.user._id} unliking user ${req.params.id}`)
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ success: false, error: "Invalid user ID format" })
      }
      const targetUser = await User.findById(req.params.id)
      if (!targetUser) {
        return res.status(404).json({ success: false, error: "User not found" })
      }
      const result = await Like.findOneAndDelete({
        sender: req.user._id,
        recipient: req.params.id,
      })
      if (!result) {
        return res.status(404).json({
          success: false,
          error: `You haven't liked ${targetUser.nickname}`,
        })
      }
      res.status(200).json({
        success: true,
        message: `You unliked ${targetUser.nickname}`,
      })
    } catch (err) {
      logger.error(`Error unliking user: ${err.message}`)
      res.status(500).json({ success: false, error: "Server error" })
    }
  }),
)

// User settings routes

/**
 * @route   GET /users/settings
 * @desc    Get user settings
 * @access  Private
 */
router.get("/settings", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("settings")
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }
    res.json({ success: true, data: user.settings || {} })
  } catch (err) {
    console.error("Error fetching user settings:", err)
    res.status(500).json({ success: false, error: "Server error" })
  }
})

/**
 * @route   PUT /users/settings
 * @desc    Update user settings
 * @access  Private
 */
router.put("/settings", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }
    user.settings = req.body
    await user.save()
    res.json({ success: true, data: user.settings })
  } catch (err) {
    console.error("Error updating user settings:", err)
    res.status(500).json({ success: false, error: "Server error" })
  }
})

/**
 * @route   PUT /users/settings/notifications
 * @desc    Update notification settings
 * @access  Private
 */
router.put("/settings/notifications", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }
    if (!user.settings) {
      user.settings = {}
    }
    user.settings.notifications = req.body.notifications
    await user.save()
    res.json({ success: true, data: user.settings })
  } catch (err) {
    console.error("Error updating notification settings:", err)
    res.status(500).json({ success: false, error: "Server error" })
  }
})

/**
 * @route   PUT /users/settings/privacy
 * @desc    Update privacy settings
 * @access  Private
 */
router.put("/settings/privacy", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" })
    }
    if (!user.settings) {
      user.settings = {}
    }
    user.settings.privacy = req.body.privacy
    await user.save()
    res.json({ success: true, data: user.settings })
  } catch (err) {
    console.error("Error updating privacy settings:", err)
    res.status(500).json({ success: false, error: "Server error" })
  }
})

// Add the following route handler after the existing photo-related routes

// Approve all pending photo access requests
router.post("/photos/approve-all", protect, async (req, res) => {
  try {
    const userId = req.user.id

    // Find all pending photo permission requests for photos owned by this user
    const pendingRequests = await PhotoPermission.find({
      photoOwnerId: userId,
      status: "pending",
    })

    if (!pendingRequests || pendingRequests.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No pending requests found",
        approvedCount: 0,
      })
    }

    // Update all pending requests to 'approved'
    const updatePromises = pendingRequests.map((request) => {
      request.status = "approved"
      request.updatedAt = Date.now()
      return request.save()
    })

    await Promise.all(updatePromises)

    // Log the approval action
    console.log(`User ${userId} approved ${pendingRequests.length} photo access requests`)

    return res.status(200).json({
      success: true,
      message: `Successfully approved ${pendingRequests.length} photo access requests`,
      approvedCount: pendingRequests.length,
      requests: pendingRequests,
    })
  } catch (error) {
    console.error("Error approving photo requests:", error)
    return res.status(500).json({
      success: false,
      message: "Server error while approving photo requests",
    })
  }
})

// Update the photo permission request route to send notifications
router.post(
  "/photos/:id/request",
  enhancedProtect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id
    const { userId } = req.body

    logger.debug(`User ${req.user._id} requesting access to photo ${photoId} from user ${userId}`)

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(photoId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid photo ID or user ID format",
      })
    }

    // Find the photo owner
    const owner = await User.findById(userId)
    if (!owner) {
      logger.warn(`Photo access request failed: User ${userId} not found`)
      return res.status(404).json({
        success: false,
        error: "User not found",
      })
    }

    // Find the specific photo
    const photo = owner.photos.id(photoId)
    if (!photo) {
      logger.warn(`Photo access request failed: Photo ${photoId} not found`)
      return res.status(404).json({
        success: false,
        error: "Photo not found",
      })
    }

    // Check if the photo is private
    if (!photo.isPrivate) {
      logger.warn(`Photo access request failed: Photo ${photoId} is not private`)
      return res.status(400).json({
        success: false,
        error: "Photo is not private",
      })
    }

    // Check if the user is requesting access to their own photo
    if (owner._id.toString() === req.user._id.toString()) {
      logger.warn(`Photo access request failed: User ${req.user._id} trying to request access to their own photo`)
      return res.status(400).json({
        success: false,
        error: "You cannot request access to your own photo",
      })
    }

    try {
      // Check for existing permission request
      let permission = await PhotoPermission.findOne({
        photo: photoId,
        requestedBy: req.user._id,
      })

      if (permission) {
        // If request already exists, return success with a message
        logger.info(`Permission request already exists: ${permission._id}`)
        return res.status(200).json({
          success: true,
          data: permission,
          message: "Permission request already exists",
        })
      }

      // Create new permission request
      permission = new PhotoPermission({
        photo: photoId,
        requestedBy: req.user._id,
        status: "pending",
      })

      await permission.save()

      // Send notification via socket if available
      try {
        const io = req.app.get("io")
        const { sendPhotoPermissionRequestNotification } = await import("../socket/socketHandlers.js")

        if (io && sendPhotoPermissionRequestNotification) {
          const requester = await User.findById(req.user._id).select("nickname photos")

          await sendPhotoPermissionRequestNotification(io, requester, owner, permission)
          logger.info(`Photo permission request notification sent to user ${owner._id}`)
        }
      } catch (notificationError) {
        logger.error(`Error sending photo permission request notification: ${notificationError.message}`)
      }

      logger.info(`Photo access request created: ${permission._id}`)
      res.status(201).json({
        success: true,
        data: permission,
      })
    } catch (error) {
      logger.error(`Error creating permission request: ${error.message}`)

      // Handle duplicate key error
      if (error.code === 11000) {
        // Find the existing permission and return it
        const existingPermission = await PhotoPermission.findOne({
          photo: photoId,
          requestedBy: req.user._id,
        })

        return res.status(200).json({
          success: true,
          data: existingPermission,
          message: "Permission request already exists",
        })
      }

      res.status(500).json({
        success: false,
        error: error.message || "Server error while creating permission request",
      })
    }
  }),
)

// Update the photo permission response route to send notifications
router.put(
  "/photos/permissions/:id",
  protect,
  asyncHandler(async (req, res) => {
    const permissionId = req.params.id
    const { status } = req.body
    logger.debug(`Updating photo permission ${permissionId} to ${status}`)
    if (!mongoose.Types.ObjectId.isValid(permissionId)) {
      return res.status(400).json({ success: false, error: "Invalid permission ID format" })
    }
    if (!["approved", "rejected"].includes(status)) {
      logger.warn(`Invalid permission status: ${status}`)
      return res.status(400).json({ success: false, error: 'Status must be either "approved" or "rejected"' })
    }
    const permission = await PhotoPermission.findById(permissionId)
    if (!permission) {
      logger.warn(`Permission ${permissionId} not found`)
      return res.status(404).json({ success: false, error: "Permission request not found" })
    }
    const owner = await User.findOne({ _id: req.user._id, "photos._id": permission.photo })
    if (!owner) {
      logger.warn(`User ${req.user._id} not authorized to update permission ${permissionId}`)
      return res.status(401).json({ success: false, error: "Not authorized to update this permission" })
    }
    permission.status = status
    await permission.save()

    // Send notification via socket if available
    try {
      const io = req.app.get("io")
      const { sendPhotoPermissionResponseNotification } = await import("../socket/socketHandlers.js")

      if (io && sendPhotoPermissionResponseNotification) {
        const requester = await User.findById(permission.requestedBy)

        await sendPhotoPermissionResponseNotification(io, owner, requester, permission)
        logger.info(`Photo permission response notification sent to user ${requester._id}`)
      }
    } catch (notificationError) {
      logger.error(`Error sending photo permission response notification: ${notificationError.message}`)
    }

    logger.info(`Permission ${permissionId} updated to ${status}`)
    res.status(200).json({ success: true, data: permission })
  }),
)

export default router

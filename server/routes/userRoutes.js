/**
 * userRoutes.prod.js
 * Production–ready Express routes for user-related functionalities,
 * including profile updates, photo uploads/permissions, likes, searches,
 * and settings updates. Uses best practices (error handling, middleware, modularity)
 * without losing any existing functionality.
 */

import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import mongoose from "mongoose";
import { User, PhotoPermission, Message, Like } from "../models/index.js";
import config from "../config.js";
import { protect, enhancedProtect, asyncHandler } from "../middleware/auth.js";
import logger from "../logger.js";
import { canLikeUser } from "../middleware/permissions.js";

// ==========================
// Utility Functions & Middleware
// ==========================

/**
 * Convert an ID to a safe string for MongoDB queries.
 */
const safeId = (id) => (id ? (typeof id === "object" && id.toString ? id.toString() : String(id)) : null);

/**
 * Middleware to patch the user object so that IDs are strings.
 */
const flexibleIdMiddleware = (req, res, next) => {
  req._originalUser = req.user;
  if (req.user) {
    req.user = {
      ...req.user,
      _id: safeId(req.user._id),
      id: safeId(req.user.id || req.user._id),
    };
  }
  next();
};

// ==========================
// Multer Configuration for File Uploads
// ==========================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(config.FILE_UPLOAD_PATH, "images");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileExt = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE, // e.g., 5MB
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".gif"];
    const isValidMime = allowedMimeTypes.includes(file.mimetype);
    const ext = path.extname(file.originalname).toLowerCase();
    const isValidExt = allowedExtensions.includes(ext);
    if (isValidMime && isValidExt) {
      return cb(null, true);
    }
    cb(new Error("Only image files (jpg, jpeg, png, gif) are allowed"));
  },
});

// ==========================
// Express Router Setup
// ==========================

const router = express.Router();

// Optionally apply flexibleIdMiddleware to all routes if needed
router.use(flexibleIdMiddleware);

// ----- GET /api/users/likes -----
// Get all users liked by the current user
router.get(
  "/likes",
  protect,
  asyncHandler(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    // Determine the user ID from the request
    let userId = req.user && (req.user._id || req.user.id);
    if (!userId) {
      return res.status(400).json({ success: false, error: "User ID not found in request" });
    }

    const db = mongoose.connection;
    const likesCollection = db.collection("likes");

    const likesQuery = [
      { $match: { sender: userId } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];
    const totalQuery = [{ $match: { sender: userId } }, { $count: "total" }];

    const [likesResult, totalResult] = await Promise.all([
      likesCollection.aggregate(likesQuery).toArray(),
      likesCollection.aggregate(totalQuery).toArray(),
    ]);

    const total = totalResult.length > 0 ? totalResult[0].total : 0;

    if (likesResult.length > 0) {
      const recipientIds = likesResult.map((like) => like.recipient);
      const usersCollection = db.collection("users");
      const users = await usersCollection
        .find(
          { _id: { $in: recipientIds } },
          { projection: { nickname: 1, username: 1, photos: 1, isOnline: 1, lastActive: 1 } }
        )
        .toArray();

      const userMap = {};
      users.forEach((user) => {
        userMap[user._id.toString()] = user;
      });

      likesResult.forEach((like) => {
        const recipientId = like.recipient.toString();
        if (userMap[recipientId]) {
          like.recipient = userMap[recipientId];
        }
      });
    }

    res.status(200).json({
      success: true,
      count: likesResult.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: likesResult,
    });
  })
);

// ----- GET /api/users -----
// Get all online users (with optional filters) except the current user
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const query = { _id: { $ne: req.user._id } };

    if (req.query.online === "true") {
      query.isOnline = true;
    }
    if (req.query.gender) {
      query["details.gender"] = req.query.gender;
    }
    if (req.query.minAge) {
      query["details.age"] = { ...(query["details.age"] || {}), $gte: Number.parseInt(req.query.minAge, 10) };
    }
    if (req.query.maxAge) {
      query["details.age"] = { ...(query["details.age"] || {}), $lte: Number.parseInt(req.query.maxAge, 10) };
    }
    if (req.query.location) {
      query["details.location"] = { $regex: req.query.location, $options: "i" };
    }
    if (req.query.interest) {
      query["details.interests"] = { $in: [req.query.interest] };
    }

    const users = await User.find(query)
      .select("nickname details photos isOnline lastActive")
      .sort({ isOnline: -1, lastActive: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: users,
    });
  })
);

// ----- GET /api/users/:id -----
// Get a single user profile along with message history between the current user and that user
router.get(
  "/:id",
  protect,
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid user ID format" });
    }

    const user = await User.findById(req.params.id).select("nickname details photos isOnline lastActive createdAt");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      $or: [
        { sender: req.user._id, recipient: req.params.id },
        { sender: req.params.id, recipient: req.user._id },
      ],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalMessages = await Message.countDocuments({
      $or: [
        { sender: req.user._id, recipient: req.params.id },
        { sender: req.params.id, recipient: req.user._id },
      ],
    });

    const isLiked = await Like.exists({ sender: req.user._id, recipient: req.params.id });
    const isMutualLike = await Like.exists({ sender: req.params.id, recipient: req.user._id });

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
    });
  })
);

// ----- GET /api/users/:id/photo-permissions -----
// Get photo permission statuses for a user (only for private photos)
router.get(
  "/:id/photo-permissions",
  enhancedProtect,
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid user ID format" });
    }

    const user = await User.findById(req.params.id).select("photos");
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const privatePhotoIds = user.photos.filter((photo) => photo.isPrivate).map((photo) => photo._id);
    if (privatePhotoIds.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const permissions = await PhotoPermission.find({
      photo: { $in: privatePhotoIds },
      requestedBy: req.user._id,
    });

    const formattedPermissions = permissions.map((permission) => ({
      photo: permission.photo,
      status: permission.status,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt,
      respondedAt: permission.respondedAt,
      expiresAt: permission.expiresAt,
    }));

    res.status(200).json({ success: true, data: formattedPermissions });
  })
);

// ----- PUT /api/users/profile -----
// Update the current user's profile
router.put(
  "/profile",
  protect,
  asyncHandler(async (req, res) => {
    const { nickname, details } = req.body;
    if (nickname && nickname.trim().length < 3) {
      return res.status(400).json({ success: false, error: "Nickname must be at least 3 characters" });
    }
    if (details && details.age && (details.age < 18 || details.age > 120)) {
      return res.status(400).json({ success: false, error: "Age must be between 18 and 120" });
    }
    const updateData = {};
    if (nickname) updateData.nickname = nickname.trim();
    if (details) {
      updateData.details = { ...req.user.details };
      if (details.age !== undefined) updateData.details.age = Number.parseInt(details.age, 10);
      if (details.gender !== undefined) updateData.details.gender = details.gender;
      if (details.location !== undefined) updateData.details.location = details.location.trim();
      if (details.bio !== undefined) {
        if (details.bio.length > 500) {
          return res.status(400).json({ success: false, error: "Bio cannot exceed 500 characters" });
        }
        updateData.details.bio = details.bio.trim();
      }
      if (details.interests !== undefined) {
        if (typeof details.interests === "string") {
          updateData.details.interests = details.interests.split(",").map((i) => i.trim()).filter(Boolean);
        } else if (Array.isArray(details.interests)) {
          if (details.interests.length > 10) {
            return res.status(400).json({ success: false, error: "Cannot have more than 10 interests" });
          }
          updateData.details.interests = details.interests;
        }
      }
      // Handle additional fields
      if (details.iAm !== undefined) updateData.details.iAm = details.iAm;
      if (details.lookingFor !== undefined && Array.isArray(details.lookingFor)) {
        if (details.lookingFor.length > 3) {
          return res.status(400).json({ success: false, error: "Cannot have more than 3 'looking for' options" });
        }
        updateData.details.lookingFor = details.lookingFor;
      }
      if (details.intoTags !== undefined && Array.isArray(details.intoTags)) {
        if (details.intoTags.length > 20) {
          return res.status(400).json({ success: false, error: "Cannot have more than 20 'into' tags" });
        }
        updateData.details.intoTags = details.intoTags;
      }
      if (details.turnOns !== undefined && Array.isArray(details.turnOns)) {
        if (details.turnOns.length > 20) {
          return res.status(400).json({ success: false, error: "Cannot have more than 20 'turn ons' tags" });
        }
        updateData.details.turnOns = details.turnOns;
      }
      if (details.maritalStatus !== undefined) updateData.details.maritalStatus = details.maritalStatus;
    }

    const updatedUser = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ success: true, data: updatedUser });
  })
);

// ----- POST /api/users/photos -----
// Upload a photo for the current user with image processing
router.post(
  "/photos",
  protect,
  upload.single("photo"),
  asyncHandler(async (req, res) => {
    let filePath = null;
    let processingSuccessful = false;

    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "Please upload a file" });
      }

      const isPrivate = req.body.isPrivate === "true" || req.body.isPrivate === true;
      // Check photo count limit
      if (req.user.photos && req.user.photos.length >= 10) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          error: "Maximum number of photos (10) reached. Delete some photos to upload more.",
        });
      }

      filePath = req.file.path;
      const fileBuffer = fs.readFileSync(filePath);
      const fileType = await fileTypeFromBuffer(fileBuffer);
      if (!fileType || !fileType.mime.startsWith("image/")) {
        fs.unlinkSync(filePath);
        return res.status(400).json({ success: false, error: "File is not a valid image" });
      }

      // Process image (resize if needed)
      const image = sharp(filePath);
      const metadata = await image.metadata();
      const resizedFilePath = filePath + "_resized";
      if (metadata.width > 1200 || metadata.height > 1200) {
        await image
          .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
          .toFile(resizedFilePath);
        fs.unlinkSync(filePath);
        fs.renameSync(resizedFilePath, filePath);
      }
      processingSuccessful = true;

      const fileName = path.basename(filePath);
      const photoUrl = `/uploads/images/${fileName}`;
      const photoMetadata = {
        contentType: metadata.format,
        size: metadata.size,
        dimensions: { width: metadata.width, height: metadata.height },
      };
      const photo = { url: photoUrl, isPrivate, metadata: photoMetadata };
      const isFirstPhoto = !req.user.photos || req.user.photos.length === 0;
      req.user.photos.push(photo);
      await req.user.save();
      const newPhoto = req.user.photos[req.user.photos.length - 1];

      res.status(200).json({
        success: true,
        data: newPhoto,
        isProfilePhoto: isFirstPhoto,
        url: photoUrl,
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    } finally {
      if (!processingSuccessful && filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (cleanupErr) {
          logger.error(`Error during file cleanup: ${cleanupErr.message}`);
        }
      }
    }
  })
);

// ----- PUT /api/users/photos/:id/privacy -----
// Update the privacy setting of a photo
router.put(
  "/photos/:id/privacy",
  protect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id;
    const { isPrivate } = req.body;
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({ success: false, error: "Invalid photo ID format" });
    }
    if (typeof isPrivate !== "boolean") {
      return res.status(400).json({ success: false, error: "isPrivate must be a boolean value" });
    }
    const user = await User.findOne({ _id: req.user._id, "photos._id": photoId });
    if (!user) {
      return res.status(404).json({ success: false, error: "Photo not found or not owned by you" });
    }
    const photoIndex = user.photos.findIndex((p) => p._id.toString() === photoId);
    user.photos[photoIndex].isPrivate = isPrivate;
    await user.save();
    res.status(200).json({ success: true, data: user.photos[photoIndex] });
  })
);

// ----- PUT /api/users/photos/:id/profile -----
// Set a photo as the profile photo by moving it to the beginning of the array
router.put(
  "/photos/:id/profile",
  protect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({ success: false, error: "Invalid photo ID format" });
    }
    const user = await User.findOne({ _id: req.user._id, "photos._id": photoId });
    if (!user) {
      return res.status(404).json({ success: false, error: "Photo not found or not owned by you" });
    }
    const photoIndex = user.photos.findIndex((p) => p._id.toString() === photoId);
    const photo = user.photos.splice(photoIndex, 1)[0];
    user.photos.unshift(photo);
    await user.save();
    res.status(200).json({ success: true, data: user.photos });
  })
);

// ----- DELETE /api/users/photos/:id -----
// Soft-delete a photo (move the file to a deleted folder)
router.delete(
  "/photos/:id",
  protect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return res.status(400).json({ success: false, error: "Invalid photo ID format" });
    }
    const user = await User.findOne({ _id: req.user._id, "photos._id": photoId });
    if (!user) {
      return res.status(404).json({ success: false, error: "Photo not found or not owned by you" });
    }
    if (user.photos.length === 1) {
      return res.status(400).json({ success: false, error: "Cannot delete your only photo" });
    }
    if (user.photos[0]._id.toString() === photoId) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete your profile photo. Set another photo as profile first.",
      });
    }
    const photoIndex = user.photos.findIndex((p) => p._id.toString() === photoId);
    const photo = user.photos[photoIndex];
    const filename = photo.url.split("/").pop();
    user.photos.splice(photoIndex, 1);
    await user.save();

    // Import soft delete function from upload middleware (assumed to be implemented)
    const { softDeleteFile } = await import("../middleware/upload.js");
    const filePath = path.join(config.FILE_UPLOAD_PATH, "images", filename);
    if (fs.existsSync(filePath)) {
      const result = await softDeleteFile(filePath);
      if (!result) {
        logger.warn(`Could not soft-delete photo file at ${filePath}`);
      }
    }
    res.status(200).json({
      success: true,
      message: "Photo deleted successfully",
      data: { photoId, wasDeleted: true },
    });
  })
);

// ----- POST /api/users/photos/:id/request -----
// Request permission to view a private photo (sends socket notification if available)
router.post(
  "/photos/:id/request",
  enhancedProtect,
  asyncHandler(async (req, res) => {
    const photoId = req.params.id;
    const { userId } = req.body;
    logger.debug(`User ${req.user._id} requesting access to photo ${photoId} from user ${userId}`);

    if (!mongoose.Types.ObjectId.isValid(photoId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, error: "Invalid photo ID or user ID format" });
    }
    const owner = await User.findById(userId);
    if (!owner) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const photo = owner.photos.id(photoId);
    if (!photo) {
      return res.status(404).json({ success: false, error: "Photo not found" });
    }
    if (!photo.isPrivate) {
      return res.status(400).json({ success: false, error: "Photo is not private" });
    }
    if (owner._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: "You cannot request access to your own photo" });
    }
    try {
      let permission = await PhotoPermission.findOne({ photo: photoId, requestedBy: req.user._id });
      if (permission) {
        return res.status(200).json({
          success: true,
          data: permission,
          message: "Permission request already exists",
        });
      }
      permission = new PhotoPermission({ photo: photoId, requestedBy: req.user._id, status: "pending" });
      await permission.save();

      try {
        const io = req.app.get("io");
        const { sendPhotoPermissionRequestNotification } = await import("../socket/socketHandlers.js");
        if (io && sendPhotoPermissionRequestNotification) {
          const requester = await User.findById(req.user._id).select("nickname photos");
          const userConnections = req.app.get("userConnections") || new Map();
          logger.debug(`Sending photo permission request notification from ${requester._id} to ${owner._id}`);
          await sendPhotoPermissionRequestNotification(io, requester, owner, permission, userConnections);
        }
      } catch (notificationError) {
        logger.error(`Error sending photo permission request notification: ${notificationError.message}`);
      }
      res.status(201).json({ success: true, data: permission });
    } catch (error) {
      if (error.code === 11000) {
        const existingPermission = await PhotoPermission.findOne({ photo: photoId, requestedBy: req.user._id });
        return res.status(200).json({
          success: true,
          data: existingPermission,
          message: "Permission request already exists",
        });
      }
      res.status(500).json({ success: false, error: error.message || "Server error while creating permission request" });
    }
  })
);

// ----- GET /api/users/photos/permissions -----
// Get all photo permission requests for photos owned by the current user
router.get(
  "/photos/permissions",
  protect,
  asyncHandler(async (req, res) => {
    const photoIds = req.user.photos.map((photo) => photo._id);
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const query = { photo: { $in: photoIds } };
    if (req.query.status && ["pending", "approved", "rejected"].includes(req.query.status)) {
      query.status = req.query.status;
    }
    const permissions = await PhotoPermission.find(query)
      .populate("requestedBy", "nickname photos")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await PhotoPermission.countDocuments(query);
    res.status(200).json({
      success: true,
      count: permissions.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: permissions,
    });
  })
);

// ----- PUT /api/photos/permissions/:id -----
// Approve or reject a photo permission request and send a socket notification if possible
router.put(
  "/photos/permissions/:id",
  protect,
  asyncHandler(async (req, res) => {
    const permissionId = req.params.id;
    const { status } = req.body;
    if (!mongoose.Types.ObjectId.isValid(permissionId)) {
      return res.status(400).json({ success: false, error: "Invalid permission ID format" });
    }
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be either "approved" or "rejected"' });
    }
    const permission = await PhotoPermission.findById(permissionId);
    if (!permission) {
      return res.status(404).json({ success: false, error: "Permission request not found" });
    }
    const owner = await User.findOne({ _id: req.user._id, "photos._id": permission.photo });
    if (!owner) {
      return res.status(401).json({ success: false, error: "Not authorized to update this permission" });
    }
    permission.status = status;
    await permission.save();

    try {
      const io = req.app.get("io");
      const { sendPhotoPermissionResponseNotification } = await import("../socket/socketHandlers.js");
      if (io && sendPhotoPermissionResponseNotification) {
        const requester = await User.findById(permission.requestedBy);
        const userConnections = req.app.get("userConnections") || new Map();
        await sendPhotoPermissionResponseNotification(io, owner, requester, permission, userConnections);
      }
    } catch (notificationError) {
      logger.error(`Error sending photo permission response notification: ${notificationError.message}`);
    }
    res.status(200).json({ success: true, data: permission });
  })
);

// ----- GET /api/users/search -----
// Search users with advanced filtering
router.get(
  "/search",
  protect,
  asyncHandler(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const query = { _id: { $ne: req.user._id } };

    if (req.query.nickname) {
      query.nickname = { $regex: req.query.nickname, $options: "i" };
    }
    if (req.query.gender) {
      query["details.gender"] = req.query.gender;
    }
    if (req.query.minAge) {
      query["details.age"] = { ...(query["details.age"] || {}), $gte: Number.parseInt(req.query.minAge, 10) };
    }
    if (req.query.maxAge) {
      query["details.age"] = { ...(query["details.age"] || {}), $lte: Number.parseInt(req.query.maxAge, 10) };
    }
    if (req.query.location) {
      query["details.location"] = { $regex: req.query.location, $options: "i" };
    }
    if (req.query.interests) {
      const interests = req.query.interests.split(",");
      query["details.interests"] = { $in: interests };
    }
    if (req.query.online === "true") {
      query.isOnline = true;
    }

    const users = await User.find(query)
      .select("nickname details photos isOnline lastActive")
      .sort({ isOnline: -1, lastActive: -1 })
      .skip(skip)
      .limit(limit);
    const total = await User.countDocuments(query);
    res.status(200).json({
      success: true,
      count: users.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: users,
    });
  })
);

// ----- GET /api/users/matches -----
// Get all mutual likes (matches) for the current user
router.get(
  "/matches",
  protect,
  asyncHandler(async (req, res) => {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;
    const likedUsers = await Like.find({ sender: req.user._id }).select("recipient");
    const likedUserIds = likedUsers.map((like) => like.recipient);
    const matches = await Like.find({
      sender: { $in: likedUserIds },
      recipient: req.user._id,
    })
      .populate("sender", "nickname photos isOnline lastActive details")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    const total = await Like.countDocuments({
      sender: { $in: likedUserIds },
      recipient: req.user._id,
    });
    res.status(200).json({
      success: true,
      count: matches.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: matches,
    });
  })
);

// ----- POST /api/users/:id/like -----
// Like a user and send notification via socket if available
router.post(
  "/:id/like",
  protect,
  canLikeUser,
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid user ID format" });
    }
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const user = req.userObj;
    const existingLike = await Like.findOne({ sender: req.user._id, recipient: req.params.id });
    if (existingLike) {
      return res.status(400).json({ success: false });
    }
    const like = new Like({ sender: req.user._id, recipient: req.params.id });
    await like.save();
    if (user.accountTier === "FREE") {
      user.dailyLikesRemaining -= 1;
      await user.save();
    }
    const mutualLike = await Like.findOne({ sender: req.params.id, recipient: req.user._id });
    try {
      const io = req.app.get("io");
      const { sendLikeNotification } = await import("../socket/socketHandlers.js");
      if (io && sendLikeNotification) {
        const senderUser = await User.findById(req.user._id).select("nickname photos");
        const userConnections = req.app.get("userConnections") || new Map();
        await sendLikeNotification(io, senderUser, targetUser, { _id: like._id, isMatch: !!mutualLike }, userConnections);
      }
    } catch (notificationError) {
      logger.error(`Error sending like notification: ${notificationError.message}`);
    }
    res.status(200).json({
      success: true,
      message: `You liked ${targetUser.nickname}`,
      likesRemaining: user.dailyLikesRemaining,
      isMatch: !!mutualLike,
    });
  })
);

// ----- DELETE /api/users/:id/like -----
// Unlike a user
router.delete(
  "/:id/like",
  protect,
  asyncHandler(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: "Invalid user ID format" });
    }
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    const result = await Like.findOneAndDelete({ sender: req.user._id, recipient: req.params.id });
    if (!result) {
      return res.status(404).json({ success: false, error: `You haven't liked ${targetUser.nickname}` });
    }
    res.status(200).json({ success: true, message: `You unliked ${targetUser.nickname}` });
  })
);

// ----- User Settings Routes -----
// GET user settings
router.get("/settings", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("settings");
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, data: user.settings || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// PUT update user settings
router.put("/settings", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    user.settings = req.body;
    await user.save();
    res.json({ success: true, data: user.settings });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// PUT update notification settings
router.put("/settings/notifications", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    if (!user.settings) user.settings = {};
    user.settings.notifications = req.body.notifications;
    await user.save();
    res.json({ success: true, data: user.settings });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// PUT update privacy settings
router.put("/settings/privacy", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    if (!user.settings) user.settings = {};
    user.settings.privacy = req.body.privacy;
    await user.save();
    res.json({ success: true, data: user.settings });
  } catch (err) {
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ----- POST /api/photos/approve-all -----
// Approve all pending photo access requests for the current user
router.post(
  "/photos/approve-all",
  protect,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const pendingRequests = await PhotoPermission.find({ photoOwnerId: userId, status: "pending" });
    if (!pendingRequests || pendingRequests.length === 0) {
      return res.status(200).json({ success: true, message: "No pending requests found", approvedCount: 0 });
    }
    await Promise.all(
      pendingRequests.map((request) => {
        request.status = "approved";
        request.updatedAt = Date.now();
        return request.save();
      })
    );
    res.status(200).json({
      success: true,
      message: `Successfully approved ${pendingRequests.length} photo access requests`,
      approvedCount: pendingRequests.length,
      requests: pendingRequests,
    });
  })
);

export default router;

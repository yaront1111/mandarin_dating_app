import express from "express";
import mongoose from "mongoose";
import { protect, asyncHandler } from "../middleware/auth.js";
import logger from "../logger.js";

const router = express.Router();

// We'll try to use the Notification model if it exists, otherwise we'll create a basic schema
let Notification;
try {
  Notification = mongoose.model("Notification");
} catch (err) {
  // Define a basic notification schema if not already defined
  const notificationSchema = new mongoose.Schema({
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["message", "like", "match", "story", "system"],
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    content: String,
    reference: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "type",
    },
    read: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  });

  Notification = mongoose.model("Notification", notificationSchema);
  logger.info("Created Notification model schema");
}

/**
 * @route   GET /api/notifications
 * @desc    Get notifications for the current user
 * @access  Private
 */
router.get(
  "/",
  protect,
  asyncHandler(async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      const limit = Number.parseInt(req.query.limit, 10) || 20;
      const skip = (page - 1) * limit;

      const notifications = await Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("sender", "nickname username photos avatar")
        .lean();

      const total = await Notification.countDocuments({ recipient: req.user._id });

      res.status(200).json({
        success: true,
        count: notifications.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: notifications,
      });
    } catch (err) {
      logger.error(`Error fetching notifications: ${err.message}`);
      res.status(500).json({
        success: false,
        error: "Server error while fetching notifications",
      });
    }
  })
);

/**
 * @route   PUT /api/notifications/read
 * @desc    Mark notifications as read
 * @access  Private
 */
router.put(
  "/read",
  protect,
  asyncHandler(async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Notification IDs array is required",
        });
      }

      const result = await Notification.updateMany(
        { _id: { $in: ids }, recipient: req.user._id },
        { read: true }
      );

      res.status(200).json({
        success: true,
        count: result.modifiedCount,
      });
    } catch (err) {
      logger.error(`Error marking notifications as read: ${err.message}`);
      res.status(500).json({
        success: false,
        error: "Server error while marking notifications as read",
      });
    }
  })
);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read for the current user
 * @access  Private
 */
router.put(
  "/read-all",
  protect,
  asyncHandler(async (req, res) => {
    try {
      const result = await Notification.updateMany(
        { recipient: req.user._id, read: false },
        { read: true }
      );

      res.status(200).json({
        success: true,
        count: result.modifiedCount,
      });
    } catch (err) {
      logger.error(`Error marking all notifications as read: ${err.message}`);
      res.status(500).json({
        success: false,
        error: "Server error while marking all notifications as read",
      });
    }
  })
);

export default router;

// server/models/PhotoPermission.js
// This model handles access requests for private photos between users.

import mongoose from "mongoose";
import logger from "../logger.js";

const { Schema, model } = mongoose;

/**
 * PhotoPermissionSchema
 *
 * Defines the schema for a photo access request.
 * A request ties a photo (owned by a user) to a requesting user,
 * along with its current status and optional response details.
 */
const PhotoPermissionSchema = new Schema(
  {
    // Reference to the photo. It is assumed that the photo's ObjectId is stored in the User model.
    photo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Photo ID is required"],
      index: true,
    },

    // The user who is requesting permission to view the photo.
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Requesting user ID is required"],
      index: true,
    },

    // The current status of the request.
    status: {
      type: String,
      enum: {
        values: ["pending", "approved", "rejected"],
        message: "Status must be pending, approved, or rejected",
      },
      default: "pending",
      index: true,
    },

    // Optional message included with the request (e.g. a note to the photo owner).
    message: {
      type: String,
      trim: true,
      maxlength: [200, "Message cannot exceed 200 characters"],
    },

    // The date when the request was responded to (approved or rejected).
    respondedAt: {
      type: Date,
      default: null,
    },

    // Timestamp when the request was created.
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // Expiration date for approved permissions. Defaults to 30 days from approval.
    expiresAt: {
      type: Date,
      default: function () {
        if (this.status === "approved") {
          const date = new Date();
          date.setDate(date.getDate() + 30);
          return date;
        }
        return null;
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
// Ensure that each combination of photo and requesting user is unique.
PhotoPermissionSchema.index(
  { photo: 1, requestedBy: 1 },
  { unique: true, name: "photo_requestedBy_unique" }
);

// ---------------------------------------------------------------------------
// Pre-validation Hooks
// ---------------------------------------------------------------------------
/**
 * Pre-validation hook to ensure that a user cannot request permission
 * for their own photo and that the photo is actually private.
 */
PhotoPermissionSchema.pre("validate", async function (next) {
  try {
    // Only validate on new permission requests.
    if (this.isNew) {
      // Avoid circular dependency by using the compiled User model.
      const User = model("User");
      // Find the owner of the photo by searching for the photo within the owner's photos array.
      const photoOwner = await User.findOne({ "photos._id": this.photo });

      if (!photoOwner) {
        return next(new Error("Photo not found"));
      }
      // Prevent a user from requesting permission for their own photo.
      if (photoOwner._id.toString() === this.requestedBy.toString()) {
        return next(new Error("Cannot request permission for your own photo"));
      }
      // Retrieve the photo subdocument.
      const photo = photoOwner.photos.id(this.photo);
      if (!photo) {
        return next(new Error("Photo not found"));
      }
      // Only allow requests for photos that are marked as private.
      if (!photo.isPrivate) {
        return next(new Error("Permission not required for public photos"));
      }
    }
    next();
  } catch (error) {
    logger.error(`Error in PhotoPermission pre-validate hook: ${error.message}`);
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Pre-save Hook
// ---------------------------------------------------------------------------
/**
 * Pre-save hook to update timestamps when the status changes.
 * If the request is approved or rejected, sets the respondedAt date.
 * For approved requests, also sets the expiration date.
 */
PhotoPermissionSchema.pre("save", function (next) {
  if (this.isModified("status") && ["approved", "rejected"].includes(this.status)) {
    this.respondedAt = new Date();
    if (this.status === "approved") {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 30); // Default to 30 days expiration
      this.expiresAt = expiryDate;
    } else {
      this.expiresAt = null;
    }
  }
  next();
});

// ---------------------------------------------------------------------------
// Instance Methods
// ---------------------------------------------------------------------------
/**
 * Checks whether an approved permission has expired.
 * @returns {boolean} True if the permission is expired.
 */
PhotoPermissionSchema.methods.hasExpired = function () {
  return this.status === "approved" && this.expiresAt && this.expiresAt < new Date();
};

/**
 * Approves a permission request and sets an expiration date.
 * @param {number} expiryDays - Number of days until the permission expires (default: 30).
 * @returns {Promise<Object>} The updated document.
 */
PhotoPermissionSchema.methods.approve = async function (expiryDays = 30) {
  this.status = "approved";
  this.respondedAt = new Date();
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  this.expiresAt = expiryDate;
  return this.save();
};

/**
 * Rejects a permission request.
 * Optionally, includes a message explaining the rejection.
 * @param {string} message - Optional rejection message.
 * @returns {Promise<Object>} The updated document.
 */
PhotoPermissionSchema.methods.reject = async function (message) {
  this.status = "rejected";
  this.respondedAt = new Date();
  this.expiresAt = null;
  if (message) {
    this.message = message;
  }
  return this.save();
};

// ---------------------------------------------------------------------------
// Static Methods
// ---------------------------------------------------------------------------
/**
 * Retrieves all pending photo permission requests for the photos belonging to a user.
 * Supports pagination.
 *
 * @param {ObjectId|string} userId - The ID of the photo owner.
 * @param {Object} options - Pagination options (page and limit).
 * @returns {Promise<Object>} An object with data and pagination info.
 */
PhotoPermissionSchema.statics.getPendingForUser = async function (userId, options = {}) {
  try {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;
    const User = model("User");
    // Find the user to extract private photo IDs.
    const user = await User.findById(userId).select("photos");
    if (!user) {
      throw new Error("User not found");
    }
    const privatePhotoIds = user.photos.filter(photo => photo.isPrivate).map(photo => photo._id);
    if (privatePhotoIds.length === 0) {
      return {
        data: [],
        pagination: { total: 0, page, pages: 0, limit },
      };
    }
    const query = {
      photo: { $in: privatePhotoIds },
      status: "pending",
    };
    const [permissions, total] = await Promise.all([
      this.find(query)
        .populate("requestedBy", "nickname username photos avatar")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      this.countDocuments(query),
    ]);
    return {
      data: permissions,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit,
      },
    };
  } catch (error) {
    logger.error(`Error in getPendingForUser: ${error.message}`);
    throw error;
  }
};

// ---------------------------------------------------------------------------
// Model Creation
// ---------------------------------------------------------------------------
const PhotoPermission = model("PhotoPermission", PhotoPermissionSchema);

export default PhotoPermission;

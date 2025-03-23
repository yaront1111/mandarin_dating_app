/**
 * Enhanced User Model
 * -------------------
 * This file defines the User model with advanced security, validation,
 * and performance optimizations. It uses ES Modules and modern JavaScript.
 */

import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import validator from "validator"

const { Schema, model } = mongoose

// Photo subdocument schema
const photoSchema = new Schema(
  {
    url: {
      type: String,
      required: [true, "Photo URL is required"],
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    metadata: {
      contentType: String,
      size: Number,
      dimensions: {
        width: Number,
        height: Number,
      },
    },
  },
  { timestamps: true },
)

// Partner information subdocument schema
const partnerInfoSchema = new Schema({
  nickname: String,
  gender: {
    type: String,
    enum: ["male", "female", "non-binary", "other"],
  },
  age: {
    type: Number,
    min: [18, "Partner must be at least 18 years old"],
  },
})

// Main User schema
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, "Please provide a valid email"],
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    username: {
      type: String,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    nickname: {
      type: String,
      required: [true, "Nickname is required"],
      trim: true,
      minlength: [3, "Nickname must be at least 3 characters"],
      maxlength: [30, "Nickname cannot exceed 30 characters"],
      index: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    profilePicture: {
      type: String,
      default: "",
    },
    details: {
      age: {
        type: Number,
        min: [18, "You must be at least 18 years old"],
        max: [120, "Age cannot exceed 120"],
      },
      gender: {
        type: String,
        enum: {
          values: ["male", "female", "non-binary", "other", ""],
          message: "Gender must be male, female, non-binary, other, or empty",
        },
        default: "",
      },
      location: {
        type: String,
        trim: true,
        maxlength: [100, "Location cannot exceed 100 characters"],
      },
      bio: {
        type: String,
        trim: true,
        maxlength: [500, "Bio cannot exceed 500 characters"],
      },
      interests: {
        type: [String],
        validate: {
          validator: (interests) => interests.length <= 10,
          message: "Cannot have more than 10 interests",
        },
      },
      // New fields for enhanced profile information
      iAm: {
        type: String,
        enum: ["woman", "man", "couple", ""],
        default: "",
      },
      lookingFor: {
        type: [String],
        default: [],
        validate: {
          validator: (lookingFor) => {
            if (lookingFor.length > 3) return false
            return lookingFor.every((item) => ["women", "men", "couples"].includes(item))
          },
          message: "Looking for must include only valid options: women, men, couples",
        },
      },
      intoTags: {
        type: [String],
        default: [],
        validate: {
          validator: (tags) => tags.length <= 20,
          message: "Cannot have more than 20 'into' tags",
        },
      },
      turnOns: {
        type: [String],
        default: [],
        validate: {
          validator: (tags) => tags.length <= 20,
          message: "Cannot have more than 20 'turn ons' tags",
        },
      },
    },
    photos: [photoSchema],
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    socketId: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ["user", "moderator", "admin"],
      default: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    refreshToken: String,
    refreshTokenExpires: Date,
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,
    active: {
      type: Boolean,
      default: true,
      select: false,
    },
    // Token version to handle token invalidation
    version: {
      type: Number,
      default: 1,
    },
    // Last IP address used for login (for security monitoring)
    lastLoginIp: String,
    // Account tier system fields
    accountTier: {
      type: String,
      enum: ["FREE", "PAID", "FEMALE", "COUPLE"],
      default: "FREE",
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    subscriptionExpiry: {
      type: Date,
      default: null,
    },
    dailyLikesRemaining: {
      type: Number,
      default: 3, // Free male users get 3 likes per day
    },
    dailyLikesReset: {
      type: Date,
      default: () => new Date(new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000), // Next day at midnight
    },
    lastStoryCreated: {
      type: Date,
      default: null,
    },
    isCouple: {
      type: Boolean,
      default: false,
    },
    partnerInfo: {
      type: partnerInfoSchema,
      default: null,
    },
    settings: {
      notifications: {
        messages: { type: Boolean, default: true },
        calls: { type: Boolean, default: true },
        stories: { type: Boolean, default: true },
        likes: { type: Boolean, default: true },
        comments: { type: Boolean, default: true },
      },
      privacy: {
        showOnlineStatus: { type: Boolean, default: true },
        showReadReceipts: { type: Boolean, default: true },
        showLastSeen: { type: Boolean, default: true },
        allowStoryReplies: {
          type: String,
          default: "everyone",
          enum: ["everyone", "friends", "none"],
        },
      },
      theme: {
        mode: {
          type: String,
          default: "light",
          enum: ["light", "dark", "system"],
        },
        color: { type: String, default: "default" },
      },
    },
    // Blocked users list
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Date tracking for analytics
    createdByIp: String,
    lastModifiedDate: {
      type: Date,
      default: Date.now,
    },
    refreshTokens: [
      {
        token: {
          type: String,
          required: true,
        },
        expiresAt: {
          type: Date,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Virtual field for age calculation
userSchema.virtual("age").get(function () {
  return this.details && this.details.age ? this.details.age : null
})

// Virtual field for subscription status
userSchema.virtual("isSubscriptionActive").get(function () {
  return this.isPaid && this.subscriptionExpiry && this.subscriptionExpiry > new Date()
})

// Indexes for efficient queries
userSchema.index({ "details.location": "text", "details.interests": "text" })
userSchema.index({ isOnline: 1, lastActive: -1 })
userSchema.index({ email: 1, nickname: 1 })
userSchema.index({ accountTier: 1 })
userSchema.index({ "details.age": 1, "details.gender": 1 })

// Pre-save middleware to ensure username and other defaults are set
userSchema.pre("save", async function (next) {
  // Generate username if not set
  if (!this.username) {
    if (this.email) {
      this.username = this.email.split("@")[0]
    } else if (this.nickname) {
      this.username = this.nickname.toLowerCase().replace(/\s+/g, "_")
    } else {
      this.username = `user_${this._id.toString().slice(-6)}`
    }
  }

  // Set name if not provided
  if (!this.name) {
    this.name = this.nickname || this.username
  }

  // Use avatar as profilePicture if not set
  if (!this.profilePicture && this.avatar) {
    this.profilePicture = this.avatar
  }

  // Ensure details exists
  if (!this.details) {
    this.details = {}
  }

  // Default gender handling
  if (this.details.gender === undefined || this.details.gender === null) {
    this.details.gender = ""
  }

  // Set account tier if relevant fields have changed
  if (this.isModified("details.gender") || this.isModified("isPaid") || this.isModified("isCouple")) {
    this.setAccountTier()
  }

  // Reset daily likes if reset time has passed
  const now = new Date()
  if (this.dailyLikesReset && now >= this.dailyLikesReset) {
    this.dailyLikesRemaining = this.getMaxDailyLikes()
    this.dailyLikesReset = new Date(new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000)
  }

  // Update lastModifiedDate
  this.lastModifiedDate = Date.now()

  next()
})

// Instance methods

// Sets the account tier based on user properties
userSchema.methods.setAccountTier = function () {
  if (this.isCouple) {
    this.accountTier = "COUPLE"
  } else if (this.details.gender === "female") {
    this.accountTier = "FEMALE"
  } else if (this.isPaid) {
    this.accountTier = "PAID"
  } else {
    this.accountTier = "FREE"
  }
}

// Returns maximum daily likes for the user
userSchema.methods.getMaxDailyLikes = function () {
  switch (this.accountTier) {
    case "FREE":
      return 3
    case "PAID":
    case "FEMALE":
    case "COUPLE":
      return Number.POSITIVE_INFINITY // Unlimited likes
    default:
      return 3
  }
}

// Check if user can create a story
userSchema.methods.canCreateStory = function () {
  if (this.accountTier === "FREE") {
    if (!this.lastStoryCreated) return true
    const cooldownPeriod = 72 * 60 * 60 * 1000 // 72 hours
    const timeSinceLastStory = Date.now() - this.lastStoryCreated.getTime()
    return timeSinceLastStory >= cooldownPeriod
  }
  return true
}

// Check if user can send messages
userSchema.methods.canSendMessages = function () {
  return this.accountTier !== "FREE"
}

// Check if user has blocked another user
userSchema.methods.hasBlocked = function (userId) {
  return this.blockedUsers.some((id) => id.toString() === userId.toString())
}

// Pre-save middleware to hash password if modified
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    this.password = await bcrypt.hash(this.password, 12)
    if (this.isModified("password") && !this.isNew) {
      this.passwordChangedAt = Date.now() - 1000 // Ensures token is created after password change
    }
    next()
  } catch (error) {
    next(error)
  }
})

// Pre-find middleware to exclude inactive users
userSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } })
  next()
})

// Compare candidate password with stored hash
userSchema.methods.correctPassword = async (candidatePassword, userPassword) =>
  await bcrypt.compare(candidatePassword, userPassword)

// Check if password was changed after a JWT was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = Number.parseInt(this.passwordChangedAt.getTime() / 1000, 10)
    return JWTTimestamp < changedTimestamp
  }
  return false
}

// Create a password reset token and set its expiration
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex")
  this.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex")
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000 // 10 minutes
  return resetToken
}

// Create an email verification token and set its expiration
userSchema.methods.createVerificationToken = function () {
  const verificationToken = crypto.randomBytes(32).toString("hex")
  this.verificationToken = crypto.createHash("sha256").update(verificationToken).digest("hex")
  this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  return verificationToken
}

// Create a refresh token and set its expiration
userSchema.methods.createRefreshToken = function () {
  const refreshToken = crypto.randomBytes(40).toString("hex")
  this.refreshToken = crypto.createHash("sha256").update(refreshToken).digest("hex")
  this.refreshTokenExpires = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  return refreshToken
}

// Check if the account is currently locked
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now()
}

// Increment login attempts and lock the account if necessary
userSchema.methods.incrementLoginAttempts = async function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1
    this.lockUntil = undefined
  } else {
    this.loginAttempts += 1
    if (this.loginAttempts >= 5) {
      this.lockUntil = Date.now() + 60 * 60 * 1000 // 1 hour
    }
  }
  await this.save()
}

// Static method: find users by location with a regex search
userSchema.statics.findByLocation = async function (location, limit = 20) {
  return this.find({
    "details.location": { $regex: location, $options: "i" },
  })
    .select("nickname details.age details.gender details.location photos isOnline lastActive")
    .limit(limit)
}

// Static method: find users by interests
userSchema.statics.findByInterests = async function (interests, limit = 20) {
  const interestsArray = Array.isArray(interests) ? interests : interests.split(",").map((i) => i.trim())
  return this.find({
    "details.interests": { $in: interestsArray },
  })
    .select("nickname details.age details.gender details.location details.interests photos isOnline lastActive")
    .limit(limit)
}

// Static method: find online users with pagination
userSchema.statics.findOnlineUsers = async function (limit = 20, skip = 0) {
  return this.find({
    isOnline: true,
  })
    .select("nickname details.age details.gender details.location photos isOnline lastActive")
    .sort({ lastActive: -1 })
    .skip(skip)
    .limit(limit)
}

// Update password and increment version for token invalidation
userSchema.methods.updatePassword = async function (newPassword) {
  this.password = newPassword
  this.passwordChangedAt = Date.now()
  this.version = (this.version || 0) + 1
  return this.save()
}

// Generate a secure password reset link based on a base URL
userSchema.methods.generatePasswordResetLink = function (baseUrl) {
  const resetToken = this.createPasswordResetToken()
  return `${baseUrl}/reset-password?token=${resetToken}`
}

const User = model("User", userSchema)

export default User

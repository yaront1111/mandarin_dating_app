// models/Message.js - Enhanced with ES modules and improved structure
import mongoose from 'mongoose';
import sanitizeHtml from 'sanitize-html';
import logger from '../logger.js';

const { Schema, model, Types } = mongoose;

// Define attachment schema for media messages
const AttachmentSchema = new Schema({
  type: {
    type: String,
    enum: ['image', 'video', 'audio', 'file'],
    required: true
  },
  url: {
    type: String,
    required: true,
    trim: true
  },
  filename: {
    type: String,
    trim: true
  },
  size: {
    type: Number,
    min: 0,
    max: 10 * 1024 * 1024 // 10MB max file size
  },
  mimeType: {
    type: String,
    trim: true
  },
  metadata: {
    width: Number,
    height: Number,
    duration: Number, // for audio/video in seconds
    thumbnail: String
  },
  status: {
    type: String,
    enum: ['uploading', 'processing', 'ready', 'failed'],
    default: 'ready'
  }
});

// Define reaction schema for message reactions
const ReactionSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  emoji: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])$/.test(v) ||
               ['❤️', '👍', '👎', '😂', '😮', '😢', '😠'].includes(v);
      },
      message: 'Invalid emoji format'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Main Message Schema
const MessageSchema = new Schema({
  sender: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    // Removed 'location' from the list as location messages are no longer supported
    enum: ['text', 'wink', 'video', 'image', 'audio', 'file', 'contact', 'system'],
    default: 'text',
    index: true
  },
  content: {
    type: String,
    required: function() {
      return this.type === 'text';
    },
    maxlength: [2000, 'Message cannot exceed 2000 characters'],
    validate: {
      validator: function(v) {
        // Only validate for text messages
        if (this.type !== 'text') return true;
        return v && v.trim().length > 0;
      },
      message: 'Text messages cannot be empty'
    }
  },
  attachment: AttachmentSchema,
  read: {
    type: Boolean,
    default: false,
    index: true // Index for querying unread messages
  },
  readAt: {
    type: Date,
    default: null
  },
  // Delivery status tracking
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'failed'],
    default: 'sent',
    index: true
  },
  statusUpdatedAt: {
    type: Date,
    default: Date.now
  },
  // Message flags
  isEdited: {
    type: Boolean,
    default: false
  },
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Soft delete functionality
  deletedBySender: {
    type: Boolean,
    default: false
  },
  deletedByRecipient: {
    type: Boolean,
    default: false
  },
  // For messages that expire after being read
  expiresAfterRead: {
    type: Boolean,
    default: false
  },
  expiryTime: {
    type: Number, // in seconds after being read
    default: null
  },
  // For system messages, which user initiated the event
  initiatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  // For forwarded messages
  isForwarded: {
    type: Boolean,
    default: false
  },
  originalMessage: {
    type: Schema.Types.ObjectId,
    ref: 'Message'
  },
  // Message reactions (likes, etc)
  reactions: [ReactionSchema],
  // Additional metadata
  metadata: {
    clientMessageId: {
      type: String, // For client-side message handling
      index: true
    },
    // Contact info for sharing contacts
    contact: {
      name: String,
      phone: String,
      email: String
    }
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true // Important for conversation retrieval
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create compound indexes for efficient querying
MessageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
MessageSchema.index({ sender: 1, recipient: 1, read: 1 });
MessageSchema.index({ sender: 1, recipient: 1, read: 1, createdAt: -1 });
MessageSchema.index({ deletedBySender: 1, deletedByRecipient: 1 });

// Define a virtual for conversation ID (for grouping)
MessageSchema.virtual('conversationId').get(function() {
  const ids = [this.sender.toString(), this.recipient.toString()].sort();
  return ids.join('_');
});

// Middleware to sanitize text content before saving
MessageSchema.pre('save', function(next) {
  if (this.isModified('content') && this.type === 'text' && this.content) {
    try {
      this.content = sanitizeHtml(this.content, {
        allowedTags: [],
        allowedAttributes: {},
        disallowedTagsMode: 'discard'
      });
      this.content = this.content.trim().substring(0, 2000);
    } catch (error) {
      logger.error(`Error sanitizing message content: ${error.message}`);
    }
  }
  if (this.isModified('read') && this.read && !this.readAt) {
    this.readAt = new Date();
  }
  if (this.isModified('status')) {
    this.statusUpdatedAt = new Date();
  }
  next();
});

// Static method to get conversation between two users
MessageSchema.statics.getConversation = async function(user1Id, user2Id, options = {}) {
  const { page = 1, limit = 50, includeDeleted = false } = options;

  // Ensure we have valid ObjectIds
  const u1 = typeof user1Id === 'string' ? Types.ObjectId(user1Id) : user1Id;
  const u2 = typeof user2Id === 'string' ? Types.ObjectId(user2Id) : user2Id;

  const query = {
    $or: [
      { sender: u1, recipient: u2 },
      { sender: u2, recipient: u1 }
    ]
  };

  if (!includeDeleted) {
    query.$or = query.$or.map(condition => {
      if (condition.sender.toString() === u1.toString()) {
        return { ...condition, deletedBySender: false };
      } else {
        return { ...condition, deletedByRecipient: false };
      }
    });
  }

  try {
    const messages = await this.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await this.countDocuments(query);

    return {
      messages,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error(`Error retrieving conversation: ${error.message}`);
    throw error;
  }
};

// Static method to mark messages as read
MessageSchema.statics.markAsRead = async function(recipientId, senderId) {
  try {
    const result = await this.updateMany(
      {
        sender: senderId,
        recipient: recipientId,
        read: false
      },
      {
        read: true,
        readAt: new Date()
      }
    );
    return result.modifiedCount;
  } catch (error) {
    logger.error(`Error marking messages as read: ${error.message}`);
    throw error;
  }
};

// Static method to get unread count by sender
MessageSchema.statics.getUnreadCountBySender = async function(recipientId) {
  try {
    return this.aggregate([
      {
        $match: {
          recipient: Types.ObjectId(recipientId),
          read: false,
          deletedByRecipient: false
        }
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 },
          lastMessage: { $max: '$createdAt' }
        }
      },
      {
        $sort: { lastMessage: -1 }
      }
    ]);
  } catch (error) {
    logger.error(`Error getting unread count: ${error.message}`);
    throw error;
  }
};

// Method to mark a message as edited
MessageSchema.methods.editMessage = async function(newContent) {
  if (this.type !== 'text') {
    throw new Error('Only text messages can be edited');
  }
  if (!this.editHistory) this.editHistory = [];
  this.editHistory.push({
    content: this.content,
    editedAt: new Date()
  });
  this.content = sanitizeHtml(newContent, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard'
  }).trim().substring(0, 2000);
  this.isEdited = true;
  return this.save();
};

// Method to add a reaction to a message
MessageSchema.methods.addReaction = async function(userId, emoji) {
  const existingReaction = this.reactions.find(
    r => r.user.toString() === userId.toString()
  );
  if (existingReaction) {
    existingReaction.emoji = emoji;
    existingReaction.createdAt = new Date();
  } else {
    this.reactions.push({
      user: userId,
      emoji,
      createdAt: new Date()
    });
  }
  return this.save();
};

// Method to remove a reaction
MessageSchema.methods.removeReaction = async function(userId) {
  this.reactions = this.reactions.filter(
    r => r.user.toString() !== userId.toString()
  );
  return this.save();
};

// Method to mark a message as deleted for a user
MessageSchema.methods.markAsDeletedFor = async function(userId, mode = 'self') {
  const isSender = this.sender.toString() === userId.toString();
  const isRecipient = this.recipient.toString() === userId.toString();

  if (!isSender && !isRecipient) {
    throw new Error('User is not authorized to delete this message');
  }

  if (mode === 'self') {
    if (isSender) {
      this.deletedBySender = true;
    }
    if (isRecipient) {
      this.deletedByRecipient = true;
    }
  } else if (mode === 'both' && isSender) {
    this.deletedBySender = true;
    this.deletedByRecipient = true;
  } else {
    throw new Error('Invalid delete mode or unauthorized action');
  }

  if (this.deletedBySender && this.deletedByRecipient) {
    return model('Message').deleteOne({ _id: this._id });
  }

  return this.save();
};

// Method to check if the message should be hidden from a user
MessageSchema.methods.isHiddenFrom = function(userId) {
  const isSender = this.sender.toString() === userId.toString();
  const isRecipient = this.recipient.toString() === userId.toString();

  if (isSender && this.deletedBySender) return true;
  if (isRecipient && this.deletedByRecipient) return true;

  return false;
};

// Create the Message model
const Message = model('Message', MessageSchema);

export default Message;

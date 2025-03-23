// server/socket/socketHandlers.js
import { Message, User } from "../models/index.js";
import logger from "../logger.js";
import mongoose from "mongoose";

/**
 * Handle user disconnect.
 * Removes the socket from the user connections map and, if no more sockets remain,
 * updates the user’s status in the database and notifies others.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} socket - The disconnecting socket.
 * @param {Map<string, Set<string>>} userConnections - Map of userId to active socket IDs.
 */
const handleUserDisconnect = async (io, socket, userConnections) => {
  try {
    logger.info(`Socket ${socket.id} disconnected`);
    if (socket.user && socket.user._id) {
      const userId = socket.user._id.toString();
      if (userConnections.has(userId)) {
        userConnections.get(userId).delete(socket.id);
        if (userConnections.get(userId).size === 0) {
          userConnections.delete(userId);
          // Update user status in database
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastActive: Date.now(),
          });
          // Notify other users that this user is offline
          io.emit("userOffline", { userId, timestamp: Date.now() });
          logger.info(`User ${userId} is now offline (no active connections)`);
        } else {
          logger.info(`User ${userId} still has ${userConnections.get(userId).size} active connection(s)`);
        }
      }
    }
  } catch (error) {
    logger.error(`Error handling disconnect for socket ${socket.id}: ${error.message}`);
  }
};

/**
 * Send a message notification.
 * Notifies the recipient (via socket if online) and attempts to store a notification in the database.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} sender - Sender user object.
 * @param {Object} recipient - Recipient user object.
 * @param {Object} message - Message object.
 */
const sendMessageNotification = async (io, sender, recipient, message) => {
  try {
    const recipientUser = await User.findById(recipient._id).select("settings socketId");
    if (recipientUser?.settings?.notifications?.messages !== false) {
      if (recipientUser?.socketId) {
        io.to(recipientUser.socketId).emit("new_message", {
          sender,
          message,
          timestamp: new Date(),
        });
      }
      try {
        const Notification =
          mongoose.models.Notification ||
          (await import("../models/Notification.js")).default;
        if (Notification) {
          await Notification.create({
            recipient: recipient._id,
            type: "message",
            sender: sender._id,
            content: message.content,
            reference: message._id,
          });
        }
      } catch (notificationError) {
        logger.debug(`Notification saving skipped: ${notificationError.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error sending message notification: ${error.message}`);
  }
};

/**
 * Send a like notification.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} sender - Sender user object.
 * @param {Object} recipient - Recipient user object.
 * @param {Object} likeData - Data related to the like.
 * @param {Map<string, Set<string>>} userConnections - Map of user connections.
 */
const sendLikeNotification = async (io, sender, recipient, likeData, userConnections) => {
  try {
    const recipientUser = await User.findById(recipient._id).select("settings");
    if (recipientUser?.settings?.notifications?.likes !== false) {
      if (userConnections.has(recipient._id.toString())) {
        userConnections.get(recipient._id.toString()).forEach((socketId) => {
          io.to(socketId).emit("new_like", {
            sender: {
              _id: sender._id,
              nickname: sender.nickname,
              photos: sender.photos,
            },
            timestamp: new Date(),
            ...likeData,
          });
        });
      }
      try {
        const Notification =
          mongoose.models.Notification ||
          (await import("../models/Notification.js")).default;
        if (Notification) {
          await Notification.create({
            recipient: recipient._id,
            type: "like",
            sender: sender._id,
            content: `${sender.nickname} liked your profile`,
            reference: likeData._id,
          });
        }
      } catch (notificationError) {
        logger.debug(`Notification saving skipped: ${notificationError.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error sending like notification: ${error.message}`);
  }
};

/**
 * Send a photo permission request notification.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} requester - User requesting permission.
 * @param {Object} owner - Photo owner.
 * @param {Object} permissionData - Permission request data.
 * @param {Map<string, Set<string>>} userConnections - Map of user connections.
 */
const sendPhotoPermissionRequestNotification = async (io, requester, owner, permissionData, userConnections) => {
  try {
    const photoOwner = await User.findById(owner._id).select("settings");
    if (photoOwner?.settings?.notifications?.photoRequests !== false) {
      if (userConnections.has(owner._id.toString())) {
        userConnections.get(owner._id.toString()).forEach((socketId) => {
          io.to(socketId).emit("photo_permission_request", {
            requester: {
              _id: requester._id,
              nickname: requester.nickname,
              photos: requester.photos,
            },
            photoId: permissionData.photo,
            permissionId: permissionData._id,
            timestamp: new Date(),
          });
        });
      }
      try {
        const Notification =
          mongoose.models.Notification ||
          (await import("../models/Notification.js")).default;
        if (Notification) {
          await Notification.create({
            recipient: owner._id,
            type: "photoRequest",
            sender: requester._id,
            content: `${requester.nickname} requested access to your private photo`,
            reference: permissionData._id,
          });
        }
      } catch (notificationError) {
        logger.debug(`Notification saving skipped: ${notificationError.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error sending photo permission request notification: ${error.message}`);
  }
};

/**
 * Send a photo permission response notification.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} owner - Photo owner.
 * @param {Object} requester - User who requested permission.
 * @param {Object} permissionData - Permission response data.
 * @param {Map<string, Set<string>>} userConnections - Map of user connections.
 */
const sendPhotoPermissionResponseNotification = async (io, owner, requester, permissionData, userConnections) => {
  try {
    const photoRequester = await User.findById(requester._id).select("settings");
    if (photoRequester?.settings?.notifications?.photoRequests !== false) {
      if (userConnections.has(requester._id.toString())) {
        userConnections.get(requester._id.toString()).forEach((socketId) => {
          io.to(socketId).emit("photo_permission_response", {
            owner: {
              _id: owner._id,
              nickname: owner.nickname,
              photos: owner.photos,
            },
            photoId: permissionData.photo,
            permissionId: permissionData._id,
            status: permissionData.status,
            timestamp: new Date(),
          });
        });
      }
      try {
        const Notification =
          mongoose.models.Notification ||
          (await import("../models/Notification.js")).default;
        if (Notification) {
          const action = permissionData.status === "approved" ? "approved" : "rejected";
          await Notification.create({
            recipient: requester._id,
            type: "photoResponse",
            sender: owner._id,
            content: `${owner.nickname} ${action} your photo request`,
            reference: permissionData._id,
          });
        }
      } catch (notificationError) {
        logger.debug(`Notification saving skipped: ${notificationError.message}`);
      }
    }
  } catch (error) {
    logger.error(`Error sending photo permission response notification: ${error.message}`);
  }
};

/**
 * Register all socket event handlers.
 * Also fixes video call events by sending "callInitiated" to both caller and recipient.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} socket - Socket connection.
 * @param {Map<string, Set<string>>} userConnections - Map of user connections.
 * @param {Object} rateLimiters - Rate limiters for various actions.
 */
const registerSocketHandlers = (io, socket, userConnections, rateLimiters) => {
  const { typingLimiter, messageLimiter, callLimiter } = rateLimiters;

  // Handle ping (heartbeat)
  socket.on("ping", () => {
    try {
      socket.emit("pong");
    } catch (error) {
      logger.error(`Error handling ping from ${socket.id}: ${error.message}`);
    }
  });

  // Handle disconnect using the consolidated function
  socket.on("disconnect", async (reason) => {
    try {
      await handleUserDisconnect(io, socket, userConnections);
      logger.debug(`Disconnect reason: ${reason}`);
    } catch (error) {
      logger.error(`Error in disconnect event: ${error.message}`);
    }
  });

  // Handle sending messages
  socket.on("sendMessage", async (data) => {
    try {
      const { recipientId, type, content, metadata, tempMessageId } = data;

      // Apply rate limiting for message sending
      try {
        await messageLimiter.consume(socket.user._id.toString());
      } catch (rateLimitError) {
        logger.warn(`Rate limit exceeded for user ${socket.user._id} message sending`);
        socket.emit("messageError", {
          error: "Rate limit exceeded. Please try again later.",
          tempMessageId,
        });
        return;
      }

      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        socket.emit("messageError", {
          error: "Invalid recipient ID",
          tempMessageId,
        });
        return;
      }

      const recipient = await User.findById(recipientId);
      if (!recipient) {
        socket.emit("messageError", {
          error: "Recipient not found",
          tempMessageId,
        });
        return;
      }

      const user = await User.findById(socket.user._id);
      if (type !== "wink" && !user.canSendMessages()) {
        socket.emit("messageError", {
          error: "Free accounts can only send winks. Upgrade to send messages.",
          tempMessageId,
        });
        return;
      }

      const message = new Message({
        sender: socket.user._id,
        recipient: recipientId,
        type,
        content,
        metadata,
        read: false,
        createdAt: new Date(),
      });
      await message.save();

      const messageResponse = {
        _id: message._id,
        sender: socket.user._id,
        recipient: recipientId,
        type,
        content,
        metadata,
        createdAt: message.createdAt,
        read: false,
        tempMessageId,
      };

      // Confirm message to sender
      socket.emit("messageSent", messageResponse);

      // Deliver message to recipient if online
      if (userConnections.has(recipientId)) {
        userConnections.get(recipientId).forEach((recipientSocketId) => {
          io.to(recipientSocketId).emit("messageReceived", messageResponse);
        });
      }

      // Send message notification
      sendMessageNotification(io, socket.user, recipient, messageResponse);
      logger.info(`Message sent from ${socket.user._id} to ${recipientId}`);
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);
      socket.emit("messageError", {
        error: "Failed to send message",
        tempMessageId: data?.tempMessageId,
      });
    }
  });

  // Handle typing indicator
  socket.on("typing", async (data) => {
    try {
      const { recipientId } = data;
      try {
        await typingLimiter.consume(socket.user._id.toString());
      } catch (rateLimitError) {
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(recipientId)) return;
      if (userConnections.has(recipientId)) {
        userConnections.get(recipientId).forEach((recipientSocketId) => {
          io.to(recipientSocketId).emit("userTyping", {
            userId: socket.user._id,
            timestamp: Date.now(),
          });
        });
      }
    } catch (error) {
      logger.error(`Error handling typing indicator: ${error.message}`);
    }
  });

  // Handle initiating calls – send "callInitiated" to both caller and recipient.
  socket.on("initiateVideoCall", async (data) => {
    try {
      const { recipientId } = data;
      try {
        await callLimiter.consume(socket.user._id.toString());
      } catch (rateLimitError) {
        socket.emit("callError", { error: "Rate limit exceeded. Please try again later." });
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        socket.emit("callError", { error: "Invalid recipient ID" });
        return;
      }
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        socket.emit("callError", { error: "Recipient not found" });
        return;
      }
      if (!userConnections.has(recipientId)) {
        socket.emit("callError", { error: "Recipient is offline" });
        return;
      }
      const callData = {
        callId: new mongoose.Types.ObjectId().toString(),
        caller: {
          userId: socket.user._id,
          name: socket.user.name,
          avatar: socket.user.avatar,
        },
        recipient: {
          userId: recipientId,
        },
        timestamp: Date.now(),
      };
      // For production, send the same "callInitiated" event to the recipient
      userConnections.get(recipientId).forEach((recipientSocketId) => {
        io.to(recipientSocketId).emit("callInitiated", callData);
      });
      // Also send confirmation to the caller
      socket.emit("callInitiated", callData);
      logger.info(`Call initiated from ${socket.user._id} to ${recipientId}`);
    } catch (error) {
      logger.error(`Error initiating call: ${error.message}`);
      socket.emit("callError", { error: "Failed to initiate call" });
    }
  });

  // Handle answering calls
  socket.on("answerCall", async (data) => {
    try {
      const { callerId, accept } = data;
      if (!mongoose.Types.ObjectId.isValid(callerId)) {
        socket.emit("callError", { error: "Invalid caller ID" });
        return;
      }
      const caller = await User.findById(callerId);
      if (!caller) {
        socket.emit("callError", { error: "Caller not found" });
        return;
      }
      if (!userConnections.has(callerId)) {
        socket.emit("callError", { error: "Caller is no longer online" });
        return;
      }
      const callData = {
        respondent: {
          userId: socket.user._id,
          name: socket.user.name,
          avatar: socket.user.avatar,
        },
        accepted: accept,
        timestamp: Date.now(),
      };
      userConnections.get(callerId).forEach((callerSocketId) => {
        io.to(callerSocketId).emit("callAnswered", callData);
      });
      socket.emit("callAnswered", callData);
      logger.info(`Call from ${callerId} ${accept ? "accepted" : "rejected"} by ${socket.user._id}`);
    } catch (error) {
      logger.error(`Error answering call: ${error.message}`);
      socket.emit("callError", { error: "Failed to answer call" });
    }
  });

  // Broadcast user online status upon connection
  io.emit("userOnline", {
    userId: socket.user._id.toString(),
    timestamp: Date.now(),
  });

  logger.info(`Socket handlers registered for user ${socket.user._id}`);
};

export {
  registerSocketHandlers,
  sendMessageNotification,
  handleUserDisconnect,
  sendLikeNotification,
  sendPhotoPermissionRequestNotification,
  sendPhotoPermissionResponseNotification,
};

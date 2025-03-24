/**
 * socketHandlers.prod.js
 *
 * Production–ready Socket.IO event handlers for user notifications, messaging,
 * call events, and photo permission events. Each function includes robust error
 * handling, logging, and modular notifications using a shared userConnections map.
 */

import { Message, User } from "../models/index.js";
import mongoose from "mongoose";
import logger from "../logger.js";

/**
 * Handles user disconnect:
 * - Removes the socket from the active connections map.
 * - Updates the user's online status if no connections remain.
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
          await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastActive: Date.now(),
          });
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
 * Sends a message notification:
 * - Emits a "new_message" event to the recipient's socket.
 * - Attempts to save a notification in the database.
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
 * Sends a like notification:
 * - Emits a "new_like" event to all active sockets of the recipient.
 * - Persists a notification record to the database.
 */
const sendLikeNotification = async (io, sender, recipient, likeData, userConnections) => {
  try {
    const recipientUser = await User.findById(recipient._id).select("settings");
    if (recipientUser?.settings?.notifications?.likes !== false) {
      const recipientId = recipient._id.toString();
      if (userConnections && userConnections.has(recipientId)) {
        const socketIds = Array.from(userConnections.get(recipientId));
        socketIds.forEach((socketId) => {
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
      } else if (recipient.socketId) {
        io.to(recipient.socketId).emit("new_like", {
          sender: {
            _id: sender._id,
            nickname: sender.nickname,
            photos: sender.photos,
          },
          timestamp: new Date(),
          ...likeData,
        });
      }
      try {
        const Notification =
          mongoose.models.Notification ||
          (await import("../models/Notification.js")).default;
        if (Notification) {
          const notification = await Notification.create({
            recipient: recipient._id,
            type: "like",
            sender: sender._id,
            content: `${sender.nickname} liked your profile`,
            reference: likeData._id,
          });
          logger.debug(`Created like notification in database: ${notification._id}`);
        }
      } catch (notificationError) {
        logger.error(`Error creating like notification: ${notificationError.message}`);
      }
    } else {
      logger.debug(`Like notifications disabled for user ${recipient._id}`);
    }
  } catch (error) {
    logger.error(`Error sending like notification: ${error.message}`);
  }
};

/**
 * Sends a photo permission request notification:
 * - Emits "photo_permission_request" events to the photo owner's sockets.
 * - Creates a corresponding notification in the database.
 */
const sendPhotoPermissionRequestNotification = async (io, requester, owner, permissionData, userConnections) => {
  try {
    const photoOwner = await User.findById(owner._id).select("settings socketId");
    if (photoOwner?.settings?.notifications?.photoRequests !== false) {
      const ownerId = owner._id.toString();
      if (userConnections && userConnections.has(ownerId)) {
        const socketIds = Array.from(userConnections.get(ownerId));
        socketIds.forEach((socketId) => {
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
      } else if (photoOwner.socketId) {
        io.to(photoOwner.socketId).emit("photo_permission_request", {
          requester: {
            _id: requester._id,
            nickname: requester.nickname,
            photos: requester.photos,
          },
          photoId: permissionData.photo,
          permissionId: permissionData._id,
          timestamp: new Date(),
        });
      }
      try {
        const Notification =
          mongoose.models.Notification ||
          (await import("../models/Notification.js")).default;
        if (Notification) {
          const notification = await Notification.create({
            recipient: owner._id,
            type: "photoRequest",
            sender: requester._id,
            content: `${requester.nickname} requested access to your private photo`,
            reference: permissionData._id,
          });
          logger.debug(`Created photo request notification: ${notification._id}`);
        }
      } catch (notificationError) {
        logger.error(`Error creating photo request notification: ${notificationError.message}`);
      }
    } else {
      logger.debug(`Photo request notifications disabled for user ${owner._id}`);
    }
  } catch (error) {
    logger.error(`Error sending photo permission request notification: ${error.message}`);
  }
};

/**
 * Sends a photo permission response notification:
 * - Emits "photo_permission_response" events to the requester.
 * - Persists a notification record if applicable.
 */
const sendPhotoPermissionResponseNotification = async (io, owner, requester, permissionData, userConnections) => {
  try {
    const photoRequester = await User.findById(requester._id).select("settings socketId");
    if (photoRequester?.settings?.notifications?.photoRequests !== false) {
      const requesterId = requester._id.toString();
      if (userConnections && userConnections.has(requesterId)) {
        userConnections.get(requesterId).forEach((socketId) => {
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
      } else if (photoRequester.socketId) {
        io.to(photoRequester.socketId).emit("photo_permission_response", {
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
 * Registers all socket event handlers.
 * Handles events for messaging, calls, typing indicators, and incoming/outgoing call flows.
 */
const registerSocketHandlers = (io, socket, userConnections, rateLimiters) => {
  const { typingLimiter, messageLimiter, callLimiter } = rateLimiters;

  // Handle heartbeat ping/pong
  socket.on("ping", () => {
    try {
      socket.emit("pong");
    } catch (error) {
      logger.error(`Error handling ping from ${socket.id}: ${error.message}`);
    }
  });

  // Disconnect handler
  socket.on("disconnect", async (reason) => {
    try {
      await handleUserDisconnect(io, socket, userConnections);
      logger.debug(`Disconnect reason: ${reason}`);
    } catch (error) {
      logger.error(`Error in disconnect event: ${error.message}`);
    }
  });

  // Message sending
  socket.on("sendMessage", async (data) => {
    try {
      const { recipientId, type, content, metadata, tempMessageId } = data;
      try {
        await messageLimiter.consume(socket.user._id.toString());
      } catch (rateLimitError) {
        socket.emit("messageError", {
          error: "Rate limit exceeded. Please try again later.",
          tempMessageId,
        });
        return;
      }
      if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        socket.emit("messageError", { error: "Invalid recipient ID", tempMessageId });
        return;
      }
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        socket.emit("messageError", { error: "Recipient not found", tempMessageId });
        return;
      }
      const user = await User.findById(socket.user._id);
      if (type !== "wink" && !user.canSendMessages()) {
        socket.emit("messageError", { error: "Free accounts can only send winks. Upgrade to send messages.", tempMessageId });
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

      // Confirm message sent to sender
      socket.emit("messageSent", messageResponse);

      // Deliver message to recipient if online
      if (userConnections.has(recipientId)) {
        userConnections.get(recipientId).forEach((recipientSocketId) => {
          io.to(recipientSocketId).emit("messageReceived", messageResponse);
        });
      }

      // Send a message notification
      sendMessageNotification(io, socket.user, recipient, messageResponse);
      logger.info(`Message sent from ${socket.user._id} to ${recipientId}`);
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);
      socket.emit("messageError", { error: "Failed to send message", tempMessageId: data?.tempMessageId });
    }
  });

  // Typing indicator
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
          io.to(recipientSocketId).emit("userTyping", { userId: socket.user._id, timestamp: Date.now() });
        });
      }
    } catch (error) {
      logger.error(`Error handling typing indicator: ${error.message}`);
    }
  });

  // Initiate a video call
  socket.on("initiateVideoCall", async (data) => {
    try {
      const { recipientId, callerPeerId } = data;
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
        caller: socket.user._id.toString(),
        recipient: recipientId,
        callerName: socket.user.nickname || socket.user.name || "User",
        recipientName: recipient.nickname || recipient.name || "User",
        callerPeerId,
        timestamp: Date.now(),
      };
      userConnections.get(recipientId).forEach((recipientSocketId) => {
        io.to(recipientSocketId).emit("incomingCall", callData);
      });
      socket.emit("callInitiated", callData);
      logger.info(`Call initiated from ${socket.user._id} to ${recipientId}`);
    } catch (error) {
      logger.error(`Error initiating call: ${error.message}`);
      socket.emit("callError", { error: "Failed to initiate call" });
    }
  });

  // Answer a video call
  socket.on("answerCall", async (data) => {
    try {
      const { callerId, accept, respondentPeerId } = data;
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
      if (accept) {
        const callData = {
          callId: new mongoose.Types.ObjectId().toString(),
          caller: callerId,
          recipient: socket.user._id.toString(),
          callerName: caller.nickname || caller.name || "User",
          recipientName: socket.user.nickname || socket.user.name || "User",
          respondentPeerId,
          accepted: true,
          timestamp: Date.now(),
        };
        userConnections.get(callerId).forEach((callerSocketId) => {
          io.to(callerSocketId).emit("callAnswered", callData);
        });
        socket.emit("callAnswered", callData);
      } else {
        const rejectData = {
          callerId,
          recipientId: socket.user._id.toString(),
          callerName: caller.nickname || caller.name || "User",
          recipientName: socket.user.nickname || socket.user.name || "User",
          rejected: true,
          timestamp: Date.now(),
        };
        userConnections.get(callerId).forEach((callerSocketId) => {
          io.to(callerSocketId).emit("callRejected", rejectData);
        });
        socket.emit("callRejected", rejectData);
      }
      logger.info(`Call from ${callerId} ${accept ? "accepted" : "rejected"} by ${socket.user._id}`);
    } catch (error) {
      logger.error(`Error answering call: ${error.message}`);
      socket.emit("callError", { error: "Failed to answer call" });
    }
  });

  // End a call
  socket.on("endCall", async (data) => {
    try {
      const { userId } = data;
      if (!mongoose.Types.ObjectId.isValid(userId)) return;
      if (userConnections.has(userId)) {
        userConnections.get(userId).forEach((socketId) => {
          io.to(socketId).emit("callEnded", {
            endedBy: socket.user._id.toString(),
            timestamp: Date.now(),
          });
        });
      }
      socket.emit("callEnded", {
        endedBy: socket.user._id.toString(),
        timestamp: Date.now(),
      });
      logger.info(`Call ended by ${socket.user._id}`);
    } catch (error) {
      logger.error(`Error ending call: ${error.message}`);
    }
  });

  // Broadcast online status
  io.emit("userOnline", { userId: socket.user._id.toString(), timestamp: Date.now() });
  logger.info(`Socket handlers registered for user ${socket.user._id}`);

  // Alternate handler for incoming call answers (ensuring string comparisons for ObjectIDs)
  socket.on("incomingCall", async (data) => {
    try {
      const { callerId, callerPeerId, accept, respondentPeerId } = data;
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
      if (accept) {
        const callData = {
          callId: new mongoose.Types.ObjectId().toString(),
          caller: callerId,
          recipient: socket.user._id.toString(),
          callerName: caller.nickname || caller.name || "User",
          recipientName: socket.user.nickname || socket.user.name || "User",
          respondentPeerId,
          accepted: true,
          timestamp: Date.now(),
        };
        userConnections.get(callerId).forEach((callerSocketId) => {
          io.to(callerSocketId).emit("callAnswered", callData);
        });
        socket.emit("callAnswered", callData);
      } else {
        const rejectData = {
          callerId,
          recipientId: socket.user._id.toString(),
          callerName: caller.nickname || caller.name || "User",
          recipientName: socket.user.nickname || socket.user.name || "User",
          rejected: true,
          timestamp: Date.now(),
        };
        userConnections.get(callerId).forEach((callerSocketId) => {
          io.to(callerSocketId).emit("callRejected", rejectData);
        });
        socket.emit("callRejected", rejectData);
      }
      logger.info(`Call from ${callerId} ${accept ? "accepted" : "rejected"} by ${socket.user._id}`);
    } catch (error) {
      logger.error(`Error in incomingCall handler: ${error.message}`);
      socket.emit("callError", { error: "Failed to process incoming call" });
    }
  });
};

export {
  registerSocketHandlers,
  sendMessageNotification,
  handleUserDisconnect,
  sendLikeNotification,
  sendPhotoPermissionRequestNotification,
  sendPhotoPermissionResponseNotification,
};

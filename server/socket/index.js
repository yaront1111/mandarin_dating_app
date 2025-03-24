// server/socket/index.js
import { Server } from "socket.io"
import logger from "../logger.js"
import socketAuth from "./socketAuth.js"
import { User } from "../models/index.js"
import initializePeerServer from "../peerServer.js"

/**
 * Initialize Socket.IO server with enhanced video call support.
 *
 * @param {Object} server - HTTP server instance.
 * @returns {Object} Socket.IO server instance.
 */
const initSocketServer = async (server) => {
  try {
    // Initialize PeerJS server for WebRTC connections
    try {
      const peerServer = initializePeerServer(server)
      logger.info("PeerJS server initialized successfully")
    } catch (peerError) {
      logger.error(`Failed to initialize PeerJS server: ${peerError.message}`)
    }

    // Determine allowed origins based on environment
    const isDev = process.env.NODE_ENV !== "production"
    const allowedOrigins = isDev
      ? ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5000", "http://127.0.0.1:5000"]
      : process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",")
        : [process.env.FRONTEND_URL || "https://yourdomain.com"]

    logger.info(`Socket.IO configured with allowed origins: ${JSON.stringify(allowedOrigins)}`)

    // Create Socket.IO server with optimized configuration
    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin) || isDev) {
            callback(null, true)
          } else {
            logger.warn(`Socket.IO CORS rejected for origin: ${origin}`)
            callback(new Error("Not allowed by CORS"), false)
          }
        },
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      pingInterval: 25000,
      pingTimeout: 60000,
      connectTimeout: 30000,
      maxHttpBufferSize: 1e6, // 1MB
      path: "/socket.io",
    })

    // Map to track user connections (userId -> Set of socket IDs)
    const userConnections = new Map()

    // Map to track active calls (callId -> call data)
    const activeCalls = new Map()

    // Socket middleware for authentication
    io.use((socket, next) => socketAuth(socket, next, userConnections))

    // Socket connection event
    io.on("connection", (socket) => {
      if (!socket.user) {
        logger.warn(`Socket ${socket.id} connected without valid user, disconnecting`)
        socket.disconnect(true)
        return
      }

      const userId = socket.user._id.toString()
      logger.info(`Socket connected: ${socket.id} for user ${userId}`)

      // Update user's online status
      User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastActive: Date.now(),
      }).catch(err => logger.error(`Error updating user online status: ${err.message}`))

      // Notify other users that this user is online
      socket.broadcast.emit("userOnline", {
        userId: userId,
        timestamp: Date.now()
      })

      // Join user's room for direct messages
      socket.join(userId)

      // Handle user typing indicator
      socket.on("typing", ({ recipientId }) => {
        if (!recipientId) return

        // Emit typing event to recipient
        io.to(recipientId).emit("userTyping", {
          userId: userId,
          timestamp: Date.now()
        })
      })

      // Handle sending messages
      socket.on("sendMessage", async (data) => {
        try {
          const { recipientId, type, content, metadata, tempMessageId } = data

          if (!recipientId) {
            socket.emit("messageError", {
              tempMessageId,
              message: "Recipient ID is required"
            })
            return
          }

          // Create message object
          const messageData = {
            _id: tempMessageId || `msg_${Date.now()}`,
            sender: userId,
            recipient: recipientId,
            type,
            content,
            metadata,
            createdAt: new Date().toISOString(),
            read: false
          }

          // Emit message to sender for immediate feedback
          socket.emit("messageSent", messageData)

          // Emit message to recipient if online
          io.to(recipientId).emit("newMessage", messageData)

          // Update last activity timestamp
          User.findByIdAndUpdate(userId, {
            lastActive: Date.now()
          }).catch(err => logger.error(`Error updating user activity: ${err.message}`))
        } catch (error) {
          logger.error(`Error sending message: ${error.message}`)
          socket.emit("messageError", {
            tempMessageId: data.tempMessageId,
            message: "Failed to send message"
          })
        }
      })

      // Handle video call initiation
      socket.on("initiateVideoCall", async (data) => {
        try {
          const { recipientId, callerPeerId } = data

          if (!recipientId) {
            socket.emit("callError", { message: "Recipient ID is required" })
            return
          }

          // Check if recipient is online
          if (!userConnections.has(recipientId)) {
            socket.emit("callError", { message: "User is offline" })
            return
          }

          // Generate unique call ID
          const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

          // Create call data
          const callData = {
            callId,
            caller: userId,
            callerName: socket.user.username || socket.user.name || "User",
            callerPeerId,
            recipient: recipientId,
            initiated: Date.now(),
            status: "ringing"
          }

          // Store call data
          activeCalls.set(callId, callData)

          // Emit call initiated event to caller
          socket.emit("callInitiated", callData)

          // Emit incoming call event to recipient
          io.to(recipientId).emit("incomingCall", callData)

          // Set timeout to automatically end call if not answered
          setTimeout(() => {
            const call = activeCalls.get(callId)
            if (call && call.status === "ringing") {
              activeCalls.set(callId, { ...call, status: "missed" })

              // Notify caller that call was missed
              io.to(userId).emit("callEnded", {
                callId,
                reason: "no_answer"
              })

              // Notify recipient that call was missed
              io.to(recipientId).emit("callMissed", {
                callId
              })

              // Remove call data after a delay
              setTimeout(() => {
                activeCalls.delete(callId)
              }, 60000) // Keep missed call data for 1 minute
            }
          }, 30000) // Ring for 30 seconds

          logger.info(`Call initiated: ${callId} from ${userId} to ${recipientId}`)
        } catch (error) {
          logger.error(`Error initiating call: ${error.message}`)
          socket.emit("callError", { message: "Failed to initiate call" })
        }
      })

      // Handle call answer
      socket.on("answerCall", async (data) => {
        try {
          const { callerId, accept, respondentPeerId } = data

          // Find active calls where this user is the recipient and the specified caller is the caller
          const activeCall = Array.from(activeCalls.values()).find(
            call => call.caller === callerId && call.recipient === userId && call.status === "ringing"
          )

          if (!activeCall) {
            socket.emit("callError", { message: "Call not found or already ended" })
            return
          }

          const callId = activeCall.callId

          if (accept) {
            // Update call status
            activeCalls.set(callId, {
              ...activeCall,
              status: "connected",
              respondentPeerId,
              answeredAt: Date.now()
            })

            // Notify caller that call was accepted
            io.to(callerId).emit("callAnswered", {
              ...activeCall,
              status: "connected",
              respondentPeerId,
              accepted: true
            })

            // Notify recipient that call was connected
            socket.emit("callAnswered", {
              ...activeCall,
              status: "connected",
              respondentPeerId,
              accepted: true
            })

            logger.info(`Call ${callId} answered by ${userId}`)
          } else {
            // Update call status
            activeCalls.set(callId, {
              ...activeCall,
              status: "rejected",
              endedAt: Date.now()
            })

            // Notify caller that call was rejected
            io.to(callerId).emit("callEnded", {
              callId,
              reason: "rejected"
            })

            // Remove call data after a delay
            setTimeout(() => {
              activeCalls.delete(callId)
            }, 60000) // Keep rejected call data for 1 minute

            logger.info(`Call ${callId} rejected by ${userId}`)
          }
        } catch (error) {
          logger.error(`Error answering call: ${error.message}`)
          socket.emit("callError", { message: "Failed to answer call" })
        }
      })

      // Handle call end
      socket.on("endCall", (data) => {
        try {
          const { callId } = data

          if (!callId) {
            // Try to find any active call involving this user
            const activeCall = Array.from(activeCalls.values()).find(
              call => (call.caller === userId || call.recipient === userId) &&
                     (call.status === "ringing" || call.status === "connected")
            )

            if (activeCall) {
              const otherUserId = activeCall.caller === userId ? activeCall.recipient : activeCall.caller

              // Update call status
              activeCalls.set(activeCall.callId, {
                ...activeCall,
                status: "ended",
                endedAt: Date.now()
              })

              // Notify both users that call ended
              io.to(userId).emit("callEnded", {
                callId: activeCall.callId,
                reason: "ended"
              })

              io.to(otherUserId).emit("callEnded", {
                callId: activeCall.callId,
                reason: "ended"
              })

              // Remove call data after a delay
              setTimeout(() => {
                activeCalls.delete(activeCall.callId)
              }, 60000) // Keep ended call data for 1 minute

              logger.info(`Call ${activeCall.callId} ended by ${userId}`)
            }
          } else {
            const activeCall = activeCalls.get(callId)

            if (activeCall) {
              const otherUserId = activeCall.caller === userId ? activeCall.recipient : activeCall.caller

              // Update call status
              activeCalls.set(callId, {
                ...activeCall,
                status: "ended",
                endedAt: Date.now()
              })

              // Notify both users that call ended
              io.to(userId).emit("callEnded", {
                callId,
                reason: "ended"
              })

              io.to(otherUserId).emit("callEnded", {
                callId,
                reason: "ended"
              })

              // Remove call data after a delay
              setTimeout(() => {
                activeCalls.delete(callId)
              }, 60000) // Keep ended call data for 1 minute

              logger.info(`Call ${callId} ended by ${userId}`)
            }
          }
        } catch (error) {
          logger.error(`Error ending call: ${error.message}`)
        }
      })

      // Handle disconnection
      socket.on("disconnect", async () => {
        logger.info(`Socket disconnected: ${socket.id} for user ${userId}`)

        // Remove socket from user connections
        if (userConnections.has(userId)) {
          const userSockets = userConnections.get(userId)
          userSockets.delete(socket.id)

          // If user has no more active connections, mark as offline
          if (userSockets.size === 0) {
            userConnections.delete(userId)

            // Update user's online status
            User.findByIdAndUpdate(userId, {
              isOnline: false,
              lastActive: Date.now()
            }).catch(err => logger.error(`Error updating user offline status: ${err.message}`))

            // Notify other users that this user is offline
            socket.broadcast.emit("userOffline", {
              userId: userId,
              timestamp: Date.now()
            })

            // End any active calls involving this user
            Array.from(activeCalls.entries()).forEach(([callId, call]) => {
              if (call.caller === userId || call.recipient === userId) {
                if (call.status === "ringing" || call.status === "connected") {
                  const otherUserId = call.caller === userId ? call.recipient : call.caller

                  // Update call status
                  activeCalls.set(callId, {
                    ...call,
                    status: "ended",
                    endedAt: Date.now(),
                    reason: "disconnected"
                  })

                  // Notify other user that call ended
                  io.to(otherUserId).emit("callEnded", {
                    callId,
                    reason: "disconnected"
                  })

                  logger.info(`Call ${callId} ended due to user ${userId} disconnection`)
                }
              }
            })
          }
        }
      })

      // Handle ping (for keeping connection alive)
      socket.on("ping", () => {
        socket.emit("pong")
      })
    })

    // Periodic cleanup of inactive connections and calls
    setInterval(() => {
      const now = Date.now()

      // Clean up inactive calls
      Array.from(activeCalls.entries()).forEach(([callId, call]) => {
        // Remove calls that have been ended/missed/rejected for more than 10 minutes
        if (
          (call.status === "ended" || call.status === "missed" || call.status === "rejected") &&
          call.endedAt &&
          now - call.endedAt > 10 * 60 * 1000
        ) {
          activeCalls.delete(callId)
          logger.debug(`Cleaned up inactive call: ${callId}`)
        }

        // End calls that have been ringing for more than 1 minute
        if (call.status === "ringing" && now - call.initiated > 60 * 1000) {
          activeCalls.set(callId, {
            ...call,
            status: "missed",
            endedAt: now
          })

          // Notify caller that call was missed
          io.to(call.caller).emit("callEnded", {
            callId,
            reason: "no_answer"
          })

          // Notify recipient that call was missed
          io.to(call.recipient).emit("callMissed", {
            callId
          })

          logger.debug(`Auto-ended stale ringing call: ${callId}`)
        }

        // End calls that have been connected for more than 3 hours (as a safety measure)
        if (call.status === "connected" && call.answeredAt && now - call.answeredAt > 3 * 60 * 60 * 1000) {
          activeCalls.set(callId, {
            ...call,
            status: "ended",
            endedAt: now,
            reason: "timeout"
          })

          // Notify both users that call ended
          io.to(call.caller).emit("callEnded", {
            callId,
            reason: "timeout"
          })

          io.to(call.recipient).emit("callEnded", {
            callId,
            reason: "timeout"
          })

          logger.debug(`Auto-ended long-running call: ${callId}`)
        }
      })
    }, 5 * 60 * 1000) // Run every 5 minutes

    logger.info("Socket.IO server initialized successfully")
    return io
  } catch (error) {
    logger.error(`Error initializing Socket.IO server: ${error.message}`)
    throw error
  }
}

export default initSocketServer

// client/src/services/socketService.jsx
import { io } from "socket.io-client"
import { toast } from "react-toastify"

// --- Constants for Timeouts and Intervals ---
const CONNECTION_TIMEOUT = 20000 // 20 seconds for initial connection timeout
const HEARTBEAT_INTERVAL_MS = 30000 // send a ping every 30 seconds
const HEARTBEAT_TIMEOUT_MS = 60000 // if no pong received in 60 seconds, reconnect
const FORCE_RECONNECT_INTERVAL_MS = 30 * 60 * 1000 // force reconnect every 30 minutes
const CALL_TIMEOUT_MS = 15000 // 15 seconds timeout for call events
const MESSAGE_TIMEOUT_MS = 10000 // 10 seconds timeout for sending messages
const MAX_RECONNECT_ATTEMPTS = 10
const INITIAL_RECONNECT_DELAY = 5000

class SocketService {
  constructor() {
    // Core state variables
    this.socket = null
    this.userId = null
    this.token = null
    this.isConnecting = false
    this.connected = false
    this.initialized = false
    this.reconnectAttempts = 0

    // Timeouts and intervals
    this.connectionTimeout = null
    this.connectionLostTimeout = null
    this.forceReconnectTimeout = null
    this.heartbeatInterval = null
    this.lastHeartbeat = null

    // Message queues for pending operations
    this.pendingMessages = []
    this.messageQueue = []

    // Event handlers for cleanup
    this.eventHandlers = {}

    // Toast notification flag
    this.showConnectionToasts = false

    // Abort controller for cancellation if needed
    this.abortController = null

    // Determine server URL using environment variable or fallback
    this.serverUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (window.location.hostname.includes("localhost")
        ? `http://${window.location.hostname}:5000`
        : window.location.origin)

    // Enable debug logging in non-production modes
    this.debugMode = import.meta.env.MODE !== "production"

    console.log("SocketService initialized with server URL:", this.serverUrl)
  }

  // --- Logging Utilities ---
  _log(...args) {
    if (this.debugMode) console.log("[SocketService]", ...args)
  }

  _error(...args) {
    console.error("[SocketService]", ...args)
  }

  // --- Initialization ---
  /**
   * Initialize the socket connection with the provided userId and token.
   */
  init(userId, token) {
    if (this.isConnecting) return
    this.userId = userId
    this.token = token
    this.isConnecting = true
    this.abortController = new AbortController()
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout)

    this.connectionTimeout = setTimeout(() => {
      if (!this.socket || !this.socket.connected) {
        this._error("Socket connection timeout")
        this.isConnecting = false
        if (navigator.onLine) {
          toast.error("Chat connection timed out. Please refresh the page.")
        } else {
          this._log("Network is offline, will retry when connection is available")
        }
      }
    }, CONNECTION_TIMEOUT)

    try {
      this._log("Initializing socket with userId:", userId)
      this._log("Socket server URL:", this.serverUrl)

      console.log(`Connecting to socket server at ${this.serverUrl} with userId ${userId}`)

      this.socket = io(this.serverUrl, {
        query: { token },
        auth: { token, userId },
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: INITIAL_RECONNECT_DELAY,
        reconnectionDelayMax: 30000,
        timeout: 30000,
        transports: ["websocket", "polling"],
        forceNew: true,
        multiplex: true,
        upgrade: true,
        pingInterval: 45000,
        pingTimeout: 90000,
        perMessageDeflate: true,
        autoConnect: true,
        volatile: false,
        path: "/socket.io",
      })

      this._setupEventHandlers()
      this._setupForceReconnect()

      // Listen to browser events for online/offline and visibility changes
      window.addEventListener("online", this._handleOnline)
      window.addEventListener("offline", this._handleOffline)
      document.addEventListener("visibilitychange", this._handleVisibilityChange)
    } catch (error) {
      this._error("Socket initialization error:", error)
      this.isConnecting = false
      toast.error("Failed to connect to chat server. Please refresh the page.")
    }
  }

  // --- Event Handlers Setup ---
  _setupEventHandlers() {
    if (!this.socket) return

    // Successful connection
    this.socket.on("connect", () => {
      this._log("Socket connected successfully")
      console.log(`Socket connected with ID: ${this.socket.id}`)
      this.isConnecting = false
      this.connected = true
      this.initialized = true
      this.reconnectAttempts = 0
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }
      if (this.connectionLostTimeout) {
        clearTimeout(this.connectionLostTimeout)
        this.connectionLostTimeout = null
      }
      this._startHeartbeat()
      this._processPendingMessages()
      if (this.showConnectionToasts || this.reconnectAttempts > 0) {
        toast.success("Chat connection established")
      }
      window.dispatchEvent(new CustomEvent("socketConnected"))
      this._setupForceReconnect()
    })

    // Connection error
    this.socket.on("connect_error", (error) => {
      this._error("Socket connection error:", error)
      console.error(`Socket connection error: ${error.message}`)
      this.isConnecting = false
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }
      this.reconnectAttempts++
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        toast.error("Failed to connect to chat server. Please refresh the page.")
        window.dispatchEvent(new CustomEvent("socketConnectionFailed"))
      }
    })

    // Handle disconnection
    this.socket.on("disconnect", (reason) => {
      this._log("Socket disconnected:", reason)
      console.log(`Socket disconnected. Reason: ${reason}`)
      this.connected = false
      this._stopHeartbeat()
      if (!this.connectionLostTimeout) {
        this.connectionLostTimeout = setTimeout(() => {
          if (!this.socket || !this.socket.connected) {
            toast.warning("Chat connection lost. Attempting to reconnect...")
            window.dispatchEvent(new CustomEvent("socketDisconnected", { detail: { reason } }))
          }
        }, 5000)
      }
    })

    // Reconnection events
    this.socket.on("reconnect", (attemptNumber) => {
      this._log(`Socket reconnected after ${attemptNumber} attempts`)
      if (this.connectionLostTimeout) {
        clearTimeout(this.connectionLostTimeout)
        this.connectionLostTimeout = null
      }
      toast.success("Chat connection restored")
      this._setupForceReconnect()
      window.dispatchEvent(new CustomEvent("socketReconnected", { detail: { attemptNumber } }))
    })
    this.socket.on("reconnect_attempt", (attemptNumber) => {
      this._log(`Socket reconnect attempt ${attemptNumber}`)
    })
    this.socket.on("reconnect_error", (error) => {
      this._error("Socket reconnect error:", error)
    })
    this.socket.on("reconnect_failed", () => {
      this._error("Socket reconnect failed")
      toast.error("Failed to reconnect to chat server. Please refresh the page.")
      window.dispatchEvent(new CustomEvent("socketReconnectFailed"))
    })

    // Handle server errors
    this.socket.on("error", (error) => {
      this._error("Socket server error:", error)
      toast.error(`Chat server error: ${error.message || "Unknown error"}`)
    })

    // Heartbeat mechanism using pong events
    this.socket.on("pong", () => {
      this.lastHeartbeat = Date.now()
    })

    // Handle authentication errors
    this.socket.on("auth_error", (error) => {
      this._error("Socket authentication error:", error)
      toast.error("Authentication failed. Please log in again.")
      window.dispatchEvent(new CustomEvent("authLogout"))
    })

    // User status events (online/offline)
    this.socket.on("userOnline", (data) => {
      window.dispatchEvent(
        new CustomEvent("userStatusChanged", {
          detail: { userId: data.userId, status: "online", timestamp: data.timestamp },
        }),
      )
    })
    this.socket.on("userOffline", (data) => {
      window.dispatchEvent(
        new CustomEvent("userStatusChanged", {
          detail: { userId: data.userId, status: "offline", timestamp: data.timestamp },
        }),
      )
    })

    // Add more debugging for call events
    this.socket.on("incomingCall", (callData) => {
      this._log("Socket received incomingCall event:", callData)
      window.dispatchEvent(new CustomEvent("incomingCall", { detail: callData }))
    })
  }

  // --- Heartbeat and Force Reconnect ---
  _startHeartbeat() {
    this._stopHeartbeat()
    this.lastHeartbeat = Date.now()
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit("ping")
        const now = Date.now()
        if (this.lastHeartbeat && now - this.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
          this._log("No heartbeat received within threshold, reconnecting...")
          this.reconnect()
        }
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  _setupForceReconnect() {
    if (this.forceReconnectTimeout) clearTimeout(this.forceReconnectTimeout)
    this.forceReconnectTimeout = setTimeout(() => {
      this._log("Scheduled reconnection to refresh socket connection")
      this.reconnect()
    }, FORCE_RECONNECT_INTERVAL_MS)
  }

  // --- Process Pending Messages ---
  _processPendingMessages() {
    if (!this.socket || !this.socket.connected || this.pendingMessages.length === 0) return
    this._log(`Processing ${this.pendingMessages.length} pending messages`)
    const messages = [...this.pendingMessages]
    this.pendingMessages = []
    messages.forEach((message) => {
      this.socket.emit(message.event, message.data)
    })
  }

  // --- Emit and Listener Helpers ---
  emit(event, data = {}) {
    if (!this.socket) {
      this._log(`Socket not initialized, cannot emit '${event}'`)
      return false
    }
    if (!this.connected) {
      this._log(`Socket not connected, queueing '${event}'`)
      this.messageQueue.push({ event, data })
      return true
    }
    this.socket.emit(event, data)
    return true
  }

  on(event, callback) {
    if (!this.socket) {
      this._log(`Socket not initialized, cannot add listener for '${event}'`)
      return () => {}
    }
    this.socket.on(event, callback)
    if (!this.eventHandlers[event]) this.eventHandlers[event] = []
    this.eventHandlers[event].push(callback)
    return callback
  }

  off(event, callback) {
    if (!this.socket || !callback) return
    this.socket.off(event, callback)
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter((handler) => handler !== callback)
    }
  }

  // --- Connection Status Methods ---
  getStatus() {
    return {
      connected: this.socket?.connected || false,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      userId: this.userId,
      serverUrl: this.serverUrl,
      transport: this.socket?.io?.engine?.transport?.name || null,
      pingInterval: this.socket?.io?.engine?.pingInterval || null,
      pingTimeout: this.socket?.io?.engine?.pingTimeout || null,
    }
  }

  isConnected() {
    return this.socket && this.socket.connected
  }

  // --- Disconnect and Reconnect ---
  disconnect() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    window.removeEventListener("online", this._handleOnline)
    window.removeEventListener("offline", this._handleOffline)
    document.removeEventListener("visibilitychange", this._handleVisibilityChange)
    if (this.forceReconnectTimeout) {
      clearTimeout(this.forceReconnectTimeout)
      this.forceReconnectTimeout = null
    }
    if (this.connectionLostTimeout) {
      clearTimeout(this.connectionLostTimeout)
      this.connectionLostTimeout = null
    }
    if (this.socket) {
      Object.keys(this.eventHandlers).forEach((event) => {
        this.eventHandlers[event].forEach((handler) => {
          this.socket.off(event, handler)
        })
      })
      this.socket.disconnect()
      this.socket = null
    }
    this._stopHeartbeat()
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
    this.eventHandlers = {}
    this.pendingMessages = []
    this.isConnecting = false
    this.reconnectAttempts = 0
    this.lastHeartbeat = null
  }

  reconnect() {
    if (this.isConnecting) {
      this._log("Already attempting to reconnect, skipping")
      return
    }
    if (this.socket) {
      try {
        this.socket.disconnect()
      } catch (err) {
        this._error("Error disconnecting socket:", err)
      }
      this.socket = null
    }
    this.isConnecting = false
    this.reconnectAttempts = 0
    this._stopHeartbeat()
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }
    if (this.forceReconnectTimeout) {
      clearTimeout(this.forceReconnectTimeout)
      this.forceReconnectTimeout = null
    }
    if (this.connectionLostTimeout) {
      clearTimeout(this.connectionLostTimeout)
      this.connectionLostTimeout = null
    }
    if (this.userId && this.token) {
      this._log("Attempting to reconnect socket...")
      setTimeout(() => {
        this.init(this.userId, this.token)
      }, 2000)
    } else {
      this._log("Cannot reconnect: missing userId or token")
    }
  }

  // --- Configuration Helpers ---
  setShowConnectionToasts(enable) {
    this.showConnectionToasts = enable
  }

  setDebugMode(enable) {
    this.debugMode = enable
  }

  // --- Messaging Methods ---
  /**
   * Send a message to a recipient. If the socket isn’t connected,
   * the message is queued and a temporary message object is returned.
   */
  sendMessage(recipientId, type, content, metadata = {}) {
    return new Promise((resolve, reject) => {
      const tempMessageId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      if (!this.socket || !this.socket.connected) {
        this._log("Socket not connected, queueing message and attempting to reconnect...")
        const tempMessage = {
          _id: tempMessageId,
          sender: this.userId,
          recipient: recipientId,
          type,
          content,
          metadata,
          createdAt: new Date().toISOString(),
          read: false,
          pending: true,
        }
        this.pendingMessages.push({
          event: "sendMessage",
          data: { recipientId, type, content, metadata, tempMessageId },
        })
        if (this.userId && this.token) this.reconnect()
        resolve(tempMessage)
        return
      }
      if (!recipientId || !type) return reject(new Error("Invalid message parameters"))
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        return reject(new Error(`Invalid recipient ID format: ${recipientId}`))
      }
      const timeout = setTimeout(() => {
        this.socket.off("messageSent", handleMessageSent)
        this.socket.off("messageError", handleMessageError)
        const tempMessage = {
          _id: tempMessageId,
          sender: this.userId,
          recipient: recipientId,
          type,
          content,
          metadata,
          createdAt: new Date().toISOString(),
          read: false,
          pending: true,
        }
        this.pendingMessages.push({
          event: "sendMessage",
          data: { recipientId, type, content, metadata, tempMessageId },
        })
        resolve(tempMessage)
        this._log("Message send timeout, queued for retry")
      }, MESSAGE_TIMEOUT_MS)

      const handleMessageSent = (data) => {
        if (data.tempMessageId === tempMessageId) {
          this.socket.off("messageSent", handleMessageSent)
          this.socket.off("messageError", handleMessageError)
          resolve(data)
        }
      }
      const handleMessageError = (error) => {
        if (error.tempMessageId === tempMessageId) {
          this.socket.off("messageSent", handleMessageSent)
          this.socket.off("messageError", handleMessageError)
          reject(new Error(error.message || "Failed to send message"))
        }
      }
      this.socket.once("messageSent", handleMessageSent)
      this.socket.once("messageError", handleMessageError)
      this.socket.emit("sendMessage", { recipientId, type, content, metadata, tempMessageId })
    })
  }

  /**
   * Send a typing indicator to a recipient.
   */
  sendTyping(recipientId) {
    if (!this.socket || !this.socket.connected) return
    if (!recipientId || !/^[0-9a-fA-F]{24}$/.test(recipientId)) {
      this._error(`Invalid recipient ID format for typing: ${recipientId}`)
      return
    }
    this.socket.emit("typing", { recipientId })
  }

  /**
   * Initiate a video call with a recipient.
   */
  initiateVideoCall(recipientId, localPeerId = null) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        console.error("Socket not connected when trying to initiate call")
        return reject(new Error("Socket not connected"))
      }
      if (!recipientId || !/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        console.error(`Invalid recipient ID format: ${recipientId}`)
        return reject(new Error(`Invalid recipient ID format: ${recipientId}`))
      }

      this._log(`Initiating call to ${recipientId} with peer ID ${localPeerId}`)

      const timeout = setTimeout(() => {
        this.socket.off("callInitiated", handleCallInitiated)
        this.socket.off("callError", handleCallError)
        console.error("Call initiation timeout - no response received")
        reject(new Error("Call initiation timeout"))
      }, CALL_TIMEOUT_MS)

      const handleCallInitiated = (callData) => {
        this._log("Call successfully initiated:", callData)
        clearTimeout(timeout)
        this.socket.off("callInitiated", handleCallInitiated)
        this.socket.off("callError", handleCallError)
        resolve(callData)
      }

      const handleCallError = (error) => {
        console.error("Call initiation error:", error)
        clearTimeout(timeout)
        this.socket.off("callInitiated", handleCallInitiated)
        this.socket.off("callError", handleCallError)
        reject(new Error(error.message || "Failed to initiate call"))
      }

      this.socket.once("callInitiated", handleCallInitiated)
      this.socket.once("callError", handleCallError)
      this.socket.emit("initiateVideoCall", { recipientId, callerPeerId: localPeerId })
    })
  }

  /**
   * Answer an incoming video call.
   */
  answerVideoCall(callerId, accept = true, localPeerId = null) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"))
      }
      if (!callerId || !/^[0-9a-fA-F]{24}$/.test(callerId)) {
        return reject(new Error(`Invalid caller ID format: ${callerId}`))
      }
      const timeout = setTimeout(() => {
        this.socket.off("callAnswered", handleCallAnswered)
        this.socket.off("callError", handleCallError)
        reject(new Error("Call answer timeout"))
      }, CALL_TIMEOUT_MS)
      const handleCallAnswered = (callData) => {
        clearTimeout(timeout)
        this.socket.off("callAnswered", handleCallAnswered)
        this.socket.off("callError", handleCallError)
        resolve(callData)
      }
      const handleCallError = (error) => {
        clearTimeout(timeout)
        this.socket.off("callAnswered", handleCallAnswered)
        this.socket.off("callError", handleCallError)
        reject(new Error(error.message || "Failed to answer call"))
      }
      this.socket.once("callAnswered", handleCallAnswered)
      this.socket.once("callError", handleCallError)
      this.socket.emit("answerCall", { callerId, accept, respondentPeerId: localPeerId })
    })
  }

  // --- Browser Event Handlers ---
  _handleOnline = () => {
    this._log("Browser went online, attempting reconnect")
    if (!this.socket || !this.socket.connected) this.reconnect()
  }

  _handleOffline = () => {
    this._log("Browser went offline, socket may disconnect")
    this._stopHeartbeat()
  }

  _handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      this._log("Tab became visible, checking connection")
      if (this.socket && !this.socket.connected && navigator.onLine) this.reconnect()
      if (this.socket && this.socket.connected) this._startHeartbeat()
    } else {
      this._log("Tab hidden, pausing heartbeat")
      this._stopHeartbeat()
    }
  }
}

const socketService = new SocketService()
export default socketService

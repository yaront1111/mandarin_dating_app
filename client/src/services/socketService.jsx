// client/src/services/socketService.jsx
import { io } from "socket.io-client"
import { toast } from "react-toastify"

// --- Constants for Timeouts and Intervals ---
const CONNECTION_TIMEOUT = 10000 // 10 seconds for initial connection timeout
const HEARTBEAT_INTERVAL_MS = 20000 // send a ping every 20 seconds
const HEARTBEAT_TIMEOUT_MS = 30000 // if no pong received in 30 seconds, reconnect
const FORCE_RECONNECT_INTERVAL_MS = 20 * 60 * 1000 // force reconnect every 20 minutes
const CALL_TIMEOUT_MS = 10000 // 10 seconds timeout for call events
const MESSAGE_TIMEOUT_MS = 5000 // 5 seconds timeout for sending messages
const MAX_RECONNECT_ATTEMPTS = 5
const INITIAL_RECONNECT_DELAY = 2000
const MAX_QUEUE_SIZE = 50 // Maximum number of messages to queue

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
    this.reconnectTimer = null

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

  _warn(...args) {
    console.warn("[SocketService]", ...args)
  }

  _error(...args) {
    console.error("[SocketService]", ...args)
  }

  // --- Initialization ---
  /**
   * Initialize the socket connection with the provided userId and token.
   */
  init(userId, token) {
    // Don't initialize if already connecting
    if (this.isConnecting) {
      this._log("Socket connection already in progress, skipping")
      return
    }

    // Store user ID and token
    this.userId = userId
    this.token = token
    this.isConnecting = true

    // Create abort controller for potential cancellation
    this.abortController = new AbortController()

    // Clear any existing connection timeout
    if (this.connectionTimeout) clearTimeout(this.connectionTimeout)

    // Set connection timeout
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

      // Create socket connection with optimized configuration
      this.socket = io(this.serverUrl, {
        query: { token },
        auth: { token, userId },
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: INITIAL_RECONNECT_DELAY,
        reconnectionDelayMax: 10000, // 10 seconds max delay
        timeout: 20000, // 20 second connection timeout
        transports: ["websocket", "polling"], // Try websocket first, fall back to polling
        forceNew: true, // Create a new connection
        multiplex: false, // Disable multiplexing for better control
        upgrade: true, // Allow transport upgrade
        pingInterval: HEARTBEAT_INTERVAL_MS,
        pingTimeout: HEARTBEAT_TIMEOUT_MS,
        autoConnect: true,
      })

      // Setup event handlers
      this._setupEventHandlers()

      // Setup force reconnect mechanism
      this._setupForceReconnect()

      // Setup browser event listeners
      this._setupBrowserEvents()

      this._log("Socket initialization completed")
    } catch (error) {
      this._error("Socket initialization error:", error)
      this.isConnecting = false
      toast.error("Failed to connect to chat server. Please refresh the page.")
    }
  }

  // --- Private Helper Methods ---
  _setupBrowserEvents() {
    // Remove any existing listeners first
    window.removeEventListener("online", this._handleOnline)
    window.removeEventListener("offline", this._handleOffline)
    document.removeEventListener("visibilitychange", this._handleVisibilityChange)

    // Add new listeners
    window.addEventListener("online", this._handleOnline.bind(this))
    window.addEventListener("offline", this._handleOffline.bind(this))
    document.addEventListener("visibilitychange", this._handleVisibilityChange.bind(this))
  }

  // --- Event Handlers Setup ---
  _setupEventHandlers() {
    if (!this.socket) {
      this._error("Cannot setup handlers - socket not initialized")
      return
    }

    // Successful connection
    this.socket.on("connect", () => {
      this._log("Socket connected successfully with ID:", this.socket.id)

      // Update state
      this.isConnecting = false
      this.connected = true
      this.initialized = true
      this.reconnectAttempts = 0

      // Clear timeouts
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }
      if (this.connectionLostTimeout) {
        clearTimeout(this.connectionLostTimeout)
        this.connectionLostTimeout = null
      }
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }

      // Start heartbeat mechanism
      this._startHeartbeat()

      // Process any pending messages
      this._processPendingMessages()

      // Show notification if appropriate
      if (this.showConnectionToasts) {
        toast.success("Chat connection established")
      }

      // Dispatch connection event
      window.dispatchEvent(new CustomEvent("socketConnected"))

      // Setup force reconnect for long-running connections
      this._setupForceReconnect()
    })

    // Connection error
    this.socket.on("connect_error", (error) => {
      this._error("Socket connection error:", error.message)

      // Update state
      this.isConnecting = false

      // Clear timeout
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout)
        this.connectionTimeout = null
      }

      // Increment reconnect attempts
      this.reconnectAttempts++

      // Notify user after max attempts
      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        toast.error("Failed to connect to chat server. Please refresh the page.")
        window.dispatchEvent(new CustomEvent("socketConnectionFailed"))
      }
    })

    // Handle disconnection
    this.socket.on("disconnect", (reason) => {
      this._log("Socket disconnected. Reason:", reason)

      // Update state
      this.connected = false

      // Stop heartbeat
      this._stopHeartbeat()

      // Setup connection lost notification with delay
      if (!this.connectionLostTimeout) {
        this.connectionLostTimeout = setTimeout(() => {
          if (!this.socket || !this.socket.connected) {
            toast.warning("Chat connection lost. Attempting to reconnect...")
            window.dispatchEvent(new CustomEvent("socketDisconnected", {
              detail: { reason }
            }))
          }
        }, 3000) // 3 second delay before showing notification
      }

      // Queue automatic reconnect if appropriate
      if (reason === "io server disconnect" || reason === "transport close") {
        this._scheduleReconnect()
      }
    })

    // Reconnection events
    this.socket.on("reconnect", (attemptNumber) => {
      this._log(`Socket reconnected after ${attemptNumber} attempts`)

      // Clear connection lost timeout
      if (this.connectionLostTimeout) {
        clearTimeout(this.connectionLostTimeout)
        this.connectionLostTimeout = null
      }

      // Notify user
      toast.success("Chat connection restored")

      // Setup force reconnect
      this._setupForceReconnect()

      // Dispatch event
      window.dispatchEvent(new CustomEvent("socketReconnected", {
        detail: { attemptNumber }
      }))
    })

    this.socket.on("reconnect_attempt", (attemptNumber) => {
      this._log(`Socket reconnect attempt ${attemptNumber}`)
    })

    this.socket.on("reconnect_error", (error) => {
      this._error("Socket reconnect error:", error.message)
    })

    this.socket.on("reconnect_failed", () => {
      this._error("Socket reconnect failed after maximum attempts")
      toast.error("Failed to reconnect to chat server. Please refresh the page.")
      window.dispatchEvent(new CustomEvent("socketReconnectFailed"))

      // Schedule a last-ditch reconnect attempt
      this._scheduleReconnect(10000) // 10 seconds
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

    // Add core event handlers for message delivery confirmation
    this.socket.on("messageSent", (data) => {
      this._log("Message delivery confirmed:", data._id || data.tempMessageId)
    })

    this.socket.on("messageError", (error) => {
      this._error("Message sending error:", error)
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
    if (this.forceReconnectTimeout) {
      clearTimeout(this.forceReconnectTimeout)
    }
    this.forceReconnectTimeout = setTimeout(() => {
      this._log("Scheduled reconnection to refresh socket connection")
      this.reconnect()
    }, FORCE_RECONNECT_INTERVAL_MS)
  }

  _scheduleReconnect(delay = 5000) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    this.reconnectTimer = setTimeout(() => {
      this._log("Attempting scheduled reconnect...")
      this.reconnect()
    }, delay)
  }

  // --- Process Pending Messages ---
  _processPendingMessages() {
    if (!this.socket || !this.socket.connected || this.pendingMessages.length === 0) return

    this._log(`Processing ${this.pendingMessages.length} pending messages`)

    // Work with a copy of the pending messages
    const messages = [...this.pendingMessages]

    // Clear the pending messages array
    this.pendingMessages = []

    // Process each message
    messages.forEach((message) => {
      this.socket.emit(message.event, message.data)
      this._log(`Resent pending ${message.event} message`)
    })
  }

  // --- Emit and Listener Helpers ---
  /**
   * Emit an event to the socket server
   * @param {string} event - Event name
   * @param {object} data - Event data
   * @returns {boolean} Success indicator
   */
  emit(event, data = {}) {
    if (!this.socket) {
      this._log(`Socket not initialized, cannot emit '${event}'`)
      return false
    }

    if (!this.connected) {
      this._log(`Socket not connected, queueing '${event}'`)

      // Add to message queue if not full
      if (this.messageQueue.length < MAX_QUEUE_SIZE) {
        this.messageQueue.push({ event, data })
        return true
      }

      return false
    }

    this.socket.emit(event, data)
    return true
  }

  /**
   * Register an event listener
   * @param {string} event - Event name
   * @param {function} callback - Event callback function
   * @returns {function} The callback for later removal
   */
  on(event, callback) {
    if (!this.socket) {
      this._log(`Socket not initialized, cannot add listener for '${event}'`)
      return () => {}
    }

    this.socket.on(event, callback)

    // Store callback for later cleanup
    if (!this.eventHandlers[event]) this.eventHandlers[event] = []
    this.eventHandlers[event].push(callback)

    return callback
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {function} callback - The callback to remove
   */
  off(event, callback) {
    if (!this.socket || !callback) return

    this.socket.off(event, callback)

    // Remove from stored handlers
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (handler) => handler !== callback
      )
    }
  }

  // --- Connection Status Methods ---
  /**
   * Get current socket connection status
   * @returns {object} Socket status object
   */
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

  /**
   * Check if socket is currently connected
   * @returns {boolean} Connected status
   */
  isConnected() {
    return this.socket && this.socket.connected
  }

  // --- Disconnect and Reconnect ---
  /**
   * Completely disconnect the socket and clean up resources
   */
  disconnect() {
    // Cancel any pending operations
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }

    // Remove browser event listeners
    window.removeEventListener("online", this._handleOnline)
    window.removeEventListener("offline", this._handleOffline)
    document.removeEventListener("visibilitychange", this._handleVisibilityChange)

    // Clear all timeouts
    if (this.forceReconnectTimeout) {
      clearTimeout(this.forceReconnectTimeout)
      this.forceReconnectTimeout = null
    }

    if (this.connectionLostTimeout) {
      clearTimeout(this.connectionLostTimeout)
      this.connectionLostTimeout = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Disconnect socket and clean up event handlers
    if (this.socket) {
      // Remove all event handlers
      Object.keys(this.eventHandlers).forEach((event) => {
        this.eventHandlers[event].forEach((handler) => {
          this.socket.off(event, handler)
        })
      })

      // Disconnect socket
      this.socket.disconnect()
      this.socket = null
    }

    // Stop heartbeat
    this._stopHeartbeat()

    // Clear connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout)
      this.connectionTimeout = null
    }

    // Reset state
    this.eventHandlers = {}
    this.pendingMessages = []
    this.isConnecting = false
    this.reconnectAttempts = 0
    this.lastHeartbeat = null
    this.connected = false
  }

  /**
   * Reconnect the socket
   */
  reconnect() {
    if (this.isConnecting) {
      this._log("Already attempting to reconnect, skipping")
      return
    }

    // Disconnect and clean up existing socket
    if (this.socket) {
      try {
        this.socket.disconnect()
      } catch (err) {
        this._error("Error disconnecting socket:", err)
      }
      this.socket = null
    }

    // Reset flags
    this.isConnecting = false
    this.reconnectAttempts = 0
    this.connected = false

    // Stop heartbeat
    this._stopHeartbeat()

    // Clear timeouts
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

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // If we have user ID and token, reinitialize
    if (this.userId && this.token) {
      this._log("Attempting to reconnect socket...")
      setTimeout(() => {
        this.init(this.userId, this.token)
      }, 1000) // 1 second delay before reconnecting
    } else {
      this._warn("Cannot reconnect: missing userId or token")
    }
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

  // --- Configuration Helpers ---
  /**
   * Enable/disable connection toast notifications
   * @param {boolean} enable - Whether to show toasts
   */
  setShowConnectionToasts(enable) {
    this.showConnectionToasts = !!enable
  }

  /**
   * Enable/disable debug logging
   * @param {boolean} enable - Whether to enable debug logs
   */
  setDebugMode(enable) {
    this.debugMode = !!enable
  }

  // --- Messaging Methods ---
  /**
   * Send a message to a recipient
   * @param {string} recipientId - Recipient's user ID
   * @param {string} type - Message type (text, wink, video, file)
   * @param {string} content - Message content
   * @param {object} metadata - Additional metadata
   * @returns {Promise<object>} The sent message or error
   */
  sendMessage(recipientId, type, content, metadata = {}) {
    return new Promise((resolve, reject) => {
      // Generate a temporary message ID for tracking
      const tempMessageId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Handle case where socket is not connected
      if (!this.socket || !this.socket.connected) {
        this._log("Socket not connected, queueing message")

        // Create a temporary message object
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

        // Add to pending messages queue for later sending
        this.pendingMessages.push({
          event: "sendMessage",
          data: { recipientId, type, content, metadata, tempMessageId },
        })

        // Try to reconnect if we have credentials
        if (this.pendingMessages.length === 1 && this.userId && this.token) {
          this._scheduleReconnect(2000) // Wait 2 seconds before trying to reconnect
        }

        resolve(tempMessage)
        return
      }

      // Validate parameters
      if (!recipientId || !type) {
        return reject(new Error("Invalid message parameters"))
      }

      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        return reject(new Error(`Invalid recipient ID format: ${recipientId}`))
      }

      // Set up message timeout
      const timeout = setTimeout(() => {
        // Remove event listeners to prevent memory leaks
        this.socket.off("messageSent", handleMessageSent)
        this.socket.off("messageError", handleMessageError)

        // Create a temporary message and queue for retry
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

        // Add to pending messages for retry
        this.pendingMessages.push({
          event: "sendMessage",
          data: { recipientId, type, content, metadata, tempMessageId },
        })

        resolve(tempMessage)
        this._log("Message send timeout, queued for retry")
      }, MESSAGE_TIMEOUT_MS)

      // Set up success handler
      const handleMessageSent = (data) => {
        if (data.tempMessageId === tempMessageId) {
          clearTimeout(timeout)
          this.socket.off("messageSent", handleMessageSent)
          this.socket.off("messageError", handleMessageError)
          resolve(data)
        }
      }

      // Set up error handler
      const handleMessageError = (error) => {
        if (error.tempMessageId === tempMessageId) {
          clearTimeout(timeout)
          this.socket.off("messageSent", handleMessageSent)
          this.socket.off("messageError", handleMessageError)
          reject(new Error(error.message || "Failed to send message"))
        }
      }

      // Register handlers
      this.socket.once("messageSent", handleMessageSent)
      this.socket.once("messageError", handleMessageError)

      // Send the message
      this.socket.emit("sendMessage", { recipientId, type, content, metadata, tempMessageId })
    })
  }

  /**
   * Send a typing indicator to a recipient
   * @param {string} recipientId - Recipient's user ID
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
   * Initiate a video call with a recipient
   * @param {string} recipientId - Recipient's user ID
   * @param {string} localPeerId - Local Peer ID for WebRTC
   * @returns {Promise<object>} Call data
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

      // Set up call timeout
      const timeout = setTimeout(() => {
        this.socket.off("callInitiated", handleCallInitiated)
        this.socket.off("callError", handleCallError)
        console.error("Call initiation timeout - no response received")
        reject(new Error("Call initiation timeout"))
      }, CALL_TIMEOUT_MS)

      // Success handler
      const handleCallInitiated = (callData) => {
        this._log("Call successfully initiated:", callData)
        clearTimeout(timeout)
        this.socket.off("callInitiated", handleCallInitiated)
        this.socket.off("callError", handleCallError)
        resolve(callData)
      }

      // Error handler
      const handleCallError = (error) => {
        console.error("Call initiation error:", error)
        clearTimeout(timeout)
        this.socket.off("callInitiated", handleCallInitiated)
        this.socket.off("callError", handleCallError)
        reject(new Error(error.message || "Failed to initiate call"))
      }

      // Register handlers
      this.socket.once("callInitiated", handleCallInitiated)
      this.socket.once("callError", handleCallError)

      // Send the call request
      this.socket.emit("initiateVideoCall", { recipientId, callerPeerId: localPeerId })
    })
  }

  /**
   * Answer an incoming video call
   * @param {string} callerId - Caller's user ID
   * @param {boolean} accept - Whether to accept the call
   * @param {string} localPeerId - Local Peer ID for WebRTC
   * @returns {Promise<object>} Call data
   */
  answerVideoCall(callerId, accept = true, localPeerId = null) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"))
      }

      if (!callerId || !/^[0-9a-fA-F]{24}$/.test(callerId)) {
        return reject(new Error(`Invalid caller ID format: ${callerId}`))
      }

      // Set up call timeout
      const timeout = setTimeout(() => {
        this.socket.off("callAnswered", handleCallAnswered)
        this.socket.off("callError", handleCallError)
        reject(new Error("Call answer timeout"))
      }, CALL_TIMEOUT_MS)

      // Success handler
      const handleCallAnswered = (callData) => {
        clearTimeout(timeout)
        this.socket.off("callAnswered", handleCallAnswered)
        this.socket.off("callError", handleCallError)
        resolve(callData)
      }

      // Error handler
      const handleCallError = (error) => {
        clearTimeout(timeout)
        this.socket.off("callAnswered", handleCallAnswered)
        this.socket.off("callError", handleCallError)
        reject(new Error(error.message || "Failed to answer call"))
      }

      // Register handlers
      this.socket.once("callAnswered", handleCallAnswered)
      this.socket.once("callError", handleCallError)

      // Send the answer
      this.socket.emit("answerCall", { callerId, accept, respondentPeerId: localPeerId })
    })
  }
}

const socketService = new SocketService()
export default socketService

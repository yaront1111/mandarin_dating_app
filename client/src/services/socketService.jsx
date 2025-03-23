import { io } from "socket.io-client";
import { getToken } from "../utils/tokenStorage";
import { toast } from "react-toastify";

/**
 * SocketService
 *
 * This service provides a full-featured, production-level Socket.IO
 * implementation with robust connection handling, heartbeat, pending
 * message queueing, reconnection logic, error recovery, and support for
 * messaging and video call functionalities.
 *
 * Environment variables are read via Vite's import.meta.env.
 */
class SocketService {
  constructor() {
    // Core socket state
    this.socket = null;
    this.userId = null;
    this.token = null;
    this.isConnecting = false;
    this.connected = false;
    this.initialized = false;

    // Reconnection settings
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
    this.connectionTimeout = null;
    this.connectionLostTimeout = null;
    this.forceReconnectTimeout = null;

    // Heartbeat settings
    this.heartbeatInterval = null;
    this.lastHeartbeat = null;

    // Message queues for pending messages (when disconnected)
    this.pendingMessages = [];
    this.messageQueue = [];

    // Custom event listeners (for non-socket events)
    this.eventHandlers = {};
    this.listeners = new Map();

    // Toast display and abort controller for cancellations
    this.showConnectionToasts = false;
    this.abortController = null;

    // Determine server URL: use VITE_SOCKET_URL if defined; otherwise, use localhost or origin.
    this.serverUrl =
      import.meta.env.VITE_SOCKET_URL ||
      (window.location.hostname.includes("localhost")
        ? `http://${window.location.hostname}:5000`
        : window.location.origin);

    // Use Vite's environment variable (import.meta.env.MODE) instead of process.env.NODE_ENV
    this.debugMode = import.meta.env.MODE !== "production";
  }

  // ----------------------
  // Logging Utilities
  // ----------------------
  _log(...args) {
    if (this.debugMode) {
      console.log("[SocketService]", ...args);
    }
  }

  _error(...args) {
    console.error("[SocketService]", ...args);
  }

  // ----------------------
  // Initialization / Connection
  // ----------------------
  /**
   * Initialize socket connection with a given userId and token.
   * Sets up the connection options, event handlers, and browser listeners.
   *
   * @param {string} userId - User ID.
   * @param {string} token - Authentication token.
   */
  init(userId, token) {
    if (this.isConnecting) return;

    // Set up credentials and connection state
    this.userId = userId;
    this.token = token;
    this.isConnecting = true;
    this.abortController = new AbortController();

    // Clear any existing connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
    }

    // Set a timeout to detect connection delays
    this.connectionTimeout = setTimeout(() => {
      if (!this.socket || !this.socket.connected) {
        this._error("Socket connection timeout");
        this.isConnecting = false;
        if (navigator.onLine) {
          toast.error("Chat connection timed out. Please refresh the page.");
        } else {
          this._log("Network is offline, will retry when connection is available");
        }
      }
    }, 20000);

    try {
      this._log("Initializing socket with userId:", userId);
      this._log("Socket server URL:", this.serverUrl);

      // Create socket instance with options
      this.socket = io(this.serverUrl, {
        query: { token },
        auth: { token, userId },
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 30000, // maximum 30 seconds delay
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
      });

      this._log(
        `Attempting socket connection to: ${this.serverUrl} with path: /socket.io`
      );

      // Set up socket event handlers
      this._setupEventHandlers();

      // Set up periodic force reconnect (every 30 minutes)
      this._setupForceReconnect();

      // Listen for browser events: online/offline and visibility change
      window.addEventListener("online", this._handleOnline);
      window.addEventListener("offline", this._handleOffline);
      document.addEventListener("visibilitychange", this._handleVisibilityChange);
    } catch (error) {
      this._error("Socket initialization error:", error);
      this.isConnecting = false;
      toast.error("Failed to connect to chat server. Please refresh the page.");
    }
  }

  /**
   * Set up all socket event handlers for connection, error, and custom events.
   */
  _setupEventHandlers() {
    if (!this.socket) return;

    // Successful connection
    this.socket.on("connect", () => {
      this._log("Socket connected successfully");
      this.isConnecting = false;
      this.connected = true;
      this.initialized = true;
      this.reconnectAttempts = 0;
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      if (this.connectionLostTimeout) {
        clearTimeout(this.connectionLostTimeout);
        this.connectionLostTimeout = null;
      }
      // Start heartbeat and process any pending messages
      this._startHeartbeat();
      this._processPendingMessages();
      if (this.showConnectionToasts || this.reconnectAttempts > 0) {
        toast.success("Chat connection established");
      }
      // Dispatch custom event for socket connected
      window.dispatchEvent(new CustomEvent("socketConnected"));
      this._setupForceReconnect();
    });

    // Connection error handling
    this.socket.on("connect_error", (error) => {
      this._error("Socket connection error:", error);
      this.isConnecting = false;
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        toast.error("Failed to connect to chat server. Please refresh the page.");
        window.dispatchEvent(new CustomEvent("socketConnectionFailed"));
      }
    });

    // Disconnect events
    this.socket.on("disconnect", (reason) => {
      this._log("Socket disconnected:", reason);
      this.connected = false;
      this._stopHeartbeat();
      if (!this.connectionLostTimeout) {
        this.connectionLostTimeout = setTimeout(() => {
          if (!this.socket || !this.socket.connected) {
            toast.warning("Chat connection lost. Attempting to reconnect...");
            window.dispatchEvent(
              new CustomEvent("socketDisconnected", { detail: { reason } })
            );
          }
        }, 5000);
      }
    });

    // Reconnection events
    this.socket.on("reconnect", (attemptNumber) => {
      this._log(`Socket reconnected after ${attemptNumber} attempts`);
      if (this.connectionLostTimeout) {
        clearTimeout(this.connectionLostTimeout);
        this.connectionLostTimeout = null;
      }
      toast.success("Chat connection restored");
      this._setupForceReconnect();
      window.dispatchEvent(
        new CustomEvent("socketReconnected", { detail: { attemptNumber } })
      );
    });

    this.socket.on("reconnect_attempt", (attemptNumber) => {
      this._log(`Socket reconnect attempt ${attemptNumber}`);
    });

    this.socket.on("reconnect_error", (error) => {
      this._error("Socket reconnect error:", error);
    });

    this.socket.on("reconnect_failed", () => {
      this._error("Socket reconnect failed");
      toast.error("Failed to reconnect to chat server. Please refresh the page.");
      window.dispatchEvent(new CustomEvent("socketReconnectFailed"));
    });

    // Server error event
    this.socket.on("error", (error) => {
      this._error("Socket server error:", error);
      toast.error(`Chat server error: ${error.message || "Unknown error"}`);
    });

    // Heartbeat: update lastHeartbeat on pong
    this.socket.on("pong", () => {
      this.lastHeartbeat = Date.now();
    });

    // Authentication error
    this.socket.on("auth_error", (error) => {
      this._error("Socket authentication error:", error);
      toast.error("Authentication failed. Please log in again.");
      window.dispatchEvent(new CustomEvent("authLogout"));
    });

    // User status events
    this.socket.on("userOnline", (data) => {
      window.dispatchEvent(
        new CustomEvent("userStatusChanged", {
          detail: { userId: data.userId, status: "online", timestamp: data.timestamp },
        })
      );
    });
    this.socket.on("userOffline", (data) => {
      window.dispatchEvent(
        new CustomEvent("userStatusChanged", {
          detail: { userId: data.userId, status: "offline", timestamp: data.timestamp },
        })
      );
    });
  }

  // ----------------------
  // Heartbeat & Force-Reconnect
  // ----------------------
  /**
   * Start a heartbeat interval that emits a "ping" every 30 seconds.
   * If no "pong" is received within 60 seconds, triggers a reconnect.
   */
  _startHeartbeat() {
    this._stopHeartbeat();
    this.lastHeartbeat = Date.now();
    this.heartbeatInterval = setInterval(() => {
      if (this.socket && this.socket.connected) {
        this.socket.emit("ping");
        const now = Date.now();
        if (this.lastHeartbeat && now - this.lastHeartbeat > 60000) {
          this._log("No heartbeat received for 60 seconds, reconnecting...");
          this.reconnect();
        }
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Schedule a force reconnect every 30 minutes to refresh the connection.
   */
  _setupForceReconnect() {
    if (this.forceReconnectTimeout) {
      clearTimeout(this.forceReconnectTimeout);
    }
    this.forceReconnectTimeout = setTimeout(() => {
      this._log("Performing scheduled reconnection to refresh socket connection");
      this.reconnect();
    }, 30 * 60 * 1000);
  }

  // ----------------------
  // Message Queue & Emission
  // ----------------------
  /**
   * Process pending messages that were queued while disconnected.
   */
  _processPendingMessages() {
    if (!this.socket || !this.socket.connected || this.pendingMessages.length === 0)
      return;
    this._log(`Processing ${this.pendingMessages.length} pending messages`);
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];
    messages.forEach((message) => {
      this.socket.emit(message.event, message.data);
    });
  }

  /**
   * Emit an event to the server.
   * If not connected, queues the event.
   *
   * @param {string} event - Event name.
   * @param {object} data - Event data.
   * @returns {boolean} - True if emitted or queued.
   */
  emit(event, data = {}) {
    if (!this.socket) {
      this._log(`Socket not initialized, cannot emit '${event}'`);
      return false;
    }
    if (!this.connected) {
      this._log(`Socket not connected, queueing '${event}'`);
      this.messageQueue.push({ event, data });
      return true;
    }
    this.socket.emit(event, data);
    return true;
  }

  // ----------------------
  // Custom Event Listeners
  // ----------------------
  /**
   * Register an event listener.
   *
   * @param {string} event - Event name.
   * @param {Function} callback - Callback function.
   * @returns {Function} - Unsubscribe function.
   */
  on(event, callback) {
    if (!this.socket) {
      this._log(`Socket not initialized, cannot add listener for '${event}'`);
      return () => {};
    }
    this.socket.on(event, callback);
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    this.eventHandlers[event].push(callback);
    return callback;
  }

  /**
   * Remove an event listener.
   *
   * @param {string} event - Event name.
   * @param {Function} callback - Callback function.
   */
  off(event, callback) {
    if (!this.socket || !callback) return;
    this.socket.off(event, callback);
    if (this.eventHandlers[event]) {
      this.eventHandlers[event] = this.eventHandlers[event].filter(
        (handler) => handler !== callback
      );
    }
  }

  /**
   * Notify all registered custom listeners for an event.
   *
   * @param {string} event - Event name.
   * @param {any} data - Event data.
   */
  _notifyListeners(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          this._error(`Error in '${event}' listener:`, error);
        }
      });
    }
  }

  // ----------------------
  // Messaging & Calling
  // ----------------------
  /**
   * Send a message to a user.
   * If not connected, the message is queued and a temporary message is returned.
   *
   * @param {string} recipientId - Recipient user ID.
   * @param {string} type - Message type (e.g. "text").
   * @param {string} content - Message content.
   * @param {object} metadata - Additional metadata.
   * @returns {Promise<object>} - Resolves with the message data.
   */
  async sendMessage(recipientId, type, content, metadata = {}) {
    return new Promise((resolve, reject) => {
      const tempMessageId = `temp-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      if (!this.socket || !this.socket.connected) {
        this._log("Socket not connected, queueing message and attempting to reconnect...");
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
        };
        this.pendingMessages.push({
          event: "sendMessage",
          data: { recipientId, type, content, metadata, tempMessageId },
        });
        if (this.userId && this.token) {
          this.reconnect();
        }
        return resolve(tempMessage);
      }

      if (!recipientId || !type) {
        return reject(new Error("Invalid message parameters"));
      }
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        return reject(new Error(`Invalid recipient ID format: ${recipientId}`));
      }

      const timeout = setTimeout(() => {
        this.socket.off("messageSent", handleMessageSent);
        this.socket.off("messageError", handleMessageError);
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
        };
        this.pendingMessages.push({
          event: "sendMessage",
          data: { recipientId, type, content, metadata, tempMessageId },
        });
        resolve(tempMessage);
        this._log("Message send timeout, queued for retry");
      }, 10000);

      const handleMessageSent = (data) => {
        if (data.tempMessageId === tempMessageId) {
          this.socket.off("messageSent", handleMessageSent);
          this.socket.off("messageError", handleMessageError);
          resolve(data);
        }
      };

      const handleMessageError = (error) => {
        if (error.tempMessageId === tempMessageId) {
          this.socket.off("messageSent", handleMessageSent);
          this.socket.off("messageError", handleMessageError);
          reject(new Error(error.message || "Failed to send message"));
        }
      };

      this.socket.once("messageSent", handleMessageSent);
      this.socket.once("messageError", handleMessageError);
      this.socket.emit("sendMessage", {
        recipientId,
        type,
        content,
        metadata,
        tempMessageId,
      });
    });
  }

  /**
   * Send a typing indicator to a user.
   *
   * @param {string} recipientId - Recipient user ID.
   */
  sendTyping(recipientId) {
    if (!this.socket || !this.socket.connected) return;
    if (!recipientId || !/^[0-9a-fA-F]{24}$/.test(recipientId)) {
      this._error(`Invalid recipient ID format for typing: ${recipientId}`);
      return;
    }
    this.socket.emit("typing", { recipientId });
  }

  /**
   * Initiate a video call with a user.
   *
   * @param {string} recipientId - Recipient user ID.
   * @returns {Promise<object>} - Resolves with call data.
   */
  initiateVideoCall(recipientId) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      if (!recipientId || !/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        return reject(new Error(`Invalid recipient ID format: ${recipientId}`));
      }
      const timeout = setTimeout(() => {
        this.socket.off("callInitiated", handleCallInitiated);
        this.socket.off("callError", handleCallError);
        reject(new Error("Call initiation timeout"));
      }, 15000);

      const handleCallInitiated = (callData) => {
        clearTimeout(timeout);
        this.socket.off("callInitiated", handleCallInitiated);
        this.socket.off("callError", handleCallError);
        resolve(callData);
      };

      const handleCallError = (error) => {
        clearTimeout(timeout);
        this.socket.off("callInitiated", handleCallInitiated);
        this.socket.off("callError", handleCallError);
        reject(new Error(error.message || "Failed to initiate call"));
      };

      this.socket.once("callInitiated", handleCallInitiated);
      this.socket.once("callError", handleCallError);
      this.socket.emit("initiateCall", { recipientId });
    });
  }

  /**
   * Answer an incoming video call.
   *
   * @param {string} callerId - Caller user ID.
   * @param {boolean} accept - Whether to accept the call.
   * @returns {Promise<object>} - Resolves with call data.
   */
  answerVideoCall(callerId, accept = true) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        return reject(new Error("Socket not connected"));
      }
      if (!callerId || !/^[0-9a-fA-F]{24}$/.test(callerId)) {
        return reject(new Error(`Invalid caller ID format: ${callerId}`));
      }
      const timeout = setTimeout(() => {
        this.socket.off("callAnswered", handleCallAnswered);
        this.socket.off("callError", handleCallError);
        reject(new Error("Call answer timeout"));
      }, 15000);

      const handleCallAnswered = (callData) => {
        clearTimeout(timeout);
        this.socket.off("callAnswered", handleCallAnswered);
        this.socket.off("callError", handleCallError);
        resolve(callData);
      };

      const handleCallError = (error) => {
        clearTimeout(timeout);
        this.socket.off("callAnswered", handleCallAnswered);
        this.socket.off("callError", handleCallError);
        reject(new Error(error.message || "Failed to answer call"));
      };

      this.socket.once("callAnswered", handleCallAnswered);
      this.socket.once("callError", handleCallError);
      this.socket.emit("answerCall", { callerId, accept });
    });
  }

  // ----------------------
  // Status & Disconnect
  // ----------------------
  /**
   * Get connection status and details.
   *
   * @returns {object} - Status object.
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
    };
  }

  /**
   * Check if the socket is currently connected.
   *
   * @returns {boolean} - True if connected.
   */
  isConnected() {
    return this.socket && this.socket.connected;
  }

  /**
   * Disconnect the socket and clean up all listeners and intervals.
   */
  disconnect() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    window.removeEventListener("online", this._handleOnline);
    window.removeEventListener("offline", this._handleOffline);
    document.removeEventListener("visibilitychange", this._handleVisibilityChange);
    if (this.forceReconnectTimeout) {
      clearTimeout(this.forceReconnectTimeout);
      this.forceReconnectTimeout = null;
    }
    if (this.connectionLostTimeout) {
      clearTimeout(this.connectionLostTimeout);
      this.connectionLostTimeout = null;
    }
    if (this.socket) {
      Object.keys(this.eventHandlers).forEach((event) => {
        this.eventHandlers[event].forEach((handler) => {
          this.socket.off(event, handler);
        });
      });
      this.socket.disconnect();
      this.socket = null;
    }
    this._stopHeartbeat();
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    this.eventHandlers = {};
    this.pendingMessages = [];
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.lastHeartbeat = null;
  }

  /**
   * Force reconnection: disconnect and reinitialize.
   *
   * @returns {Promise} - Resolves when reconnected.
   */
  reconnect() {
    if (this.isConnecting) {
      this._log("Already attempting to connect, skipping reconnect");
      return;
    }
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (err) {
        this._error("Error disconnecting socket:", err);
      }
      this.socket = null;
    }
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    if (this.forceReconnectTimeout) {
      clearTimeout(this.forceReconnectTimeout);
      this.forceReconnectTimeout = null;
    }
    if (this.connectionLostTimeout) {
      clearTimeout(this.connectionLostTimeout);
      this.connectionLostTimeout = null;
    }
    if (this.userId && this.token) {
      this._log("Attempting to reconnect socket...");
      setTimeout(() => {
        this.init(this.userId, this.token);
      }, 2000);
    } else {
      this._log("Cannot reconnect: missing userId or token");
    }
  }

  /**
   * Enable or disable connection toast notifications.
   *
   * @param {boolean} enable - True to enable toasts.
   */
  setShowConnectionToasts(enable) {
    this.showConnectionToasts = enable;
  }

  /**
   * Enable or disable debug mode.
   *
   * @param {boolean} enable - True to enable debug logging.
   */
  setDebugMode(enable) {
    this.debugMode = enable;
  }

  // ----------------------
  // Browser Event Handlers (bound via arrow functions)
  // ----------------------
  _handleOnline = () => {
    this._log("Browser went online, attempting reconnect");
    if (!this.socket || !this.socket.connected) {
      this.reconnect();
    }
  };

  _handleOffline = () => {
    this._log("Browser went offline, socket may disconnect");
    this._stopHeartbeat();
  };

  _handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      this._log("Tab became visible, checking connection");
      if (this.socket && !this.socket.connected && navigator.onLine) {
        this.reconnect();
      }
      if (this.socket && this.socket.connected) {
        this._startHeartbeat();
      }
    } else {
      this._log("Tab hidden, pausing heartbeat");
      this._stopHeartbeat();
    }
  };
}

// Create a singleton instance of SocketService
const socketService = new SocketService();
export default socketService;

// client/src/services/notificationService.jsx
import apiService from "./apiService.jsx"
import { toast } from "react-toastify"
import socketService from "./socketService.jsx"

class NotificationService {
  constructor() {
    this.notifications = []
    this.unreadCount = 0
    this.initialized = false
    this.userSettings = null
    this.listeners = []
  }

  /**
   * Initialize notification service with user settings
   * @param {Object} userSettings - User notification settings
   */
  initialize(userSettings) {
    this.userSettings = userSettings || {
      notifications: {
        messages: true,
        calls: true,
        stories: true,
        likes: true,
        comments: true,
      },
    }

    this.initialized = true

    // Register socket listeners for notifications
    this.registerSocketListeners()

    // Fetch existing notifications
    this.getNotifications()
  }

  /**
   * Register socket event listeners for notifications
   */
  registerSocketListeners() {
    // Make sure socket service is available
    if (!socketService.socket) return

    // Listen for new message notifications
    socketService.socket.on("new_message", (data) => {
      if (this.shouldShowNotification("messages")) {
        const senderNickname = data.sender?.nickname || "Someone"
        this.addNotification({
          type: "message",
          title: `New message from ${senderNickname}`,
          message: data.content || "Click to view message",
          time: "Just now",
          read: false,
          sender: data.sender,
          data: data,
        })
      }
    })

    // Listen for incoming call notifications
    socketService.socket.on("incoming_call", (data) => {
      if (this.shouldShowNotification("calls")) {
        const callerNickname = data.caller?.nickname || data.caller?.name || "Someone"
        this.addNotification({
          type: "call",
          title: `Incoming call from ${callerNickname}`,
          message: "Click to answer",
          time: "Just now",
          read: false,
          sender: data.caller,
          data: data,
        })
      }
    })

    // Listen for new story notifications
    socketService.socket.on("new_story", (data) => {
      if (this.shouldShowNotification("stories")) {
        const creatorNickname = data.creator?.nickname || "Someone"
        this.addNotification({
          type: "story",
          title: `New story from ${creatorNickname}`,
          message: "Click to view",
          time: "Just now",
          read: false,
          sender: data.creator,
          data: data,
        })
      }
    })

    // Listen for like notifications
    socketService.socket.on("new_like", (data) => {
      if (this.shouldShowNotification("likes")) {
        const senderNickname = data.sender?.nickname || "Someone"
        this.addNotification({
          type: "like",
          title: `${senderNickname} liked your profile`,
          message: "Click to view their profile",
          time: "Just now",
          read: false,
          sender: data.sender,
          data: data,
        })
      }
    })

    // Listen for photo permission request notifications
    socketService.socket.on("photo_permission_request", (data) => {
      if (this.shouldShowNotification("photoRequests")) {
        const requesterNickname = data.requester?.nickname || "Someone"
        this.addNotification({
          type: "photoRequest",
          title: `${requesterNickname} requested access to your private photo`,
          message: "Click to review the request",
          time: "Just now",
          read: false,
          sender: data.requester,
          data: data,
        })
      }
    })

    // Listen for photo permission response notifications
    socketService.socket.on("photo_permission_response", (data) => {
      if (this.shouldShowNotification("photoRequests")) {
        const ownerNickname = data.owner?.nickname || "Someone"
        const action = data.status === "approved" ? "approved" : "rejected"
        this.addNotification({
          type: "photoResponse",
          title: `${ownerNickname} ${action} your photo request`,
          message: data.status === "approved" ? "You can now view their private photo" : "Your request was declined",
          time: "Just now",
          read: false,
          sender: data.owner,
          data: data,
        })
      }
    })

    // Listen for comment notifications
    socketService.socket.on("new_comment", (data) => {
      if (this.shouldShowNotification("comments")) {
        const commenterNickname = data.commenter?.nickname || "Someone"
        const commentText = data.comment || ""
        this.addNotification({
          type: "comment",
          title: `${commenterNickname} commented on your ${data.contentType || "content"}`,
          message: commentText.substring(0, 50) + (commentText.length > 50 ? "..." : ""),
          time: "Just now",
          read: false,
          sender: data.commenter,
          data: data,
        })
      }
    })

    // Listen for direct API notifications (for non-socket events)
    socketService.socket.on("notification", (data) => {
      if (this.shouldShowNotification(data.type)) {
        this.addNotification(data)
      }
    })
  }

  /**
   * Check if notification should be shown based on user settings
   * @param {string} notificationType - Type of notification
   * @returns {boolean} - Whether notification should be shown
   */
  shouldShowNotification(notificationType) {
    // If not initialized or no settings, default to showing
    if (!this.initialized || !this.userSettings) return true

    // For photo requests, check if general notifications are enabled
    if (notificationType === "photoRequest" || notificationType === "photoResponse") {
      return this.userSettings.notifications?.general !== false
    }

    // Check if this notification type is enabled in user settings
    return this.userSettings.notifications?.[notificationType] !== false
  }

  /**
   * Validate a notification object to ensure it has required fields
   * @param {Object} notification - The notification to validate
   * @returns {boolean} - Whether the notification is valid
   */
  isValidNotification(notification) {
    if (!notification) return false

    // Check for required fields
    const hasId = notification._id || notification.id
    const hasMessage = notification.message || notification.title || notification.content
    const hasType = notification.type

    return Boolean(hasId && hasMessage && hasType)
  }

  /**
   * Sanitize notification data to ensure it has all required fields
   * @param {Object} notification - The notification to sanitize
   * @returns {Object} - Sanitized notification
   */
  sanitizeNotification(notification) {
    if (!notification) return null

    const sanitized = { ...notification }

    // Ensure we have an ID
    if (!sanitized._id && !sanitized.id) {
      sanitized._id = Date.now().toString()
    }

    // Ensure we have a message
    if (!sanitized.message && !sanitized.title && !sanitized.content) {
      sanitized.message = "New notification"
    }

    // Ensure we have a type
    if (!sanitized.type) {
      sanitized.type = "system"
    }

    // Ensure we have a timestamp
    if (!sanitized.createdAt) {
      sanitized.createdAt = new Date().toISOString()
    }

    // Ensure read status is defined
    if (sanitized.read === undefined) {
      sanitized.read = false
    }

    return sanitized
  }

  /**
   * Add a notification to the list
   * @param {Object} notification - Notification data
   */
  addNotification(notification) {
    // Sanitize and validate the notification
    const sanitizedNotification = this.sanitizeNotification(notification)

    if (!this.isValidNotification(sanitizedNotification)) {
      return
    }

    // Add to notifications list
    this.notifications.unshift(sanitizedNotification)
    this.unreadCount++

    // Show toast notification
    this.showToast(sanitizedNotification)

    // Notify listeners
    this.notifyListeners()

    // Dispatch event for UI updates
    window.dispatchEvent(
      new CustomEvent("newNotification", {
        detail: sanitizedNotification,
      }),
    )
  }

  /**
   * Show a toast notification
   * @param {Object} notification - Notification data
   */
  showToast(notification) {
    const toastOptions = {
      onClick: () => this.handleNotificationClick(notification),
      autoClose: 5000,
      className: `notification-toast notification-${notification.type}`,
      position: "top-right",
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    }

    const title = notification.title || notification.message
    const message = notification.message !== title ? notification.message : ""

    toast(
      <div className="notification-content">
        <div className="notification-title">{title}</div>
        {message && <div className="notification-message">{message}</div>}
      </div>,
      toastOptions,
    )
  }

  /**
   * Handle notification click
   * @param {Object} notification - Clicked notification
   */
  handleNotificationClick(notification) {
    // Mark as read
    this.markAsRead(notification._id || notification.id)

    // Dispatch event for UI to handle navigation
    window.dispatchEvent(
      new CustomEvent("notificationClicked", {
        detail: notification,
      }),
    )

    // Close any open notification dropdowns
    document.querySelectorAll(".notification-dropdown").forEach((dropdown) => {
      dropdown.style.display = "none"
    })
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - ID of notification to mark as read
   */
  markAsRead(notificationId) {
    if (!notificationId) return

    // Find the notification in our local list
    const index = this.notifications.findIndex(
      (n) => (n._id && n._id === notificationId) || (n.id && n.id === notificationId),
    )

    // If not found or already read, don't proceed
    if (index === -1) return
    if (this.notifications[index].read) return

    // Update local state
    this.notifications[index].read = true
    this.unreadCount = Math.max(0, this.unreadCount - 1)

    // Notify listeners of the update
    this.notifyListeners()

    // Don't update backend for test notifications
    if (notificationId.length > 10 && !isNaN(Number(notificationId))) {
      return
    }

    // Try the server endpoint that matches your API
    try {
      apiService.put("/notifications/read", { ids: [notificationId] }).catch(() => {
        // Fallback to alternative endpoint if the first one fails
        apiService.put(`/notifications/${notificationId}/read`).catch(() => {
          // Silently fail - we've already updated the UI
        })
      })
    } catch (error) {
      // Silently fail - we've already updated the UI
    }
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead() {
    if (this.notifications.length === 0) return

    // Mark all as read locally
    this.notifications = this.notifications.map((notification) => ({
      ...notification,
      read: true,
    }))

    this.unreadCount = 0

    // Notify listeners
    this.notifyListeners()

    // Collect real notification IDs (not test ones)
    const realNotificationIds = this.notifications
      .filter((n) => {
        const id = n._id || n.id
        return id && !(id.length > 10 && !isNaN(Number(id)))
      })
      .map((n) => n._id || n.id)

    // Only update backend if we have real notifications
    if (realNotificationIds.length > 0) {
      // Try the server endpoint that matches your API
      apiService.put("/notifications/read-all").catch(() => {
        // Fallback to alternative endpoint
        apiService.put("/notifications/read", { ids: realNotificationIds }).catch(() => {
          // Silently fail - we've already updated the UI
        })
      })
    }
  }

  /**
   * Get all notifications
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Notifications
   */
  async getNotifications(options = {}) {
    try {
      const response = await apiService.get("/notifications", options)
      if (response.success) {
        // Filter and sanitize notifications before storing them
        const validNotifications = (response.data || [])
          .map((notification) => this.sanitizeNotification(notification))
          .filter((notification) => this.isValidNotification(notification))

        this.notifications = validNotifications
        this.unreadCount = this.notifications.filter((n) => !n.read).length

        // Notify listeners
        this.notifyListeners()

        return this.notifications
      }
      return []
    } catch (error) {
      return []
    }
  }

  /**
   * Update notification settings
   * @param {Object} settings - New notification settings
   */
  updateSettings(settings) {
    this.userSettings = {
      ...this.userSettings,
      notifications: settings,
    }
  }

  /**
   * Add a listener for notification updates
   * @param {Function} listener - Callback function
   * @returns {Function} - Function to remove the listener
   */
  addListener(listener) {
    this.listeners.push(listener)

    // Return function to remove listener
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener)
    }
  }

  /**
   * Notify all listeners of changes
   */
  notifyListeners() {
    const data = {
      notifications: this.notifications,
      unreadCount: this.unreadCount,
    }

    this.listeners.forEach((listener) => {
      try {
        listener(data)
      } catch (err) {
        // Silently catch listener errors
      }
    })
  }

  /**
   * Add a test notification for development/testing
   */
  addTestNotification() {
    const newNotification = {
      _id: Date.now().toString(),
      type: "message",
      title: "Test Notification",
      message: "This is a test notification",
      read: false,
      createdAt: new Date().toISOString(),
    }

    this.addNotification(newNotification)
  }
}

// Create and export singleton instance
const notificationService = new NotificationService()
export default notificationService

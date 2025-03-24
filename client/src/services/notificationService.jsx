"use client";

import apiService from "./apiService.jsx";
import { toast } from "react-toastify";
import socketService from "./socketService.jsx";

class NotificationService {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.initialized = false;
    this.userSettings = null;
    this.listeners = [];
  }

  /**
   * Initialize the notification service with user settings.
   * Registers socket events and fetches existing notifications.
   *
   * @param {Object} userSettings - User notification settings.
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
    };
    this.initialized = true;
    this.registerSocketListeners();
    this.getNotifications();
  }

  /**
   * Registers socket event listeners for incoming notifications.
   * Each event is mapped to a handler that validates settings and then adds a notification.
   * If the socket is not available, it retries registration after 1 second.
   */
  registerSocketListeners() {
    if (!socketService.socket) {
      console.warn("Socket not available for notification service. Retrying in 1 second...");
      setTimeout(() => {
        this.registerSocketListeners();
      }, 1000);
      return;
    }

    console.log("Registering notification socket listeners");

    socketService.socket.on("new_message", (data) => {
      console.log("Received new_message event:", data);
      if (this.shouldShowNotification("messages")) {
        const senderNickname = data.sender?.nickname || "Someone";
        this.addNotification({
          type: "message",
          title: `New message from ${senderNickname}`,
          message: data.content || "Click to view message",
          time: "Just now",
          read: false,
          sender: data.sender,
          data: data,
        });
      }
    });

    socketService.socket.on("incoming_call", (data) => {
      console.log("Received incoming_call event:", data);
      if (this.shouldShowNotification("calls")) {
        const callerNickname = data.caller?.nickname || data.caller?.name || "Someone";
        this.addNotification({
          type: "call",
          title: `Incoming call from ${callerNickname}`,
          message: "Click to answer",
          time: "Just now",
          read: false,
          sender: data.caller,
          data: data,
        });
      }
    });

    socketService.socket.on("new_story", (data) => {
      console.log("Received new_story event:", data);
      if (this.shouldShowNotification("stories")) {
        const creatorNickname = data.creator?.nickname || "Someone";
        this.addNotification({
          type: "story",
          title: `New story from ${creatorNickname}`,
          message: "Click to view",
          time: "Just now",
          read: false,
          sender: data.creator,
          data: data,
        });
      }
    });

    socketService.socket.on("new_like", (data) => {
      console.log("Received new_like event:", data);
      if (this.shouldShowNotification("likes")) {
        const senderNickname = data.sender?.nickname || "Someone";
        const isMatch = data.isMatch;
        this.addNotification({
          type: isMatch ? "match" : "like",
          title: isMatch
            ? `You matched with ${senderNickname}!`
            : `${senderNickname} liked your profile`,
          message: isMatch ? "Click to start chatting" : "Click to view their profile",
          time: "Just now",
          read: false,
          sender: data.sender,
          data: data,
        });
      } else {
        console.log("Like notification filtered out by settings");
      }
    });

    socketService.socket.on("photo_permission_request", (data) => {
      console.log("Received photo_permission_request event:", data);
      if (this.shouldShowNotification("photoRequests")) {
        const requesterNickname = data.requester?.nickname || "Someone";
        this.addNotification({
          type: "photoRequest",
          title: `${requesterNickname} requested access to your private photo`,
          message: "Click to review the request",
          time: "Just now",
          read: false,
          sender: data.requester,
          data: {
            ...data,
            requester: data.requester,
            photoId: data.photoId,
            permissionId: data.permissionId,
          },
        });
      } else {
        console.log("Photo request notification filtered out by settings");
      }
    });

    socketService.socket.on("photo_permission_response", (data) => {
      console.log("Received photo_permission_response event:", data);
      if (this.shouldShowNotification("photoRequests")) {
        const ownerNickname = data.owner?.nickname || "Someone";
        const action = data.status === "approved" ? "approved" : "rejected";
        this.addNotification({
          type: "photoResponse",
          title: `${ownerNickname} ${action} your photo request`,
          message:
            data.status === "approved"
              ? "You can now view their private photo"
              : "Your request was declined",
          time: "Just now",
          read: false,
          sender: data.owner,
          data: {
            ...data,
            owner: data.owner,
            photoId: data.photoId,
            status: data.status,
          },
        });
      } else {
        console.log("Photo response notification filtered out by settings");
      }
    });

    socketService.socket.on("new_comment", (data) => {
      console.log("Received new_comment event:", data);
      if (this.shouldShowNotification("comments")) {
        const commenterNickname = data.commenter?.nickname || "Someone";
        const commentText = data.comment || "";
        this.addNotification({
          type: "comment",
          title: `${commenterNickname} commented on your ${data.contentType || "content"}`,
          message: commentText.substring(0, 50) + (commentText.length > 50 ? "..." : ""),
          time: "Just now",
          read: false,
          sender: data.commenter,
          data: data,
        });
      }
    });

    socketService.socket.on("notification", (data) => {
      console.log("Received generic notification event:", data);
      if (this.shouldShowNotification(data.type)) {
        this.addNotification(data);
      }
    });
  }

  /**
   * Determines whether a notification should be shown based on user settings.
   *
   * @param {string} notificationType - The type of notification.
   * @returns {boolean} - True if the notification should be shown.
   */
  shouldShowNotification(notificationType) {
    if (!this.initialized || !this.userSettings) return true;
    let normalizedType = notificationType;
    if (notificationType === "new_like" || notificationType === "like") {
      normalizedType = "likes";
    } else if (
      notificationType === "photo_permission_request" ||
      notificationType === "photoRequest"
    ) {
      normalizedType = "photoRequests";
    } else if (
      notificationType === "photo_permission_response" ||
      notificationType === "photoResponse"
    ) {
      normalizedType = "photoRequests";
    } else if (notificationType === "new_message" || notificationType === "message") {
      normalizedType = "messages";
    }
    if (this.userSettings.notifications?.[normalizedType] !== undefined) {
      return this.userSettings.notifications[normalizedType];
    }
    return this.userSettings.notifications?.general !== false;
  }

  /**
   * Validates that the notification contains required fields.
   *
   * @param {Object} notification - The notification object.
   * @returns {boolean} - True if valid.
   */
  isValidNotification(notification) {
    if (!notification) return false;
    const hasId = notification._id || notification.id;
    const hasMessage = notification.message || notification.title || notification.content;
    const hasType = notification.type;
    return Boolean(hasId && hasMessage && hasType);
  }

  /**
   * Ensures a notification object contains all required fields.
   *
   * @param {Object} notification - The notification object.
   * @returns {Object} - Sanitized notification object.
   */
  sanitizeNotification(notification) {
    if (!notification) return null;
    const sanitized = { ...notification };
    if (!sanitized._id && !sanitized.id) {
      sanitized._id = Date.now().toString();
    }
    if (!sanitized.message && !sanitized.title && !sanitized.content) {
      sanitized.message = "New notification";
    }
    if (!sanitized.type) {
      sanitized.type = "system";
    }
    if (!sanitized.createdAt) {
      sanitized.createdAt = new Date().toISOString();
    }
    if (sanitized.read === undefined) {
      sanitized.read = false;
    }
    return sanitized;
  }

  /**
   * Adds a new notification: sanitizes, validates, updates state, shows toast,
   * notifies listeners, and dispatches a custom event.
   *
   * @param {Object} notification - Notification data.
   */
  addNotification(notification) {
    const sanitizedNotification = this.sanitizeNotification(notification);
    if (!this.isValidNotification(sanitizedNotification)) return;
    this.notifications.unshift(sanitizedNotification);
    this.unreadCount++;
    this.showToast(sanitizedNotification);
    this.notifyListeners();
    window.dispatchEvent(
      new CustomEvent("newNotification", { detail: sanitizedNotification })
    );
  }

  /**
   * Displays a toast using react-toastify with custom content and options.
   *
   * @param {Object} notification - Notification data.
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
    };
    const title = notification.title || notification.message;
    const message = notification.message !== title ? notification.message : "";
    toast(
      <div className="notification-content">
        <div className="notification-title">{title}</div>
        {message && <div className="notification-message">{message}</div>}
      </div>,
      toastOptions
    );
  }

  /**
   * Handles click events on a notification: marks it as read, dispatches a custom event,
   * and closes open dropdowns.
   *
   * @param {Object} notification - The clicked notification.
   */
  handleNotificationClick(notification) {
    this.markAsRead(notification._id || notification.id);
    window.dispatchEvent(
      new CustomEvent("notificationClicked", { detail: notification })
    );
    document.querySelectorAll(".notification-dropdown").forEach((dropdown) => {
      dropdown.style.display = "none";
    });
  }

  /**
   * Marks a notification as read, updates state and UI, and calls the backend API.
   *
   * @param {string} notificationId - The notification ID.
   */
  markAsRead(notificationId) {
    if (!notificationId) return;
    const index = this.notifications.findIndex(
      (n) =>
        (n._id && n._id === notificationId) ||
        (n.id && n.id === notificationId)
    );
    if (index === -1 || this.notifications[index].read) return;
    this.notifications[index].read = true;
    this.unreadCount = Math.max(0, this.unreadCount - 1);
    this.notifyListeners();
    if (notificationId.length > 10 && !isNaN(Number(notificationId))) return;
    try {
      apiService
        .put("/notifications/read", { ids: [notificationId] })
        .catch(() => {
          apiService.put(`/notifications/${notificationId}/read`).catch(() => {});
        });
    } catch (error) {
      // Silently fail as UI is already updated
    }
  }

  /**
   * Marks all notifications as read, updates state and the backend.
   */
  markAllAsRead() {
    if (this.notifications.length === 0) return;
    this.notifications = this.notifications.map((notification) => ({
      ...notification,
      read: true,
    }));
    this.unreadCount = 0;
    this.notifyListeners();
    const realNotificationIds = this.notifications
      .filter((n) => {
        const id = n._id || n.id;
        return id && !(id.length > 10 && !isNaN(Number(id)));
      })
      .map((n) => n._id || n.id);
    if (realNotificationIds.length > 0) {
      apiService.put("/notifications/read-all").catch(() => {
        apiService.put("/notifications/read", { ids: realNotificationIds }).catch(() => {});
      });
    }
  }

  /**
   * Retrieves notifications from the backend and updates local state.
   *
   * @param {Object} options - Optional query parameters.
   * @returns {Promise<Array>} - The notifications.
   */
  async getNotifications(options = {}) {
    try {
      const response = await apiService.get("/notifications", options);
      if (response.success) {
        const validNotifications = (response.data || [])
          .map((notification) => this.sanitizeNotification(notification))
          .filter((notification) => this.isValidNotification(notification));
        this.notifications = validNotifications;
        this.unreadCount = this.notifications.filter((n) => !n.read).length;
        this.notifyListeners();
        return this.notifications;
      }
      return [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Updates the local user settings for notifications.
   *
   * @param {Object} settings - New notification settings.
   */
  updateSettings(settings) {
    this.userSettings = {
      ...this.userSettings,
      notifications: settings,
    };
  }

  /**
   * Registers a listener callback to be notified when the notifications state changes.
   *
   * @param {Function} listener - The callback function.
   * @returns {Function} - A function to remove the listener.
   */
  addListener(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Notifies all registered listeners with the current notifications state.
   */
  notifyListeners() {
    const data = {
      notifications: this.notifications,
      unreadCount: this.unreadCount,
    };
    this.listeners.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        // Silently ignore listener errors
      }
    });
  }

  /**
   * Adds a test notification for development and testing purposes.
   */
  addTestNotification() {
    const newNotification = {
      _id: Date.now().toString(),
      type: "message",
      title: "Test Notification",
      message: "This is a test notification",
      read: false,
      createdAt: new Date().toISOString(),
    };
    this.addNotification(newNotification);
  }
}

const notificationService = new NotificationService();
export default notificationService;

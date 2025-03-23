"use client"
// client/src/components/LayoutComponents.js
import { useEffect, useState, useRef } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth, useNotifications } from "../context"
import { toast } from "react-toastify"
import {
  FaUserCircle,
  FaBell,
  FaSearch,
  FaHeart,
  FaTimes,
  FaExclamationTriangle,
  FaEnvelope,
  FaCamera,
  FaImage,
} from "react-icons/fa"
import { ThemeToggle } from "./theme-toggle.tsx"

// Modern Navbar Component
export const Navbar = () => {
  // Local state for notifications and dropdown toggling
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [notificationPulse, setNotificationPulse] = useState(false)

  // Refs for dropdown elements
  const notificationDropdownRef = useRef(null)
  const userDropdownRef = useRef(null)
  const notificationButtonRef = useRef(null)

  // Get global notification state from context
  const {
    notifications,
    unreadCount,
    isLoading: loadingNotifications,
    addTestNotification,
    markAsRead,
    markAllAsRead,
    handleNotificationClick,
  } = useNotifications()

  const { isAuthenticated, logout, user } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async (e) => {
    e.preventDefault()
    await logout()
  }

  const navigateToProfile = () => {
    navigate("/profile")
  }

  // Toggle notification dropdown using state
  const toggleNotificationDropdown = (e) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setShowNotifications((prevState) => !prevState)
    setShowUserDropdown(false) // Close user dropdown
  }

  // Toggle user dropdown using state
  const toggleUserDropdown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setShowUserDropdown(!showUserDropdown)
    setShowNotifications(false) // Close notification dropdown
  }

  // Close dropdowns if clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(event.target) &&
        notificationButtonRef.current &&
        !notificationButtonRef.current.contains(event.target)
      ) {
        setShowNotifications(false)
      }
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target) &&
        !event.target.closest(".user-avatar-dropdown")
      ) {
        setShowUserDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Handle adding a test notification
  const handleAddTestNotification = (e) => {
    if (e) {
      e.stopPropagation()
    }

    setNotificationPulse(true)
    setTimeout(() => setNotificationPulse(false), 2000)

    addTestNotification()
  }

  // Format notification time in a human-readable way
  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return "Just now"

    const now = new Date()
    const notificationTime = new Date(timestamp)
    const diffMs = now - notificationTime
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60) return "Just now"
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHour < 24) return `${diffHour}h ago`
    if (diffDay < 7) return `${diffDay}d ago`

    return notificationTime.toLocaleDateString()
  }

  // Get appropriate action text based on notification type
  const getNotificationAction = (notification) => {
    switch (notification.type) {
      case "message":
        return "sent you a message"
      case "like":
        return "liked your profile"
      case "photoRequest":
        return "requested access to your photo"
      case "photoResponse":
        const status = notification.data?.status || ""
        return status === "approved" ? "approved your photo request" : "declined your photo request"
      case "story":
        return "shared a new story"
      case "comment":
        return "commented on your post"
      default:
        return "sent a notification"
    }
  }

  // Render notifications list with validation
  const renderNotifications = () => {
    if (loadingNotifications) {
      return (
        <div className="notification-loading">
          <div className="spinner"></div>
          <p>Loading notifications...</p>
        </div>
      )
    }

    // Filter out invalid notifications before rendering
    const validNotifications = notifications.filter((notification) => {
      // Check if notification has required fields
      const hasMessage = notification.message || notification.title || notification.content
      const hasId = notification._id || notification.id

      // Only return notifications that have at least basic required fields
      return hasId && hasMessage
    })

    if (!validNotifications || validNotifications.length === 0) {
      return (
        <div className="notification-empty">
          <FaBell size={32} />
          <p>No notifications yet</p>
          <button onClick={handleAddTestNotification} className="btn btn-sm btn-primary mt-3">
            Add Test Notification
          </button>
        </div>
      )
    }

    return validNotifications.map((notification) => {
      // Extract notification message from available fields
      const notificationMessage =
        notification.message || notification.title || notification.content || "New notification"

      // Extract sender nickname from various possible locations
      const senderNickname =
        notification.sender?.nickname ||
        notification.data?.sender?.nickname ||
        notification.data?.requester?.nickname ||
        notification.data?.owner?.nickname ||
        notification.data?.user?.nickname ||
        "Someone"

      // Format the notification time
      const notificationTime = formatNotificationTime(notification.createdAt)

      // Choose icon based on notification type
      let NotificationIcon = FaBell
      if (notification.type === "message") NotificationIcon = FaEnvelope
      if (notification.type === "like") NotificationIcon = FaHeart
      if (notification.type === "photoRequest" || notification.type === "photoResponse") NotificationIcon = FaCamera
      if (notification.type === "story") NotificationIcon = FaImage

      // Determine if this is a new notification (less than 1 minute old)
      const isNew = notification.createdAt && new Date().getTime() - new Date(notification.createdAt).getTime() < 60000

      return (
        <div
          key={notification._id || notification.id || Date.now()}
          className={`notification-item ${!notification.read ? "unread" : ""} ${isNew ? "new-notification" : ""}`}
          onClick={() => handleNotificationClick(notification)}
        >
          <div className="notification-icon">
            <NotificationIcon />
          </div>
          <div className="notification-content">
            <div className="notification-title">
              <span className="notification-sender">{senderNickname}</span> {getNotificationAction(notification)}
            </div>
            <div className="notification-message">{notificationMessage}</div>
            <div className="notification-time">
              {notificationTime}
              {!notification.read && <span className="notification-time-dot"></span>}
              {!notification.read && <span>Unread</span>}
            </div>
          </div>
        </div>
      )
    })
  }

  const handleMarkAllAsRead = (e) => {
    e.stopPropagation()
    markAllAsRead()
    toast.success("All notifications marked as read")
  }

  return (
    <header className="modern-header">
      <div className="container d-flex justify-content-between align-items-center">
        <div className="logo" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
          Mandarin
        </div>

        {isAuthenticated && (
          <div className="main-tabs d-none d-md-flex">
            <button
              className={`tab-button ${window.location.pathname === "/dashboard" ? "active" : ""}`}
              onClick={() => navigate("/dashboard")}
            >
              <FaSearch className="tab-icon" />
              <span>Discover</span>
            </button>
            <button
              className={`tab-button ${window.location.pathname === "/matches" ? "active" : ""}`}
              onClick={() => navigate("/matches")}
            >
              <FaHeart className="tab-icon" />
              <span>Matches</span>
            </button>
          </div>
        )}

        <div className="header-actions d-flex align-items-center">
          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <div style={{ position: "relative", marginLeft: "10px" }}>
                {/* Using notification-specific class to avoid conflicts */}
                <button
                  ref={notificationButtonRef}
                  onClick={toggleNotificationDropdown}
                  aria-label="Notifications"
                  className={`notification-specific-button ${notificationPulse ? "notification-pulse" : ""}`}
                >
                  <FaBell size={20} />
                  {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
                  )}
                </button>

                {showNotifications && (
                  <div ref={notificationDropdownRef} className="notification-dropdown">
                    <div className="notification-header">
                      <span>Notifications</span>
                      {unreadCount > 0 && (
                        <span className="notification-header-action" onClick={handleMarkAllAsRead}>
                          Mark all as read
                        </span>
                      )}
                    </div>
                    <div className="notification-list">{renderNotifications()}</div>
                  </div>
                )}
              </div>

              <div className="user-avatar-dropdown" style={{ marginLeft: "10px" }}>
                <div style={{ position: "relative" }}>
                  {user?.photos?.length > 0 ? (
                    <img
                      src={user.photos[0].url || "/placeholder.svg?height=32&width=32"}
                      alt={user.nickname}
                      className="user-avatar"
                      style={{ width: "32px", height: "32px" }}
                      onClick={toggleUserDropdown}
                    />
                  ) : (
                    <FaUserCircle
                      style={{
                        fontSize: "32px",
                        cursor: "pointer",
                        color: "var(--text-color)",
                      }}
                      onClick={toggleUserDropdown}
                    />
                  )}

                  {showUserDropdown && (
                    <div ref={userDropdownRef} className="user-dropdown">
                      <div className="user-dropdown-item" onClick={navigateToProfile}>
                        Profile
                      </div>
                      <div className="user-dropdown-item" onClick={() => navigate("/settings")}>
                        Settings
                      </div>
                      <div className="user-dropdown-item" onClick={() => navigate("/subscription")}>
                        Subscription
                      </div>
                      <div className="user-dropdown-divider"></div>
                      <div className="user-dropdown-item danger" onClick={handleLogout}>
                        Logout
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="auth-buttons">
              <Link to="/login" className="btn btn-outline me-2">
                Login
              </Link>
              <Link to="/register" className="btn btn-primary">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Custom styles for notification specific elements */}
      <style jsx="true">{`
        .notification-specific-button {
          background: var(--primary-color, #ff3366);
          border: none;
          cursor: pointer;
          padding: 0.6rem;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          width: 40px;
          height: 40px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          z-index: 101;
          transition: all 0.3s ease;
          pointer-events: auto;
          color: white;
          outline: none;
        }

        .notification-specific-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        }

        .notification-specific-button:active {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }

        .notification-dropdown {
          z-index: 1050;
          display: block;
          visibility: visible;
          opacity: 1;
          position: absolute;
          right: 0;
          top: 100%;
          width: 320px;
          max-height: 400px;
          overflow-y: auto;
        }
        
        .notification-empty {
          padding: 20px;
          text-align: center;
          color: var(--text-light);
        }
        
        .notification-list {
          max-height: 300px;
          overflow-y: auto;
        }

        .notification-item {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: flex-start;
          cursor: pointer;
          transition: background-color 0.2s ease;
        }

        .notification-item:hover {
          background-color: var(--bg-light);
        }

        .notification-item.unread {
          background-color: var(--bg-unread);
        }

        .mt-3 {
          margin-top: 12px;
        }

        .btn-sm {
          padding: 4px 12px;
          font-size: 0.875rem;
        }

        .spinner {
          display: inline-block;
          width: 24px;
          height: 24px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-radius: 50%;
          border-top-color: var(--primary);
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes notification-pulse {
          0% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(255, 51, 102, 0.7);
          }
          
          70% {
            transform: scale(1.1);
            box-shadow: 0 0 0 10px rgba(255, 51, 102, 0);
          }
          
          100% {
            transform: scale(1);
            box-shadow: 0 0 0 0 rgba(255, 51, 102, 0);
          }
        }

        .notification-pulse {
          animation: notification-pulse 1s cubic-bezier(0.66, 0, 0, 1) 2;
        }
      `}</style>
    </header>
  )
}

// Modern Alert Component
export const Alert = ({ type, message, onClose, actions }) => {
  // Auto-close alert after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onClose) onClose()
    }, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  // Ensure message is a string
  const formatMessage = (msg) => {
    if (msg === null || msg === undefined) return ""
    if (typeof msg === "string") return msg
    if (typeof msg === "object") {
      if (msg.message) return msg.message
      if (msg.text) return msg.text
      try {
        return JSON.stringify(msg)
      } catch (e) {
        return "An error occurred"
      }
    }
    return String(msg)
  }

  // If type is "toast", show a toast and return null
  useEffect(() => {
    if (type === "toast") {
      try {
        if (typeof message === "object" && message !== null) {
          const toastType = message.type || "info"
          const toastMessage = message.text || formatMessage(message)
          toast[toastType](toastMessage)
        } else {
          toast.info(formatMessage(message))
        }
        if (onClose) onClose()
      } catch (e) {
        console.error("Error showing toast:", e)
        toast.info("Notification")
      }
    }
  }, [type, message, onClose])

  if (type === "toast") return null

  // Map alert types to classes and icons
  const alertClasses = {
    success: "alert-success",
    warning: "alert-warning",
    danger: "alert-danger",
    info: "alert-info",
    primary: "alert-primary",
  }

  const alertIcons = {
    success: <span className="alert-icon success"></span>,
    warning: <FaExclamationTriangle className="alert-icon warning" />,
    danger: <FaExclamationTriangle className="alert-icon danger" />,
    info: <span className="alert-icon info"></span>,
    primary: <span className="alert-icon primary"></span>,
  }

  return (
    <div className={`alert ${alertClasses[type] || "alert-primary"}`}>
      {alertIcons[type]}
      <span className="alert-message">{formatMessage(message)}</span>
      {actions && (
        <div className="alert-actions">
          {actions.map((action, index) => (
            <button
              key={index}
              className={`btn btn-sm ${action.type ? `btn-${action.type}` : "btn-primary"}`}
              onClick={action.action}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {onClose && (
        <button className="alert-close-btn" onClick={onClose}>
          <FaTimes />
        </button>
      )}
    </div>
  )
}

// Private Route Component
export const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading, error } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login", {
        replace: true,
        state: { from: window.location.pathname },
      })
    }
  }, [isAuthenticated, loading, navigate])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner spinner-dark"></div>
        <p className="loading-text">Loading...</p>
      </div>
    )
  }

  if (error) {
    const errorMessage =
      typeof error === "object" && error !== null
        ? error.message || JSON.stringify(error)
        : String(error || "Authentication error")

    return (
      <div className="auth-error">
        <div className="auth-error-content">
          <FaExclamationTriangle className="auth-error-icon" />
          <h3>Authentication Error</h3>
          <p>{errorMessage}</p>
          <button onClick={() => navigate("/login")} className="btn btn-primary">
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return isAuthenticated ? children : null
}

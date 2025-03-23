"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, useNotifications } from "../context";
import { toast } from "react-toastify";
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
} from "react-icons/fa";
import { ThemeToggle } from "./theme-toggle.tsx";
import "../styles/notifications.css"; // Import the notifications styles

/**
 * Navbar Component
 *
 * Renders the modern header with logo, navigation tabs,
 * a notification button with dropdown, and a user avatar dropdown.
 * All visual styling is handled by external CSS.
 */
export const Navbar = () => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [notificationPulse, setNotificationPulse] = useState(false);
  const notificationDropdownRef = useRef(null);
  const userDropdownRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const {
    notifications,
    unreadCount,
    isLoading: loadingNotifications,
    addTestNotification,
    markAllAsRead,
    handleNotificationClick,
  } = useNotifications();
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  // Handler: Logout
  const handleLogout = async (e) => {
    e.preventDefault();
    await logout();
  };

  // Handler: Navigate to profile
  const navigateToProfile = useCallback(() => {
    navigate("/profile");
  }, [navigate]);

  // Toggle notification dropdown; close user dropdown.
  const toggleNotificationDropdown = useCallback((e) => {
    e?.preventDefault();
    e?.stopPropagation();
    setShowNotifications((prev) => !prev);
    setShowUserDropdown(false);
  }, []);

  // Toggle user dropdown; close notification dropdown.
  const toggleUserDropdown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowUserDropdown((prev) => !prev);
    setShowNotifications(false);
  }, []);

  // Close dropdowns when clicking outside.
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(event.target) &&
        notificationButtonRef.current &&
        !notificationButtonRef.current.contains(event.target)
      ) {
        setShowNotifications(false);
      }
      if (
        userDropdownRef.current &&
        !userDropdownRef.current.contains(event.target) &&
        !event.target.closest(".user-avatar-dropdown")
      ) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Add a test notification (for development/testing).
  const handleAddTestNotification = useCallback((e) => {
    e?.stopPropagation();
    setNotificationPulse(true);
    setTimeout(() => setNotificationPulse(false), 2000);
    addTestNotification();
  }, [addTestNotification]);

  // Format notification time for display.
  const formatNotificationTime = useCallback((timestamp) => {
    if (!timestamp) return "Just now";
    const now = new Date();
    const notificationTime = new Date(timestamp);
    const diffMs = now - notificationTime;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return notificationTime.toLocaleDateString();
  }, []);

  // Determine action text for notifications.
  const getNotificationAction = useCallback((notification) => {
    switch (notification.type) {
      case "message":
        return "sent you a message";
      case "like":
        return "liked your profile";
      case "photoRequest":
        return "requested access to your photo";
      case "photoResponse":
        return notification.data?.status === "approved"
          ? "approved your photo request"
          : "declined your photo request";
      case "story":
        return "shared a new story";
      case "comment":
        return "commented on your post";
      default:
        return "sent a notification";
    }
  }, []);

  // Render notifications list.
  const renderNotifications = useCallback(() => {
    if (loadingNotifications) {
      return (
        <div className="notification-loading">
          <div className="spinner"></div>
          <p>Loading notifications...</p>
        </div>
      );
    }
    const validNotifications = notifications.filter((n) => {
      const hasMessage = n.message || n.title || n.content;
      const hasId = n._id || n.id;
      return hasId && hasMessage;
    });
    if (!validNotifications.length) {
      return (
        <div className="notification-empty">
          <FaBell size={32} />
          <p>No notifications yet</p>
          <button onClick={handleAddTestNotification} className="btn btn-sm btn-primary mt-3">
            Add Test Notification
          </button>
        </div>
      );
    }
    return validNotifications.map((notification) => {
      const notificationMessage = notification.message || notification.title || notification.content || "New notification";
      const senderNickname =
        notification.sender?.nickname ||
        notification.data?.sender?.nickname ||
        notification.data?.requester?.nickname ||
        notification.data?.owner?.nickname ||
        notification.data?.user?.nickname ||
        "Someone";
      const notificationTime = formatNotificationTime(notification.createdAt);
      let NotificationIcon = FaBell;
      if (notification.type === "message") NotificationIcon = FaEnvelope;
      if (notification.type === "like") NotificationIcon = FaHeart;
      if (notification.type === "photoRequest" || notification.type === "photoResponse") NotificationIcon = FaCamera;
      if (notification.type === "story") NotificationIcon = FaImage;
      const isNew = notification.createdAt && new Date().getTime() - new Date(notification.createdAt).getTime() < 60000;
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
      );
    });
  }, [notifications, loadingNotifications, formatNotificationTime, getNotificationAction, handleAddTestNotification, handleNotificationClick]);

  const handleMarkAllAsRead = useCallback((e) => {
    e.stopPropagation();
    markAllAsRead();
    toast.success("All notifications marked as read");
  }, [markAllAsRead]);

  return (
    <header className="modern-header">
      <div className="container d-flex justify-content-between align-items-center">
        {/* Logo */}
        <div className="logo" onClick={() => navigate("/")}>
          Mandarin
        </div>

        {/* Navigation Tabs */}
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

        {/* Header Actions */}
        <div className="header-actions d-flex align-items-center">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              {/* Notification Button */}
              <div className="notification-wrapper">
                <button
                  ref={notificationButtonRef}
                  onClick={toggleNotificationDropdown}
                  aria-label="Notifications"
                  className="notification-specific-button"
                >
                  <FaBell size={20} />
                  {unreadCount > 0 && (
                    <span className="notification-badge">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
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

              {/* User Avatar and Dropdown */}
              <div className="user-avatar-dropdown">
                <div className="avatar-container">
                  {user?.photos?.length > 0 ? (
                    <img
                      src={user.photos[0].url || "/placeholder.svg"}
                      alt={user.nickname}
                      className="user-avatar"
                      onClick={toggleUserDropdown}
                    />
                  ) : (
                    <FaUserCircle className="user-avatar-icon" onClick={toggleUserDropdown} />
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
    </header>
  );
};

/**
 * Alert Component
 *
 * Displays an alert message with optional action buttons.
 * If the type is "toast", it triggers a toast notification.
 */
export const Alert = ({ type, message, onClose, actions }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose && onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const formatMessage = (msg) => {
    if (msg == null) return "";
    if (typeof msg === "string") return msg;
    if (typeof msg === "object") {
      if (msg.message) return msg.message;
      if (msg.text) return msg.text;
      try {
        return JSON.stringify(msg);
      } catch (e) {
        return "An error occurred";
      }
    }
    return String(msg);
  };

  useEffect(() => {
    if (type === "toast") {
      try {
        if (typeof message === "object" && message !== null) {
          const toastType = message.type || "info";
          const toastMessage = message.text || formatMessage(message);
          toast[toastType](toastMessage);
        } else {
          toast.info(formatMessage(message));
        }
        onClose && onClose();
      } catch (e) {
        console.error("Error showing toast:", e);
        toast.info("Notification");
      }
    }
  }, [type, message, onClose]);

  if (type === "toast") return null;

  const alertClasses = {
    success: "alert-success",
    warning: "alert-warning",
    danger: "alert-danger",
    info: "alert-info",
    primary: "alert-primary",
  };

  const alertIcons = {
    success: <span className="alert-icon success"></span>,
    warning: <FaExclamationTriangle className="alert-icon warning" />,
    danger: <FaExclamationTriangle className="alert-icon danger" />,
    info: <span className="alert-icon info"></span>,
    primary: <span className="alert-icon primary"></span>,
  };

  return (
    <div className={`alert ${alertClasses[type] || "alert-primary"}`}>
      {alertIcons[type]}
      <span className="alert-message">{formatMessage(message)}</span>
      {actions && (
        <div className="alert-actions">
          {actions.map((action, index) => (
            <button key={index} className={`btn btn-sm ${action.type ? `btn-${action.type}` : "btn-primary"}`} onClick={action.action}>
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
  );
};

/**
 * PrivateRoute Component
 *
 * Protects routes by ensuring that the user is authenticated.
 * If the user is not authenticated, it redirects to the login page.
 */
export const PrivateRoute = ({ children }) => {
  const { isAuthenticated, loading, error } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login", {
        replace: true,
        state: { from: window.location.pathname },
      });
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner spinner-dark"></div>
        <p className="loading-text">Loading...</p>
      </div>
    );
  }

  if (error) {
    const errorMessage =
      typeof error === "object" && error !== null ? error.message || JSON.stringify(error) : String(error || "Authentication error");
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
    );
  }

  return isAuthenticated ? children : null;
};

export default {
  Navbar,
  Alert,
  PrivateRoute,
};

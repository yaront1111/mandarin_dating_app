"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { useAuth } from "./AuthContext"
import notificationService from "../services/notificationService"
import { toast } from "react-toastify"
import { useNavigate } from "react-router-dom"

// Create context
const NotificationContext = createContext()

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  // Initialize notification service when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      setIsLoading(true)

      // Get user notification settings from user object or use defaults
      const userSettings = user.settings || {
        notifications: {
          messages: true,
          calls: true,
          stories: true,
          likes: true,
          comments: true,
        },
      }

      // Initialize notification service
      notificationService.initialize(userSettings)

      // Add listener for notification updates
      const removeListener = notificationService.addListener((data) => {
        setNotifications(data.notifications)
        setUnreadCount(data.unreadCount)
      })

      // Fetch initial notifications
      notificationService
        .getNotifications()
        .then((fetchedNotifications) => {
          setNotifications(fetchedNotifications)
          setUnreadCount(fetchedNotifications.filter((n) => !n.read).length)
          setIsLoading(false)
        })
        .catch((error) => {
          console.error("Error fetching notifications:", error)
          setIsLoading(false)
          // Initialize with empty array to prevent undefined errors
          setNotifications([])
        })

      // Clean up listener on unmount
      return () => {
        removeListener()
      }
    } else {
      // Reset state when user logs out
      setNotifications([])
      setUnreadCount(0)
    }
  }, [isAuthenticated, user])

  // Update the addTestNotification function to include more realistic test data

  // Add a test notification (for development/testing)
  const addTestNotification = () => {
    // Create random notification types for testing
    const notificationTypes = [
      {
        type: "message",
        title: "New message from Test User",
        message: "Hey there! This is a test message. How are you doing today?",
        sender: { nickname: "Test User", _id: "test123" },
        data: {
          conversationId: "test-convo",
          sender: { nickname: "Test User", _id: "test123" },
        },
      },
      {
        type: "like",
        title: "Test User liked your profile",
        message: "Click to view their profile",
        sender: { nickname: "Test User", _id: "test123" },
        data: {
          sender: { nickname: "Test User", _id: "test123" },
        },
      },
      {
        type: "photoRequest",
        title: "Test User requested access to your private photo",
        message: "Click to review the request",
        sender: { nickname: "Test User", _id: "test123" },
        data: {
          requester: { nickname: "Test User", _id: "test123" },
          photoId: "test-photo-123",
        },
      },
      {
        type: "photoResponse",
        title: "Test User approved your photo request",
        message: "You can now view their private photo",
        sender: { nickname: "Test User", _id: "test123" },
        data: {
          owner: { nickname: "Test User", _id: "test123" },
          photoId: "test-photo-123",
          status: "approved",
        },
      },
    ]

    // Select a random notification type
    const randomNotification = notificationTypes[Math.floor(Math.random() * notificationTypes.length)]

    const newNotification = {
      _id: Date.now().toString(),
      ...randomNotification,
      read: false,
      createdAt: new Date().toISOString(),
    }

    // Add to local state immediately for UI feedback
    setNotifications((prev) => [newNotification, ...prev])
    setUnreadCount((prev) => prev + 1)

    // Also add to service
    notificationService.addNotification(newNotification)
    toast.info(`Test ${randomNotification.type} notification added`)
  }

  // Mark a notification as read
  const markAsRead = (notificationId) => {
    if (!notificationId) return

    // Update local state
    setNotifications((prev) =>
      prev.map((notification) =>
        notification._id === notificationId || notification.id === notificationId
          ? { ...notification, read: true }
          : notification,
      ),
    )

    // Update unread count
    setUnreadCount((prev) => Math.max(0, prev - 1))

    // Also update in service
    notificationService.markAsRead(notificationId)
  }

  // Mark all notifications as read
  const markAllAsRead = () => {
    // Only proceed if there are notifications
    if (!notifications || notifications.length === 0) return

    // Update local state
    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
    setUnreadCount(0)

    // Update in service
    notificationService.markAllAsRead()
  }

  // Update the handleNotificationClick function to handle likes and photo requests
  const handleNotificationClick = (notification) => {
    if (!notification) return

    console.log("Notification clicked:", notification)

    // Mark as read if not already
    if (!notification.read) {
      markAsRead(notification._id || notification.id)
    }

    // Navigate based on notification type
    try {
      if (notification.type === "message") {
        // Get conversation partner info
        const partnerId = notification.sender?._id || notification.data?.sender?._id || notification.data?.user?._id

        // Navigate to messages or the specific conversation
        if (notification.data?.conversationId) {
          navigate(`/messages/${notification.data.conversationId}`)
        } else if (partnerId) {
          navigate(`/messages/${partnerId}`)
        } else {
          navigate(`/messages`)
        }
      } else if (notification.type === "like" || notification.type === "match") {
        // Get user info
        const userId = notification.sender?._id || notification.data?.sender?._id || notification.data?.user?._id

        if (userId) {
          navigate(`/user/${userId}`)
        } else {
          navigate(`/matches`)
        }
      } else if (notification.type === "photoRequest" || notification.type === "photoResponse") {
        // For photo permission requests, navigate to settings page
        if (notification.type === "photoRequest") {
          navigate(`/settings?tab=photos`)
        } else {
          // For responses, navigate to the user's profile
          const userId = notification.data?.owner?._id || notification.data?.photoOwnerId
          if (userId) {
            navigate(`/user/${userId}`)
          } else {
            navigate(`/dashboard`)
          }
        }
      } else if (notification.type === "story") {
        // Get story info
        const storyId = notification.data?.storyId
        if (storyId) {
          // If using a modal for stories, trigger that instead of navigation
          window.dispatchEvent(
            new CustomEvent("viewStory", {
              detail: { storyId },
            }),
          )
        } else {
          navigate(`/dashboard`) // Default to dashboard where stories appear
        }
      } else {
        // Default to dashboard for other notification types
        navigate(`/dashboard`)
      }
    } catch (error) {
      console.error("Error handling notification click:", error)
      // Default fallback - just go to dashboard
      navigate("/dashboard")
    }
  }

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        addTestNotification,
        markAsRead,
        markAllAsRead,
        handleNotificationClick,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

// Custom hook to use the notification context
export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}

export default NotificationProvider

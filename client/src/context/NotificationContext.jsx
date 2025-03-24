"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { useAuth } from "./AuthContext"
import notificationService from "../services/notificationService"
import { toast } from "react-toastify"
import { useNavigate } from "react-router-dom"
import socketService from "../services/socketService"

// Create the Notification Context
const NotificationContext = createContext()

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated, user } = useAuth()
  const [notifications, setNotifications] = useState([]) // Always initialize as an empty array
  const [unreadCount, setUnreadCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  // Initialize notification service and listen for updates when authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      setIsLoading(true)

      // Use user settings if available, otherwise fallback to defaults
      const userSettings = user.settings || {
        notifications: {
          messages: true,
          calls: true,
          stories: true,
          likes: true,
          comments: true,
          photoRequests: true,
        },
      }

      // Initialize the notification service with the settings
      notificationService.initialize(userSettings)

      // Add a listener to update local state when the service sends new data.
      const removeListener = notificationService.addListener((data) => {
        // Use fallback empty array if data.notifications is undefined
        setNotifications(data.notifications || [])
        setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0)
      })

      // Fetch initial notifications from the service.
      notificationService
        .getNotifications()
        .then((fetchedNotifications) => {
          const notificationsData = fetchedNotifications || []
          setNotifications(notificationsData)
          setUnreadCount(notificationsData.filter((n) => !n.read).length)
          setIsLoading(false)
        })
        .catch((error) => {
          console.error("Error fetching notifications:", error)
          setIsLoading(false)
          // Ensure notifications is defined to prevent runtime errors.
          setNotifications([])
        })

      // Clean up the listener when the component unmounts or dependencies change.
      return () => {
        removeListener()
        // Ensure we clean up socket listeners to prevent memory leaks
        if (notificationService && notificationService.initialized) {
          const socket = socketService.socket
          if (socket) {
            socket.off("new_message")
            socket.off("incoming_call")
            socket.off("new_story")
            socket.off("new_like")
            socket.off("photo_permission_request")
            socket.off("photo_permission_response")
            socket.off("new_comment")
            socket.off("notification")
          }
        }
      }
    } else {
      // Reset notifications state when not authenticated.
      setNotifications([])
      setUnreadCount(0)
    }
  }, [isAuthenticated, user])

  // Function to add a test notification for development/testing purposes.
  const addTestNotification = () => {
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

    // Randomly select a notification type
    const randomNotification = notificationTypes[Math.floor(Math.random() * notificationTypes.length)]

    const newNotification = {
      _id: Date.now().toString(),
      ...randomNotification,
      read: false,
      createdAt: new Date().toISOString(),
    }

    // Update local state immediately for UI feedback
    setNotifications((prev) => [newNotification, ...prev])
    setUnreadCount((prev) => prev + 1)

    // Also add the test notification to the notification service
    notificationService.addNotification(newNotification)
    toast.info(`Test ${randomNotification.type} notification added`)
  }

  // Mark a single notification as read
  const markAsRead = (notificationId) => {
    if (!notificationId) return

    // Update local notifications state
    setNotifications((prev) =>
      prev.map((notification) =>
        notification._id === notificationId || notification.id === notificationId
          ? { ...notification, read: true }
          : notification,
      ),
    )

    // Decrement unread count
    setUnreadCount((prev) => Math.max(0, prev - 1))

    // Update the notification status in the service/backend
    notificationService.markAsRead(notificationId)
  }

  // Mark all notifications as read
  const markAllAsRead = () => {
    if (!notifications || notifications.length === 0) return

    setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
    setUnreadCount(0)
    notificationService.markAllAsRead()
  }

  // Handle a click on a notification and navigate accordingly
  const handleNotificationClick = (notification) => {
    if (!notification) return

    console.log("Notification clicked:", notification)

    // Mark the notification as read if it isn't already
    if (!notification.read) {
      markAsRead(notification._id || notification.id)
    }

    // Navigate based on notification type
    try {
      if (notification.type === "message") {
        const partnerId = notification.sender?._id || notification.data?.sender?._id || notification.data?.user?._id
        if (notification.data?.conversationId) {
          navigate(`/messages/${notification.data.conversationId}`)
        } else if (partnerId) {
          navigate(`/messages/${partnerId}`)
        } else {
          navigate(`/messages`)
        }
      } else if (notification.type === "like" || notification.type === "match") {
        const userId = notification.sender?._id || notification.data?.sender?._id || notification.data?.user?._id
        if (userId) {
          navigate(`/user/${userId}`)
        } else {
          navigate(`/matches`)
        }
      } else if (notification.type === "photoRequest" || notification.type === "photoResponse") {
        if (notification.type === "photoRequest") {
          navigate(`/settings?tab=photos`)
        } else {
          const userId = notification.data?.owner?._id || notification.data?.photoOwnerId
          if (userId) {
            navigate(`/user/${userId}`)
          } else {
            navigate(`/dashboard`)
          }
        }
      } else if (notification.type === "story") {
        const storyId = notification.data?.storyId
        if (storyId) {
          window.dispatchEvent(
            new CustomEvent("viewStory", {
              detail: { storyId },
            }),
          )
        } else {
          navigate(`/dashboard`)
        }
      } else {
        navigate(`/dashboard`)
      }
    } catch (error) {
      console.error("Error handling notification click:", error)
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

// Custom hook to access the notification context
export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}

export default NotificationProvider

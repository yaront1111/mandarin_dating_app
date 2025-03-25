"use client"

import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react"
import apiService from "@services/apiService.jsx"
import socketService from "@services/socketService.jsx"
import { useAuth } from "./AuthContext"
import { toast } from "react-toastify"

// Create ChatContext
const ChatContext = createContext()

// Custom hook to access ChatContext
export const useChat = () => useContext(ChatContext)

/**
 * ChatProvider component
 * Provides chat-related functionalities such as messages, conversations,
 * typing indicators, and integration with socket and API services.
 */
export const ChatProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth()

  // State variables
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [unreadCounts, setUnreadCounts] = useState({})
  const [typingUsers, setTypingUsers] = useState({})
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [activeConversation, setActiveConversation] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [activeCall, setActiveCall] = useState(null)
  const [callStatus, setCallStatus] = useState(null) // 'ringing', 'ongoing', 'ended'
  const [localPeerId, setLocalPeerId] = useState(null)
  const [remotePeerId, setRemotePeerId] = useState(null)

  // Ref to store socket event handlers for cleanup
  const eventHandlersRef = useRef({})

  // Ref for socket connection status check interval
  const socketCheckIntervalRef = useRef(null)

  // Clear error helper
  const clearError = useCallback(() => setError(null), [])

  // -------------------------------------------------------------------------
  // Helper Functions
  // -------------------------------------------------------------------------

  /**
   * Validates a MongoDB ObjectId
   * @param {string} id - The ID to validate
   * @returns {boolean} True if valid
   */
  const isValidObjectId = useCallback((id) => {
    return id && typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id)
  }, [])

  /**
   * Updates the conversation list when a new message arrives.
   */
  const updateConversationsList = useCallback(
    (message) => {
      if (!message || !message.sender || !message.recipient || !user || !user._id) {
        console.error("Invalid data for conversation update:", { message, user })
        return
      }

      const otherUserId = message.sender === user._id ? message.recipient : message.sender

      if (!isValidObjectId(otherUserId)) {
        console.error(`Invalid otherUserId: ${otherUserId}`)
        return
      }

      setConversations((prev) => {
        // Check if conversation already exists
        const index = prev.findIndex((conv) => conv.user && conv.user._id === otherUserId)

        if (index >= 0) {
          // Update existing conversation
          const updated = [...prev]
          updated[index] = {
            ...updated[index],
            lastMessage: message,
            updatedAt: message.createdAt,
          }
          // Sort by newest message
          return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        } else {
          // Fetch user data to create new conversation
          apiService
            .get(`/users/${otherUserId}`)
            .then((response) => {
              if (response.success && response.data && response.data.user) {
                setConversations((current) => {
                  // Double-check the conversation doesn't exist already
                  if (current.some((conv) => conv.user && conv.user._id === otherUserId)) {
                    return current
                  }

                  // Create new conversation
                  const newConv = {
                    user: response.data.user,
                    lastMessage: message,
                    updatedAt: message.createdAt,
                  }

                  // Add and sort
                  return [...current, newConv].sort((a, b) =>
                    new Date(b.updatedAt) - new Date(a.updatedAt)
                  )
                })
              }
            })
            .catch((err) => console.error("Error fetching user for conversation:", err))

          return prev
        }
      })
    },
    [user, isValidObjectId]
  )

  /**
   * Marks messages as read locally and on the server.
   */
  const markMessagesAsRead = useCallback(
    async (messageIds, senderId) => {
      if (!user || !messageIds.length) return

      if (!isValidObjectId(senderId)) {
        console.error(`Invalid sender ID format: ${senderId}`)
        return
      }

      // Update local state first for immediate feedback
      setMessages((prev) =>
        prev.map((msg) =>
          messageIds.includes(msg._id) ? { ...msg, read: true } : msg
        )
      )

      // Notify socket that messages have been read
      socketService.socket?.emit("messageRead", {
        reader: user._id,
        sender: senderId,
        messageIds,
      })

      // Update on the server
      try {
        await apiService.post("/messages/read", { messageIds })
      } catch (err) {
        console.error("Error marking messages as read:", err)
      }

      // Update unread counts
      setUnreadCounts((prev) => ({ ...prev, [senderId]: 0 }))
    },
    [user, isValidObjectId]
  )

  // -------------------------------------------------------------------------
  // Socket Connection Management
  // -------------------------------------------------------------------------

  // Periodically check socket connection status
  useEffect(() => {
    const checkSocketConnection = () => {
      const isConnected = socketService.isConnected()
      setSocketConnected(isConnected)

      // If socket should be connected but isn't, try to reconnect
      if (!isConnected && isAuthenticated && user) {
        console.log("Socket disconnected, attempting to reconnect...")
        socketService.reconnect()
      }
    }

    // Initial check
    checkSocketConnection()

    // Set up interval for periodic checks
    socketCheckIntervalRef.current = setInterval(checkSocketConnection, 30000) // Check every 30 seconds

    return () => {
      if (socketCheckIntervalRef.current) {
        clearInterval(socketCheckIntervalRef.current)
      }
    }
  }, [isAuthenticated, user])

  // Initialize socket connection when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user || !user._id) return

    if (!isValidObjectId(user._id)) {
      console.error(`Invalid user ID format: ${user._id}`)
      return
    }

    const token = sessionStorage.getItem("token") || localStorage.getItem("token")
    if (!token) return

    // Initialize socket connection
    console.log("Initializing socket connection...")
    socketService.init(user._id, token)
    setSocketConnected(socketService.isConnected())

    // Clean up on unmount or when auth state changes
    return () => {
      console.log("Cleaning up socket connection...")

      // Clean up event handlers
      Object.entries(eventHandlersRef.current).forEach(([event, handler]) => {
        if (handler) socketService.off(event, handler)
      })

      // Reset handlers ref
      eventHandlersRef.current = {}
    }
  }, [isAuthenticated, user, isValidObjectId])

  // Set up socket event listeners
  useEffect(() => {
    if (!isAuthenticated || !user) return

    // Clean up any existing event handlers
    Object.entries(eventHandlersRef.current).forEach(([event, handler]) => {
      if (handler) socketService.off(event, handler)
    })

    // Initialize new handlers object
    eventHandlersRef.current = {}

    // Handle new message
    const handleNewMessage = (message) => {
      if (!message || !message.sender || !message.recipient) {
        console.error("Invalid message object:", message)
        return
      }

      // Add message to state if it's not already there
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev
        return [...prev, message].sort((a, b) =>
          new Date(a.createdAt) - new Date(b.createdAt)
        )
      })

      // Update unread count if the message is from someone else
      if (message.sender !== user._id) {
        setUnreadCounts((prev) => ({
          ...prev,
          [message.sender]: (prev[message.sender] || 0) + 1,
        }))

        // Update conversations list
        updateConversationsList(message)
      }
    }

    // Handle typing indicator
    const handleUserTyping = (data) => {
      if (!data || !data.sender) {
        console.error("Invalid typing data:", data)
        return
      }

      // Update typing state with timestamp
      setTypingUsers((prev) => ({ ...prev, [data.sender]: Date.now() }))
    }

    // Handle user online status
    const handleUserOnline = (data) => {
      if (!data || !data.userId) {
        console.error("Invalid online data:", data)
        return
      }

      // Update user status in conversations
      setConversations((prev) =>
        prev.map((conv) =>
          conv.user._id === data.userId
            ? { ...conv, user: { ...conv.user, isOnline: true } }
            : conv
        )
      )
    }

    // Handle user offline status
    const handleUserOffline = (data) => {
      if (!data || !data.userId) {
        console.error("Invalid offline data:", data)
        return
      }

      // Update user status in conversations
      setConversations((prev) =>
        prev.map((conv) =>
          conv.user._id === data.userId
            ? { ...conv, user: { ...conv.user, isOnline: false } }
            : conv
        )
      )
    }

    // Handle read receipts
    const handleMessagesRead = (data) => {
      if (!data || !data.reader || !Array.isArray(data.messageIds)) {
        console.error("Invalid read receipt data:", data)
        return
      }

      // Only update if someone else read your messages
      if (data.reader !== user._id) {
        setMessages((prev) =>
          prev.map((msg) =>
            data.messageIds.includes(msg._id) && msg.sender === user._id
              ? { ...msg, read: true }
              : msg
          )
        )
      }
    }

    // Handle incoming call
    const handleIncomingCall = (callData) => {
      if (!callData || !callData.caller) {
        console.error("Invalid incoming call data:", callData)
        return
      }

      console.log("ChatContext received incoming call:", callData)

      // Store caller's Peer ID
      if (callData.callerPeerId) {
        console.log("Setting remote peer ID:", callData.callerPeerId)
        setRemotePeerId(callData.callerPeerId)
      }

      // Set incoming call state
      setIncomingCall(callData)
      setCallStatus("ringing")

      // Dispatch custom event for components
      console.log("Dispatching incomingCall event to window")
      window.dispatchEvent(new CustomEvent("incomingCall", { detail: callData }))
    }

    // Handle call answered
    const handleCallAnswered = (callData) => {
      if (!callData) {
        console.error("Invalid call answer data:", callData)
        return
      }

      // Store respondent's Peer ID
      if (callData.respondentPeerId) {
        setRemotePeerId(callData.respondentPeerId)
      }

      // Update call status
      setCallStatus("ongoing")
      setActiveCall(callData)

      // Dispatch event
      window.dispatchEvent(new CustomEvent("callAnswered", { detail: callData }))
    }

    // Handle call ended
    const handleCallEnded = (data) => {
      // Reset call states
      setIncomingCall(null)
      setActiveCall(null)
      setCallStatus(null)
      setRemotePeerId(null)

      // Dispatch event
      window.dispatchEvent(new CustomEvent("callEnded", { detail: data }))
    }

    // Handle call rejected
    const handleCallRejected = (data) => {
      // Notify if your call was rejected
      if (data.callerId === user?._id) {
        toast.info(`${data.recipientName || "User"} declined your call`)
      }

      // Reset call states
      setIncomingCall(null)
      setActiveCall(null)
      setCallStatus(null)
      setRemotePeerId(null)

      // Dispatch event
      window.dispatchEvent(new CustomEvent("callRejected", { detail: data }))
    }

    // Register event handlers with socket service
    eventHandlersRef.current.newMessage = socketService.on("newMessage", handleNewMessage)
    eventHandlersRef.current.userTyping = socketService.on("userTyping", handleUserTyping)
    eventHandlersRef.current.userOnline = socketService.on("userOnline", handleUserOnline)
    eventHandlersRef.current.userOffline = socketService.on("userOffline", handleUserOffline)
    eventHandlersRef.current.messagesRead = socketService.on("messagesRead", handleMessagesRead)
    eventHandlersRef.current.incomingCall = socketService.on("incomingCall", handleIncomingCall)
    eventHandlersRef.current.callAnswered = socketService.on("callAnswered", handleCallAnswered)
    eventHandlersRef.current.callEnded = socketService.on("callEnded", handleCallEnded)
    eventHandlersRef.current.callRejected = socketService.on("callRejected", handleCallRejected)

    // Cleanup when component unmounts or deps change
    return () => {
      // Remove event listeners
      Object.entries(eventHandlersRef.current).forEach(([event, handler]) => {
        if (handler) socketService.off(event, handler)
      })
    }
  }, [isAuthenticated, user, updateConversationsList, isValidObjectId])

  // -------------------------------------------------------------------------
  // Chat Functions
  // -------------------------------------------------------------------------

  /**
   * Loads messages for a conversation and marks unread as read.
   */
  const getMessages = useCallback(
    async (recipientId) => {
      if (!user || !recipientId) return []

      if (!isValidObjectId(recipientId)) {
        const errMsg = `Invalid recipient ID format: ${recipientId}`
        console.error(errMsg)
        setError(errMsg)
        return []
      }

      setLoading(true)
      setError(null)

      try {
        const response = await apiService.get(`/messages/${recipientId}`)

        if (response.success) {
          // Sort messages by date
          const sorted = response.data.sort((a, b) =>
            new Date(a.createdAt) - new Date(b.createdAt)
          )

          // Update messages state
          setMessages(sorted)

          // Find unread messages received by current user
          const unread = sorted.filter(
            (msg) => msg.recipient === user._id && !msg.read
          )

          // Mark unread messages as read
          if (unread.length) {
            const ids = unread.map((msg) => msg._id)
            markMessagesAsRead(ids, recipientId)
            setUnreadCounts((prev) => ({ ...prev, [recipientId]: 0 }))
          }

          // Set active conversation
          setActiveConversation(recipientId)

          return response.data
        } else {
          throw new Error(response.error || "Failed to get messages")
        }
      } catch (err) {
        const errMsg = err.error || err.message || "Failed to get messages"
        setError(errMsg)
        console.error(errMsg)
        return []
      } finally {
        setLoading(false)
      }
    },
    [user, markMessagesAsRead, isValidObjectId]
  )

  /**
   * Loads the list of conversations.
   */
  const getConversations = useCallback(async () => {
    if (!user || !user._id) {
      console.warn("User not authenticated or missing ID")
      return []
    }

    if (!isValidObjectId(user._id)) {
      console.error(`Invalid user ID format: ${user._id}`)
      setError("Invalid user ID format. Please log out and log in again.")
      return []
    }

    setLoading(true)
    setError(null)

    try {
      const response = await apiService.get("/messages/conversations")

      if (response.success) {
        // Filter out any invalid conversations
        const valid = response.data.filter(
          (conv) => conv && conv.user && conv.user._id && isValidObjectId(conv.user._id)
        )

        if (valid.length !== response.data.length) {
          console.warn(`Filtered out ${response.data.length - valid.length} invalid conversations`)
        }

        // Update state
        setConversations(valid)

        // Build unread counts
        const counts = {}
        valid.forEach((conv) => (counts[conv.user._id] = conv.unreadCount || 0))
        setUnreadCounts(counts)

        return valid
      } else {
        throw new Error(response.error || "Failed to get conversations")
      }
    } catch (err) {
      const errMsg = err.error || err.message || "Failed to get conversations"
      setError(errMsg)
      console.error(errMsg)
      return []
    } finally {
      setLoading(false)
    }
  }, [user, isValidObjectId])

  /**
   * Uploads a file attachment.
   */
  const uploadFile = useCallback(
    async (file, recipientId, onProgress = null) => {
      if (!user || !file) {
        setError("Cannot upload file: Missing user or file")
        return null
      }

      // Validate file size
      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
      if (file.size > MAX_FILE_SIZE) {
        const errMsg = "File is too large (max 5MB allowed)"
        setError(errMsg)
        console.error(errMsg)
        return null
      }

      // Validate file type
      const allowedTypes = [
        "image/jpeg", "image/jpg", "image/png", "image/gif",
        "application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain", "audio/mpeg", "audio/wav", "video/mp4", "video/quicktime",
      ]

      if (!allowedTypes.includes(file.type)) {
        const errMsg = "File type not supported."
        setError(errMsg)
        console.error(errMsg)
        return null
      }

      // Validate recipient ID
      if (recipientId && !isValidObjectId(recipientId)) {
        const errMsg = `Invalid recipient ID format: ${recipientId}`
        setError(errMsg)
        console.error(errMsg)
        return null
      }

      setUploading(true)
      setError(null)

      try {
        // Prepare form data
        const formData = new FormData()
        formData.append("file", file)
        if (recipientId) formData.append("recipient", recipientId)

        // Upload file
        const response = await apiService.upload(
          "/messages/attachments",
          formData,
          onProgress
        )

        if (response.success) {
          return response.data
        } else {
          throw new Error(response.error || "Failed to upload file")
        }
      } catch (err) {
        const errMsg = err.error || err.message || "Failed to upload file"
        setError(errMsg)
        console.error("File upload error:", err)
        return null
      } finally {
        setUploading(false)
      }
    },
    [user, isValidObjectId]
  )

  /**
   * Sends a message using the socket connection with API fallback.
   * Strategy: Try socket first, fall back to API only if socket fails.
   */
  const sendMessage = useCallback(
    async (recipientId, type, content, metadata = {}) => {
      if (!user || !recipientId) {
        setError("Cannot send message: Missing user or recipient")
        return null
      }

      if (!isValidObjectId(recipientId)) {
        const errMsg = `Invalid recipient ID format: ${recipientId}`
        setError(errMsg)
        console.error(errMsg)
        return null
      }

      setSending(true)
      setError(null)

      // Generate a unique client ID for this message
      const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const enhancedMetadata = { ...metadata, clientMessageId }

      try {
        // Validate message type
        const validTypes = ["text", "wink", "video", "file"]
        if (!type || !validTypes.includes(type)) {
          throw new Error(`Invalid message type. Must be one of: ${validTypes.join(", ")}`)
        }

        // Validate text content
        if (type === "text" && (!content || content.trim().length === 0)) {
          throw new Error("Message content is required for text messages")
        }

        // Create a temporary message object for optimistic UI update
        const tempMessage = {
          _id: clientMessageId,
          sender: user._id,
          recipient: recipientId,
          type,
          content,
          metadata: enhancedMetadata,
          createdAt: new Date().toISOString(),
          read: false,
          pending: true,
        }

        // Optimistically add message to UI
        setMessages((prev) => {
          if (prev.some((m) => m.metadata?.clientMessageId === clientMessageId)) return prev
          return [...prev, tempMessage].sort((a, b) =>
            new Date(a.createdAt) - new Date(b.createdAt)
          )
        })

        // Try to send via socket first
        let messageResponse = null

        // If socket is connected, use it
        if (socketService.isConnected()) {
          try {
            messageResponse = await socketService.sendMessage(
              recipientId, type, content, enhancedMetadata
            )

            // If socket sends successfully, update the temporary message with server response
            if (messageResponse && !messageResponse.pending) {
              setMessages((prev) => prev.map(msg =>
                msg.metadata?.clientMessageId === clientMessageId
                  ? messageResponse
                  : msg
              ))

              updateConversationsList(messageResponse)
              return messageResponse
            }
          } catch (socketError) {
            console.warn("Socket message failed, falling back to API:", socketError)
          }
        }

        // If socket failed or not connected, use API
        const apiResponse = await apiService.post("/messages", {
          recipient: recipientId,
          type,
          content,
          metadata: enhancedMetadata,
        })

        if (apiResponse.success) {
          const newMsg = apiResponse.data

          // Update message in state
          setMessages((prev) => prev.map(msg =>
            msg.metadata?.clientMessageId === clientMessageId
              ? newMsg
              : msg
          ))

          updateConversationsList(newMsg)
          return newMsg
        } else {
          throw new Error(apiResponse.error || "Failed to send message")
        }
      } catch (err) {
        // Mark the temporary message as failed
        setMessages((prev) => prev.map(msg =>
          msg.metadata?.clientMessageId === clientMessageId
            ? { ...msg, error: true, pending: false }
            : msg
        ))

        const errMsg = err.error || err.message || "Failed to send message"
        setError(errMsg)
        console.error("Send message error:", err)
        return null
      } finally {
        setSending(false)
      }
    },
    [user, updateConversationsList, isValidObjectId]
  )

  /**
   * Sends a file message.
   */
  const sendFileMessage = useCallback(
    async (recipientId, file, onProgress = null) => {
      if (!user || !recipientId || !file) {
        setError("Cannot send file: Missing user, recipient, or file")
        return null
      }

      try {
        // First upload the file
        const fileData = await uploadFile(file, recipientId, onProgress)

        if (!fileData) throw new Error("Failed to upload file")

        // Prepare metadata with file info
        const metadata = {
          fileUrl: fileData.url,
          fileName: fileData.fileName || file.name,
          fileSize: fileData.fileSize || file.size,
          mimeType: fileData.mimeType || file.type,
          ...fileData.metadata,
        }

        // Send message with file metadata
        return await sendMessage(recipientId, "file", fileData.fileName || file.name, metadata)
      } catch (err) {
        const errMsg = err.error || err.message || "Failed to send file message"
        setError(errMsg)
        console.error("Send file message error:", err)
        return null
      }
    },
    [user, uploadFile, sendMessage]
  )

  /**
   * Sends a typing indicator.
   */
  const sendTyping = useCallback(
    (recipientId) => {
      if (!user || !recipientId) return

      if (!isValidObjectId(recipientId)) {
        console.error(`Invalid recipient ID format for typing indicator: ${recipientId}`)
        return
      }

      socketService.sendTyping(recipientId)
    },
    [user, isValidObjectId]
  )

  /**
   * Initiates a video call.
   */
  const initiateVideoCall = useCallback(
    async (recipientId) => {
      if (!user || !recipientId) {
        setError("Cannot initiate call: Missing user or recipient")
        return null
      }

      if (!isValidObjectId(recipientId)) {
        const errMsg = `Invalid recipient ID format for video call: ${recipientId}`
        setError(errMsg)
        console.error(errMsg)
        return null
      }

      // Check if recipient is online
      const recipient = conversations.find((conv) => conv.user._id === recipientId)?.user
      if (recipient && !recipient.isOnline) {
        const errMsg = `Cannot call ${recipient.nickname || "user"}: User is offline`
        setError(errMsg)
        toast.error(errMsg)
        return null
      }

      try {
        console.log(`Initiating video call to recipient: ${recipientId}`)
        setCallStatus("calling")

        // Generate a local peer ID for this call
        const peerIdForCall = `${user._id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        console.log(`Generated local peer ID: ${peerIdForCall}`)
        setLocalPeerId(peerIdForCall)

        // Initiate call through socket
        const callData = await socketService.initiateVideoCall(recipientId, peerIdForCall)
        console.log("Call initiated successfully, received data:", callData)

        // Update call state
        setActiveCall(callData)

        return callData
      } catch (err) {
        const errMsg = err.message || "Failed to initiate call"
        console.error("Error initiating call:", err)
        setError(errMsg)
        setCallStatus(null)
        setLocalPeerId(null)
        toast.error(errMsg)
        return null
      }
    },
    [user, conversations, setError, isValidObjectId]
  )

  /**
   * Answers a video call.
   */
  const answerVideoCall = useCallback(
    async (callerId, accept = true) => {
      if (!user || !callerId) {
        setError("Cannot answer call: Missing user or caller")
        return null
      }

      if (!isValidObjectId(callerId)) {
        const errMsg = `Invalid caller ID format: ${callerId}`
        setError(errMsg)
        console.error(errMsg)
        return null
      }

      try {
        if (accept) {
          // Generate a local peer ID for this call
          const peerIdForCall = `${user._id}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
          setLocalPeerId(peerIdForCall)

          // Update call status
          setCallStatus("ongoing")

          // Answer the call
          const callData = await socketService.answerVideoCall(callerId, true, peerIdForCall)
          setActiveCall(callData)
          setIncomingCall(null)

          return callData
        } else {
          // Reject the call
          await socketService.answerVideoCall(callerId, false)
          setIncomingCall(null)
          setCallStatus(null)
          setLocalPeerId(null)

          return null
        }
      } catch (err) {
        const errMsg = err.message || "Failed to answer call"
        setError(errMsg)
        setIncomingCall(null)
        setCallStatus(null)
        setLocalPeerId(null)
        toast.error(errMsg)
        return null
      }
    },
    [user, setError, isValidObjectId]
  )

  /**
   * Gets the total number of unread messages.
   */
  const getTotalUnreadCount = useCallback(() => {
    return Object.values(unreadCounts).reduce((total, count) => total + count, 0)
  }, [unreadCounts])

  /**
   * Ends an active call.
   */
  const endCall = useCallback(() => {
    if (!activeCall) return

    // Determine the other user ID
    const otherUserId = activeCall.caller === user?._id
      ? activeCall.recipient
      : activeCall.caller

    // Send end call event through socket
    socketService.socket?.emit("endCall", {
      callId: activeCall.callId,
      userId: otherUserId,
    })

    // Reset call states
    setActiveCall(null)
    setCallStatus(null)
    setLocalPeerId(null)
    setRemotePeerId(null)
  }, [activeCall, user])

  // -------------------------------------------------------------------------
  // Context Value and Provider
  // -------------------------------------------------------------------------
  const contextValue = {
    messages,
    conversations,
    unreadCounts,
    typingUsers,
    loading,
    sending,
    uploading,
    error,
    socketConnected,
    activeConversation,
    setActiveConversation,
    getMessages,
    getConversations,
    sendMessage,
    sendFileMessage,
    uploadFile,
    sendTyping,
    markMessagesAsRead,
    initiateVideoCall,
    answerVideoCall,
    getTotalUnreadCount,
    clearError,
    incomingCall,
    activeCall,
    callStatus,
    endCall,
    localPeerId,
    remotePeerId,
  }

  return <ChatContext.Provider value={contextValue}>{children}</ChatContext.Provider>
}

export default ChatContext

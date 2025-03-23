"use client"

// ChatContext.js
import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react"
import { toast } from "react-toastify"
import apiService from "@services/apiService.jsx"
import socketService from "@services/socketService.jsx"
import { useAuth } from "./AuthContext"

const ChatContext = createContext()

export const useChat = () => useContext(ChatContext)

export const ChatProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth()
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

  // Refs to store event handlers for cleanup
  const eventHandlersRef = useRef({
    newMessage: null,
    userTyping: null,
    userOnline: null,
    userOffline: null,
    messagesRead: null,
  })

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // Initialize socket connection
  useEffect(() => {
    if (isAuthenticated && user && user._id) {
      // Validate user ID format before initializing socket
      if (!/^[0-9a-fA-F]{24}$/.test(user._id)) {
        console.error(`Cannot initialize socket: Invalid user ID format: ${user._id}`)
        return
      }

      const token = sessionStorage.getItem("token") || localStorage.getItem("token")
      if (token) {
        socketService.init(user._id, token)
        setSocketConnected(socketService.isConnected())
      }
    }
  }, [isAuthenticated, user])

  // Setup socket event listeners
  useEffect(() => {
    if (!isAuthenticated || !user) return

    const handleNewMessage = (message) => {
      if (!message || !message.sender || !message.recipient) {
        console.error("Invalid message object:", message)
        return
      }
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev
        const updated = [...prev, message].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        return updated
      })
      if (message.sender !== user._id) {
        setUnreadCounts((prev) => ({
          ...prev,
          [message.sender]: (prev[message.sender] || 0) + 1,
        }))
        updateConversationsList(message)
      }
    }

    const handleUserTyping = (data) => {
      if (!data || !data.sender) {
        console.error("Invalid typing data:", data)
        return
      }
      setTypingUsers((prev) => ({
        ...prev,
        [data.sender]: Date.now(),
      }))
    }

    const handleUserOnline = (data) => {
      if (!data || !data.userId) {
        console.error("Invalid online data:", data)
        return
      }
      setConversations((prev) =>
        prev.map((conv) =>
          conv.user._id === data.userId ? { ...conv, user: { ...conv.user, isOnline: true } } : conv,
        ),
      )
    }

    const handleUserOffline = (data) => {
      if (!data || !data.userId) {
        console.error("Invalid offline data:", data)
        return
      }
      setConversations((prev) =>
        prev.map((conv) =>
          conv.user._id === data.userId ? { ...conv, user: { ...conv.user, isOnline: false } } : conv,
        ),
      )
    }

    const handleMessagesRead = (data) => {
      if (!data || !data.reader || !data.messageIds || !Array.isArray(data.messageIds)) {
        console.error("Invalid read receipt data:", data)
        return
      }
      if (data.reader !== user._id) {
        setMessages((prev) =>
          prev.map((msg) =>
            data.messageIds.includes(msg._id) && msg.sender === user._id ? { ...msg, read: true } : msg,
          ),
        )
      }
    }

    eventHandlersRef.current.newMessage = socketService.on("newMessage", handleNewMessage)
    eventHandlersRef.current.userTyping = socketService.on("userTyping", handleUserTyping)
    eventHandlersRef.current.userOnline = socketService.on("userOnline", handleUserOnline)
    eventHandlersRef.current.userOffline = socketService.on("userOffline", handleUserOffline)
    eventHandlersRef.current.messagesRead = socketService.on("messagesRead", handleMessagesRead)

    return () => {
      if (eventHandlersRef.current.newMessage) socketService.off("newMessage", eventHandlersRef.current.newMessage)
      if (eventHandlersRef.current.userTyping) socketService.off("userTyping", eventHandlersRef.current.userTyping)
      if (eventHandlersRef.current.userOnline) socketService.off("userOnline", eventHandlersRef.current.userOnline)
      if (eventHandlersRef.current.userOffline) socketService.off("userOffline", eventHandlersRef.current.userOffline)
      if (eventHandlersRef.current.messagesRead)
        socketService.off("messagesRead", eventHandlersRef.current.messagesRead)
    }
  }, [isAuthenticated, user])

  const updateConversationsList = useCallback(
    (message) => {
      if (!message || !message.sender || !message.recipient || !user || !user._id) {
        console.error("Invalid data for conversation update:", { message, user })
        return
      }
      const otherUserId = message.sender === user._id ? message.recipient : message.sender
      if (!otherUserId || !/^[0-9a-fA-F]{24}$/.test(otherUserId)) {
        console.error(`Invalid otherUserId: ${otherUserId}`)
        return
      }
      setConversations((prev) => {
        const index = prev.findIndex((conv) => conv.user && conv.user._id === otherUserId)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], lastMessage: message, updatedAt: message.createdAt }
          return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        } else {
          // Fetch new user info if not in conversation list
          apiService
            .get(`/users/${otherUserId}`)
            .then((response) => {
              if (response.success && response.data && response.data.user) {
                setConversations((current) => {
                  if (current.some((conv) => conv.user && conv.user._id === otherUserId)) {
                    return current
                  }
                  const newConv = {
                    user: response.data.user,
                    lastMessage: message,
                    updatedAt: message.createdAt,
                  }
                  return [...current, newConv].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                })
              } else {
                console.error("Invalid user response:", response)
              }
            })
            .catch((err) => console.error("Error fetching user for conversation:", err))
          return prev
        }
      })
    },
    [user],
  )

  const getMessages = useCallback(
    async (recipientId) => {
      if (!user || !recipientId) return []
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
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
          const sorted = response.data.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          setMessages(sorted)
          const unread = sorted.filter((msg) => msg.recipient === user._id && !msg.read)
          if (unread.length) {
            const ids = unread.map((msg) => msg._id)
            markMessagesAsRead(ids, recipientId)
            setUnreadCounts((prev) => ({ ...prev, [recipientId]: 0 }))
          }
          setActiveConversation(recipientId)
          return response.data
        } else {
          throw new Error(response.error || "Failed to get messages")
        }
      } catch (err) {
        const errMsg = err.error || err.message || "Failed to get messages"
        setError(errMsg)
        toast.error(errMsg)
        return []
      } finally {
        setLoading(false)
      }
    },
    [user],
  )

  const getConversations = useCallback(async () => {
    if (!user) {
      console.warn("Cannot get conversations: User is not authenticated")
      return []
    }

    if (!user._id) {
      console.warn("Cannot get conversations: User ID is missing")
      return []
    }

    // Validate user ID format (MongoDB ObjectId is a 24-character hex string)
    if (!/^[0-9a-fA-F]{24}$/.test(user._id)) {
      console.error(`Invalid user ID format: ${user._id}`)
      setError("Invalid user ID format. Please log out and log in again.")
      toast.error("Authentication error. Please log out and log in again.")
      return []
    }

    setLoading(true)
    setError(null)
    try {
      const response = await apiService.get("/messages/conversations")
      if (response.success) {
        const valid = response.data.filter(
          (conv) => conv && conv.user && conv.user._id && /^[0-9a-fA-F]{24}$/.test(conv.user._id),
        )
        if (valid.length !== response.data.length) {
          console.warn(`Filtered out ${response.data.length - valid.length} invalid conversations`)
        }
        setConversations(valid)
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
  }, [user, setError, setLoading, setConversations, setUnreadCounts])

  // Use the new upload method from apiService with an optional onProgress callback.
  const uploadFile = useCallback(
    async (file, recipientId, onProgress = null) => {
      if (!user || !file) {
        setError("Cannot upload file: Missing user or file")
        return null
      }
      const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
      if (file.size > MAX_FILE_SIZE) {
        const errMsg = "File is too large (max 5MB allowed)"
        setError(errMsg)
        toast.error(errMsg)
        return null
      }
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
        "audio/mpeg",
        "audio/wav",
        "video/mp4",
        "video/quicktime",
      ]
      if (!allowedTypes.includes(file.type)) {
        const errMsg = "Invalid file type. Only images, documents, audio, and videos are allowed."
        setError(errMsg)
        toast.error(errMsg)
        return null
      }
      if (recipientId && !/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        const errMsg = `Invalid recipient ID format: ${recipientId}`
        setError(errMsg)
        toast.error(errMsg)
        return null
      }
      setUploading(true)
      setError(null)
      try {
        const formData = new FormData()
        formData.append("file", file)
        if (recipientId) formData.append("recipient", recipientId)
        const response = await apiService.upload("/messages/attachments", formData, onProgress)
        if (response.success) {
          return response.data
        } else {
          throw new Error(response.error || "Failed to upload file")
        }
      } catch (err) {
        const errMsg = err.error || err.message || "Failed to upload file"
        setError(errMsg)
        toast.error(errMsg)
        console.error("File upload error:", err)
        return null
      } finally {
        setUploading(false)
      }
    },
    [user],
  )

  // Send a message with deduplication via a client-generated ID.
  const sendMessage = useCallback(
    async (recipientId, type, content, metadata = {}) => {
      if (!user || !recipientId) {
        setError("Cannot send message: Missing user or recipient")
        return null
      }
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        const errMsg = `Invalid recipient ID format: ${recipientId}`
        setError(errMsg)
        toast.error(errMsg)
        return null
      }
      setSending(true)
      setError(null)
      const clientMessageId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const enhancedMetadata = { ...metadata, clientMessageId }
      try {
        const validTypes = ["text", "wink", "video", "file"]
        if (!type || !validTypes.includes(type)) {
          throw new Error(`Invalid message type. Must be one of: ${validTypes.join(", ")}`)
        }
        if (type === "text" && (!content || content.trim().length === 0)) {
          throw new Error("Message content is required for text messages")
        }
        if (type === "file" && (!enhancedMetadata || !enhancedMetadata.fileUrl)) {
          throw new Error("File URL is required for file messages")
        }

        // Attempt socket-based delivery first.
        let socketResponse = null
        try {
          socketResponse = await socketService.sendMessage(recipientId, type, content, enhancedMetadata)
        } catch (socketError) {
          console.warn("Socket message failed, falling back to API:", socketError)
        }
        if (socketResponse && !socketResponse.pending) {
          setMessages((prev) => {
            if (prev.some((m) => m.metadata?.clientMessageId === clientMessageId || m._id === socketResponse._id)) {
              return prev
            }
            return [...prev, socketResponse].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          })
          updateConversationsList(socketResponse)
          return socketResponse
        }

        // API fallback if socket delivery fails.
        const apiResponse = await apiService.post("/messages", {
          recipient: recipientId,
          type,
          content,
          metadata: enhancedMetadata,
        })
        if (apiResponse.success) {
          const newMsg = apiResponse.data
          setMessages((prev) => {
            if (prev.some((m) => m.metadata?.clientMessageId === clientMessageId || m._id === newMsg._id)) {
              return prev
            }
            return [...prev, newMsg].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          })
          updateConversationsList(newMsg)
          return newMsg
        } else {
          throw new Error(apiResponse.error || "Failed to send message")
        }
      } catch (err) {
        const errMsg = err.error || err.message || "Failed to send message"
        setError(errMsg)
        toast.error(errMsg)
        console.error("Send message error:", err)
        return null
      } finally {
        setSending(false)
      }
    },
    [user, updateConversationsList],
  )

  // Send a file message: uploads the file and then sends the message with file metadata.
  const sendFileMessage = useCallback(
    async (recipientId, file, onProgress = null) => {
      if (!user || !recipientId || !file) {
        setError("Cannot send file: Missing user, recipient, or file")
        return null
      }
      try {
        const fileData = await uploadFile(file, recipientId, onProgress)
        if (!fileData) throw new Error("Failed to upload file")
        const metadata = {
          fileUrl: fileData.url,
          fileName: fileData.fileName || file.name,
          fileSize: fileData.fileSize || file.size,
          mimeType: fileData.mimeType || file.type,
          ...fileData.metadata,
        }
        return await sendMessage(recipientId, "file", fileData.fileName || file.name, metadata)
      } catch (err) {
        const errMsg = err.error || err.message || "Failed to send file message"
        setError(errMsg)
        toast.error(errMsg)
        console.error("Send file message error:", err)
        return null
      }
    },
    [user, uploadFile, sendMessage],
  )

  const sendTyping = useCallback(
    (recipientId) => {
      if (!user || !recipientId) return
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        console.error(`Invalid recipient ID format for typing indicator: ${recipientId}`)
        return
      }
      socketService.sendTyping(recipientId)
    },
    [user],
  )

  const markMessagesAsRead = useCallback(
    (messageIds, senderId) => {
      if (!user || !messageIds.length) return
      if (!/^[0-9a-fA-F]{24}$/.test(senderId)) {
        console.error(`Invalid sender ID format: ${senderId}`)
        return
      }
      setMessages((prev) => prev.map((msg) => (messageIds.includes(msg._id) ? { ...msg, read: true } : msg)))
      socketService.socket?.emit("messageRead", {
        reader: user._id,
        sender: senderId,
        messageIds,
      })
      apiService.post("/messages/read", { messageIds }).catch((err) => {
        console.error("Error marking messages as read:", err)
      })
      setUnreadCounts((prev) => ({ ...prev, [senderId]: 0 }))
    },
    [user],
  )

  const initiateVideoCall = useCallback(
    (recipientId) => {
      if (!user || !recipientId) {
        setError("Cannot initiate call: Missing user or recipient")
        return null
      }
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        const errMsg = `Invalid recipient ID format for video call: ${recipientId}`
        setError(errMsg)
        toast.error(errMsg)
        return null
      }
      return socketService.initiateVideoCall(recipientId)
    },
    [user],
  )

  const answerVideoCall = useCallback(
    (callerId, answer) => {
      if (!user || !callerId) {
        setError("Cannot answer call: Missing user or caller")
        return null
      }
      if (!/^[0-9a-fA-F]{24}$/.test(callerId)) {
        const errMsg = `Invalid caller ID format: ${callerId}`
        setError(errMsg)
        toast.error(errMsg)
        return null
      }
      return socketService.answerVideoCall(callerId, answer)
    },
    [user],
  )

  const getTotalUnreadCount = useCallback(() => {
    return Object.values(unreadCounts).reduce((total, count) => total + count, 0)
  }, [unreadCounts])

  const value = {
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
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export default ChatContext

"use client"

import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react"
import apiService from "@services/apiService.jsx"
import socketService from "@services/socketService.jsx"
import { useAuth } from "./AuthContext"
import { toast } from "react-hot-toast"

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
  const eventHandlersRef = useRef({
    newMessage: null,
    userTyping: null,
    userOnline: null,
    userOffline: null,
    messagesRead: null,
    incomingCall: null,
    callAnswered: null,
    callEnded: null,
    callRejected: null,
  })

  // Clear error helper
  const clearError = useCallback(() => setError(null), [])

  // -------------------------------------------------------------------------
  // Helper Functions: Declare before they are referenced in other functions.
  // -------------------------------------------------------------------------

  /**
   * updateConversationsList:
   * Updates the conversation list when a new message arrives. If the conversation
   * already exists, it updates the last message; otherwise, it fetches the user data
   * and adds a new conversation.
   */
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
          updated[index] = {
            ...updated[index],
            lastMessage: message,
            updatedAt: message.createdAt,
          }
          return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        } else {
          // Fetch user data and add new conversation
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

  /**
   * markMessagesAsRead:
   * Marks messages as read by updating local state and notifying the server.
   */
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

  // -------------------------------------------------------------------------
  // Socket Initialization & Event Handlers
  // -------------------------------------------------------------------------

  // Initialize socket connection when authenticated
  useEffect(() => {
    if (isAuthenticated && user && user._id) {
      if (!/^[0-9a-fA-F]{24}$/.test(user._id)) {
        console.error(`Invalid user ID format: ${user._id}`)
        return
      }
      const token = sessionStorage.getItem("token") || localStorage.getItem("token")
      if (token) {
        socketService.init(user._id, token)
        setSocketConnected(socketService.isConnected())
      }
    }
  }, [isAuthenticated, user])

  // Set up socket event listeners
  useEffect(() => {
    if (!isAuthenticated || !user) return

    const handleNewMessage = (message) => {
      if (!message || !message.sender || !message.recipient) {
        console.error("Invalid message object:", message)
        return
      }
      setMessages((prev) => {
        if (prev.some((m) => m._id === message._id)) return prev
        return [...prev, message].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
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
      setTypingUsers((prev) => ({ ...prev, [data.sender]: Date.now() }))
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
      if (!data || !data.reader || !Array.isArray(data.messageIds)) {
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

    const handleIncomingCall = (callData) => {
      if (!callData || !callData.caller) {
        console.error("Invalid incoming call data:", callData)
        return
      }

      console.log("ChatContext received incoming call:", callData)

      // Enhanced with Peer ID information
      if (callData.callerPeerId) {
        console.log("Setting remote peer ID:", callData.callerPeerId)
        setRemotePeerId(callData.callerPeerId)
      }

      setIncomingCall(callData)
      setCallStatus("ringing")

      // Dispatch custom event for components that need to respond to calls
      console.log("Dispatching incomingCall event to window")
      window.dispatchEvent(new CustomEvent("incomingCall", { detail: callData }))
    }

    const handleCallAnswered = (callData) => {
      if (!callData) {
        console.error("Invalid call answer data:", callData)
        return
      }

      // Enhanced with Peer ID information
      if (callData.respondentPeerId) {
        setRemotePeerId(callData.respondentPeerId)
      }

      setCallStatus("ongoing")
      setActiveCall(callData)
      window.dispatchEvent(new CustomEvent("callAnswered", { detail: callData }))
    }

    const handleCallEnded = (data) => {
      setIncomingCall(null)
      setActiveCall(null)
      setCallStatus(null)
      window.dispatchEvent(new CustomEvent("callEnded", { detail: data }))
    }

    const handleCallRejected = (data) => {
      if (data.callerId === user?._id) {
        toast.info(`${data.recipientName || "User"} declined your call`)
      }
      setIncomingCall(null)
      setActiveCall(null)
      setCallStatus(null)
      window.dispatchEvent(new CustomEvent("callRejected", { detail: data }))
    }

    eventHandlersRef.current.newMessage = socketService.on("newMessage", handleNewMessage)
    eventHandlersRef.current.userTyping = socketService.on("userTyping", handleUserTyping)
    eventHandlersRef.current.userOnline = socketService.on("userOnline", handleUserOnline)
    eventHandlersRef.current.userOffline = socketService.on("userOffline", handleUserOffline)
    eventHandlersRef.current.messagesRead = socketService.on("messagesRead", handleMessagesRead)
    eventHandlersRef.current.incomingCall = socketService.on("incomingCall", handleIncomingCall)
    eventHandlersRef.current.callAnswered = socketService.on("callAnswered", handleCallAnswered)
    eventHandlersRef.current.callEnded = socketService.on("callEnded", handleCallEnded)
    eventHandlersRef.current.callRejected = socketService.on("callRejected", handleCallRejected)

    return () => {
      if (eventHandlersRef.current.newMessage) socketService.off("newMessage", eventHandlersRef.current.newMessage)
      if (eventHandlersRef.current.userTyping) socketService.off("userTyping", eventHandlersRef.current.userTyping)
      if (eventHandlersRef.current.userOnline) socketService.off("userOnline", eventHandlersRef.current.userOnline)
      if (eventHandlersRef.current.userOffline) socketService.off("userOffline", eventHandlersRef.current.userOffline)
      if (eventHandlersRef.current.messagesRead)
        socketService.off("messagesRead", eventHandlersRef.current.messagesRead)
      if (eventHandlersRef.current.incomingCall)
        socketService.off("incomingCall", eventHandlersRef.current.incomingCall)
      if (eventHandlersRef.current.callAnswered)
        socketService.off("callAnswered", eventHandlersRef.current.callAnswered)
      if (eventHandlersRef.current.callEnded) socketService.off("callEnded", eventHandlersRef.current.callEnded)
      if (eventHandlersRef.current.callRejected)
        socketService.off("callRejected", eventHandlersRef.current.callRejected)
    }
  }, [isAuthenticated, user, updateConversationsList])

  // -------------------------------------------------------------------------
  // Chat Functions: getMessages, getConversations, etc.
  // -------------------------------------------------------------------------

  /**
   * getMessages:
   * Loads messages for a given conversation, marks unread messages as read,
   * and sets the active conversation.
   */
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
        console.error(errMsg)
        return []
      } finally {
        setLoading(false)
      }
    },
    [user, markMessagesAsRead],
  )

  /**
   * getConversations:
   * Loads the list of conversations for the authenticated user.
   */
  const getConversations = useCallback(async () => {
    if (!user || !user._id) {
      console.warn("User not authenticated or missing ID")
      return []
    }
    if (!/^[0-9a-fA-F]{24}$/.test(user._id)) {
      console.error(`Invalid user ID format: ${user._id}`)
      setError("Invalid user ID format. Please log out and log in again.")
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
  }, [user])

  /**
   * uploadFile:
   * Uploads a file (such as an attachment) using the API service.
   */
  const uploadFile = useCallback(
    async (file, recipientId, onProgress = null) => {
      if (!user || !file) {
        setError("Cannot upload file: Missing user or file")
        return null
      }
      const MAX_FILE_SIZE = 5 * 1024 * 1024
      if (file.size > MAX_FILE_SIZE) {
        const errMsg = "File is too large (max 5MB allowed)"
        setError(errMsg)
        console.error(errMsg)
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
        const errMsg = "File type not supported."
        setError(errMsg)
        console.error(errMsg)
        return null
      }
      if (recipientId && !/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        const errMsg = `Invalid recipient ID format: ${recipientId}`
        setError(errMsg)
        console.error(errMsg)
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
        console.error("File upload error:", err)
        return null
      } finally {
        setUploading(false)
      }
    },
    [user],
  )

  /**
   * sendMessage:
   * Sends a message (text, wink, video, or file) via socket or API fallback.
   */
  const sendMessage = useCallback(
    async (recipientId, type, content, metadata = {}) => {
      if (!user || !recipientId) {
        setError("Cannot send message: Missing user or recipient")
        return null
      }
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
        const errMsg = `Invalid recipient ID format: ${recipientId}`
        setError(errMsg)
        console.error(errMsg)
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
        let socketResponse = null
        try {
          socketResponse = await socketService.sendMessage(recipientId, type, content, enhancedMetadata)
        } catch (socketError) {
          console.warn("Socket message failed, falling back to API:", socketError)
        }
        if (socketResponse && !socketResponse.pending) {
          setMessages((prev) => {
            if (prev.some((m) => m.metadata?.clientMessageId === clientMessageId || m._id === socketResponse._id))
              return prev
            return [...prev, socketResponse].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          })
          updateConversationsList(socketResponse)
          return socketResponse
        }
        const apiResponse = await apiService.post("/messages", {
          recipient: recipientId,
          type,
          content,
          metadata: enhancedMetadata,
        })
        if (apiResponse.success) {
          const newMsg = apiResponse.data
          setMessages((prev) => {
            if (prev.some((m) => m.metadata?.clientMessageId === clientMessageId || m._id === newMsg._id)) return prev
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
        console.error("Send message error:", err)
        return null
      } finally {
        setSending(false)
      }
    },
    [user, updateConversationsList],
  )

  /**
   * sendFileMessage:
   * Sends a file message by first uploading the file then sending a message with the file metadata.
   */
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
        console.error("Send file message error:", err)
        return null
      }
    },
    [user, uploadFile, sendMessage],
  )

  /**
   * sendTyping:
   * Sends a typing indicator via the socket service.
   */
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

  /**
   * initiateVideoCall:
   * Initiates a video call by invoking the socket service.
   */
  const initiateVideoCall = useCallback(
    async (recipientId) => {
      if (!user || !recipientId) {
        setError("Cannot initiate call: Missing user or recipient")
        return null
      }
      if (!/^[0-9a-fA-F]{24}$/.test(recipientId)) {
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

        const callData = await socketService.initiateVideoCall(recipientId, peerIdForCall)
        console.log("Call initiated successfully, received data:", callData)
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
    [user, conversations, setError],
  )

  /**
   * answerVideoCall:
   * Answers a video call by invoking the socket service.
   */
  const answerVideoCall = useCallback(
    async (callerId, accept = true) => {
      if (!user || !callerId) {
        setError("Cannot answer call: Missing user or caller")
        return null
      }
      if (!/^[0-9a-fA-F]{24}$/.test(callerId)) {
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

          setCallStatus("ongoing")
          const callData = await socketService.answerVideoCall(callerId, true, peerIdForCall)
          setActiveCall(callData)
          setIncomingCall(null)
          return callData
        } else {
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
    [user, setError],
  )

  /**
   * getTotalUnreadCount:
   * Returns the total number of unread messages.
   */
  const getTotalUnreadCount = useCallback(() => {
    return Object.values(unreadCounts).reduce((total, count) => total + count, 0)
  }, [unreadCounts])

  // Add a new function to end an active call
  const endCall = useCallback(() => {
    if (!activeCall) return

    const otherUserId = activeCall.caller === user?._id ? activeCall.recipient : activeCall.caller

    socketService.socket?.emit("endCall", {
      callId: activeCall.callId,
      userId: otherUserId,
    })

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

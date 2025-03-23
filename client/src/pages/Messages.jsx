"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "react-toastify"
import { FaPaperPlane, FaPaperclip, FaTimes, FaSpinner } from "react-icons/fa"

import { useAuth } from "../context/AuthContext"
import { useChat } from "../context/ChatContext"
import MessageBubble from "../components/MessageBubble"
import UserAvatar from "../components/UserAvatar"

const ConversationList = ({ conversations, activeId, onSelect, unreadCounts }) => {
  if (!conversations || conversations.length === 0) {
    return (
      <div className="no-conversations">
        <p>No conversations yet</p>
      </div>
    )
  }

  return (
    <div className="conversations-list">
      {conversations.map((conv) => (
        <div
          key={conv.user._id}
          className={`conversation-item ${activeId === conv.user._id ? "active" : ""}`}
          onClick={() => onSelect(conv.user._id)}
        >
          <div className="conversation-avatar">
            <UserAvatar user={conv.user} size="md" />
            {conv.user.isOnline && <span className="online-indicator"></span>}
          </div>
          <div className="conversation-details">
            <div className="conversation-header">
              <h4 className="conversation-name">{conv.user.nickname || "User"}</h4>
              <span className="conversation-time">
                {conv.lastMessage &&
                  new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <div className="conversation-preview">
              {conv.lastMessage && (
                <p className="last-message">
                  {conv.lastMessage.type === "text"
                    ? conv.lastMessage.content
                    : conv.lastMessage.type === "file"
                      ? "📎 Attachment"
                      : conv.lastMessage.type === "wink"
                        ? "😉 Wink"
                        : "Message"}
                </p>
              )}
              {unreadCounts[conv.user._id] > 0 && <span className="unread-badge">{unreadCounts[conv.user._id]}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const Messages = () => {
  const { user } = useAuth()
  const {
    messages,
    conversations,
    unreadCounts,
    typingUsers,
    loading,
    sending,
    uploading,
    error,
    activeConversation,
    getMessages,
    getConversations,
    sendMessage,
    sendFileMessage,
    sendTyping,
    markMessagesAsRead,
    setActiveConversation,
  } = useChat()

  const [messageText, setMessageText] = useState("")
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Get active conversation user
  const activeUser = conversations.find((conv) => conv.user && conv.user._id === activeConversation)?.user

  // Load conversations on mount
  useEffect(() => {
    if (user && user._id) {
      // Validate user ID format
      if (!/^[0-9a-fA-F]{24}$/.test(user._id)) {
        console.error(`Invalid user ID format: ${user._id}`)
        toast.error("Authentication error. Please log out and log in again.")
        return
      }

      getConversations().catch((err) => {
        console.error("Failed to load conversations:", err)
        toast.error("Failed to load conversations. Please try again.")
      })
    } else if (!user) {
      // Handle case when user is not authenticated
      console.warn("User is not authenticated. Redirecting to login...")
      // You might want to redirect to login page here
    }
  }, [user, getConversations])

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversation && user && user._id) {
      getMessages(activeConversation).catch((err) => {
        console.error("Failed to load messages:", err)
      })

      // Mark messages as read
      const unreadMessages = messages.filter((m) => m.sender === activeConversation && !m.read).map((m) => m._id)

      if (unreadMessages.length > 0) {
        markMessagesAsRead(unreadMessages, activeConversation)
      }
    }
  }, [activeConversation, user, getMessages, messages, markMessagesAsRead])

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Cleanup typing timeout
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  const handleSelectConversation = (userId) => {
    if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
      console.error(`Invalid recipient ID format: ${userId}`)
      toast.error("Invalid conversation selected")
      return
    }

    if (userId !== activeConversation) {
      setActiveConversation(userId)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()

    if (selectedFile) {
      await handleSendFile()
      return
    }

    if (!messageText.trim() || !activeConversation) return

    try {
      await sendMessage(activeConversation, "text", messageText.trim())
      setMessageText("")
    } catch (error) {
      console.error("Failed to send message:", error)
      toast.error("Failed to send message")
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.")
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setSelectedFile(file)
  }

  const handleSendFile = async () => {
    if (!selectedFile || !activeConversation) return

    try {
      await sendFileMessage(activeConversation, selectedFile, (progress) => {
        setUploadProgress(progress)
      })

      setSelectedFile(null)
      setUploadProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (error) {
      console.error("Failed to send file:", error)
      toast.error("Failed to send file")
    }
  }

  const handleCancelFileUpload = () => {
    setSelectedFile(null)
    setUploadProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleTyping = () => {
    if (!activeConversation) return

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    sendTyping(activeConversation)

    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null
    }, 3000)
  }

  const isUserTyping =
    activeConversation && typingUsers[activeConversation] && Date.now() - typingUsers[activeConversation] < 3000

  return (
    <div className="messages-page">
      <div className="conversations-panel">
        <div className="conversations-header">
          <h2>Conversations</h2>
        </div>
        <ConversationList
          conversations={conversations}
          activeId={activeConversation}
          onSelect={handleSelectConversation}
          unreadCounts={unreadCounts}
        />
      </div>

      <div className="messages-panel">
        {activeConversation && activeUser ? (
          <>
            <div className="messages-header">
              <div className="user-avatar">
                <UserAvatar user={activeUser} size="md" />
                {activeUser.isOnline && <span className="online-indicator"></span>}
              </div>
              <div className="user-info">
                <h3>{activeUser.nickname || "User"}</h3>
                {isUserTyping && <p className="typing-status">typing...</p>}
              </div>
            </div>

            <div className="messages-container">
              {loading ? (
                <div className="loading-container">
                  <FaSpinner className="spinner" />
                  <p>Loading messages...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="empty-messages">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <div className="messages-list">
                  {messages.map((message) => (
                    <MessageBubble key={message._id} message={message} isOwn={message.sender === user?._id} />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <div className="message-input-container">
              {selectedFile && (
                <div className="selected-file">
                  <div className="file-info">
                    <span className="file-name">{selectedFile.name}</span>
                    <span className="file-size">({Math.round(selectedFile.size / 1024)} KB)</span>
                  </div>
                  {uploading ? (
                    <div className="upload-progress">
                      <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
                      <span>{uploadProgress}%</span>
                    </div>
                  ) : (
                    <button className="cancel-file" onClick={handleCancelFileUpload}>
                      <FaTimes />
                    </button>
                  )}
                </div>
              )}

              <form onSubmit={handleSendMessage} className="message-form">
                <button
                  type="button"
                  className="attachment-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending || uploading}
                >
                  <FaPaperclip />
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  style={{ display: "none" }}
                  accept="image/*,application/pdf,text/plain,audio/*,video/*"
                />

                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={() => handleTyping()}
                  placeholder="Type a message..."
                  className="message-input"
                  disabled={sending || uploading || !!selectedFile}
                />

                <button
                  type="submit"
                  className="send-button"
                  disabled={(!messageText.trim() && !selectedFile) || sending || uploading}
                >
                  {sending || uploading ? <FaSpinner className="spinner" /> : <FaPaperPlane />}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="no-conversation-selected">
            <div className="empty-state">
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the list to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Messages

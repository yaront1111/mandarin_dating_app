"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { toast } from "react-toastify";
import {
  FaPaperPlane,
  FaPaperclip,
  FaTimes,
  FaSpinner,
  FaFileVideo,
  FaFileAudio,
  FaFilePdf,
  FaFileAlt,
  FaSmile,
  FaHeart,
  FaVideo,
  FaPhoneSlash,
} from "react-icons/fa";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import MessageBubble from "../components/MessageBubble";
import UserAvatar from "../components/UserAvatar";
import VideoCall from "../components/VideoCall"; // Ensure this exists
import socketService from "@services/socketService.jsx";

// Helper function to validate a MongoDB ObjectID (24 hex characters)
const isValidObjectId = (id) =>
  typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);

// ---------------------------------------------------------------------------
// ConversationList Component
// ---------------------------------------------------------------------------
const ConversationList = ({
  conversations,
  activeConversationId,
  onSelect,
  unreadCounts,
}) => {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    return (
      <div className="no-conversations">
        <p>No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="conversations-list">
      {conversations.map((conv) => {
        const convUser = conv.user;
        return (
          <div
            key={convUser._id}
            className={`conversation-item ${
              activeConversationId === convUser._id ? "active" : ""
            }`}
            onClick={() => onSelect(convUser._id)}
          >
            <div className="conversation-avatar">
              <UserAvatar user={convUser} size="md" />
              {convUser.isOnline && <span className="online-indicator"></span>}
            </div>
            <div className="conversation-details">
              <div className="conversation-header">
                <h4 className="conversation-name">
                  {convUser.nickname || "User"}
                </h4>
                <span className="conversation-time">
                  {conv.lastMessage &&
                    new Date(conv.lastMessage.createdAt).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      }
                    )}
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
                {unreadCounts[convUser._id] > 0 && (
                  <span className="unread-badge">
                    {unreadCounts[convUser._id]}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// MessagesPage Component
// ---------------------------------------------------------------------------
const MessagesPage = () => {
  const { user } = useAuth();
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
  } = useChat();

  const [messageText, setMessageText] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isApprovingRequests, setIsApprovingRequests] = useState(false);
  const [pendingPhotoRequests, setPendingPhotoRequests] = useState(0);
  const [messagesData, setMessagesData] = useState([]);
  const [isCallActive, setIsCallActive] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const chatInputRef = useRef(null);

  // Validate the current user's ID
  useEffect(() => {
    if (!user || !isValidObjectId(user._id)) {
      console.error("Invalid user ID format");
      toast.error("Authentication error. Please log out and log in again.");
    }
  }, [user]);

  // Determine the active conversation's user data.
  const activeUser = useMemo(() => {
    return conversations.find(
      (conv) => conv.user && conv.user._id === activeConversation
    )?.user;
  }, [conversations, activeConversation]);

  // Load conversations on mount if the current user ID is valid.
  useEffect(() => {
    if (user && isValidObjectId(user._id)) {
      getConversations().catch((err) => {
        console.error("Failed to load conversations:", err);
        toast.error("Failed to load conversations. Please try again.");
      });
    }
  }, [user, getConversations]);

  // When active conversation changes, load its messages and mark unread as read.
  useEffect(() => {
    if (activeConversation && user && isValidObjectId(user._id)) {
      getMessages(activeConversation).then((msgs) => {
        if (Array.isArray(msgs)) {
          setMessagesData(msgs);
        }
      }).catch((err) => {
        console.error("Failed to load messages:", err);
        toast.error("Failed to load messages.");
      });
      // Mark unread messages as read
      const unreadMsgIds = messages
        .filter((m) => m.sender === activeConversation && !m.read)
        .map((m) => m._id);
      if (unreadMsgIds.length > 0) {
        markMessagesAsRead(unreadMsgIds, activeConversation);
      }
    }
  }, [activeConversation, user, getMessages, messages, markMessagesAsRead]);

  // Auto-scroll to bottom when messages update.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData]);

  // Focus the chat input when chat opens.
  useEffect(() => {
    if (activeConversation && chatInputRef.current) {
      setTimeout(() => chatInputRef.current.focus(), 300);
    }
  }, [activeConversation]);

  // Cleanup typing timeout on unmount.
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Group messages by date for display.
  const groupMessagesByDate = useCallback(() => {
    const groups = {};
    if (!Array.isArray(messagesData)) return groups;
    messagesData.forEach((msg) => {
      if (msg && msg.createdAt) {
        const date = new Date(msg.createdAt).toLocaleDateString();
        groups[date] = groups[date] || [];
        groups[date].push(msg);
      }
    });
    return groups;
  }, [messagesData]);

  // Handle conversation selection.
  const handleSelectConversation = useCallback(
    (userId) => {
      if (!userId || !isValidObjectId(userId)) {
        console.error("Invalid recipient ID format");
        toast.error("Invalid conversation selected");
        return;
      }
      if (userId !== activeConversation) {
        setActiveConversation(userId);
      }
    },
    [activeConversation, setActiveConversation]
  );

  // Send text message.
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (selectedFile) {
      await handleSendFile();
      return;
    }
    if (!messageText.trim() || !activeConversation) return;
    try {
      await sendMessage(activeConversation, "text", messageText.trim());
      setMessageText("");
    } catch (err) {
      console.error("Failed to send message:", err);
      toast.error("Failed to send message");
    }
  };

  // Handle file selection.
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
  };

  // Send file message.
  const handleSendFile = async () => {
    if (!selectedFile || !activeConversation) return;
    try {
      await sendFileMessage(activeConversation, selectedFile, (progress) => {
        setUploadProgress(progress);
      });
      setSelectedFile(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Failed to send file:", err);
      toast.error("Failed to send file");
    }
  };

  // Cancel file upload.
  const handleCancelFileUpload = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Handle typing events.
  const handleTyping = (e) => {
    setMessageText(e.target.value);
    if (!activeConversation) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(activeConversation);
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 3000);
  };

  const isUserTyping =
    activeConversation &&
    typingUsers[activeConversation] &&
    Date.now() - typingUsers[activeConversation] < 3000;

  // Utility: group messages by date.
  const groupedMessages = useMemo(() => groupMessagesByDate(), [groupMessagesByDate]);

  // Render the chat interface.
  return (
    <div className="messages-page">
      <div className="conversations-panel">
        <div className="conversations-header">
          <h2>Conversations</h2>
        </div>
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversation}
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
              ) : Object.keys(groupedMessages).length === 0 ? (
                <div className="empty-messages">
                  <p>No messages yet. Start the conversation!</p>
                </div>
              ) : (
                Object.entries(groupedMessages).map(([date, msgs]) => (
                  <React.Fragment key={date}>
                    <div className="message-date">{date}</div>
                    {msgs.map((msg) => (
                      <MessageBubble
                        key={msg._id}
                        message={msg}
                        isOwn={msg.sender === user?._id}
                      />
                    ))}
                  </React.Fragment>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="message-input-container">
              {selectedFile && (
                <div className="selected-file">
                  <div className="file-info">
                    <span className="file-name">{selectedFile.name}</span>
                    <span className="file-size">
                      ({Math.round(selectedFile.size / 1024)} KB)
                    </span>
                  </div>
                  {uploading ? (
                    <div className="upload-progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
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
                  className="file-input"
                  accept="image/*,application/pdf,text/plain,audio/*,video/*"
                />
                <input
                  type="text"
                  placeholder={
                    user?.accountTier === "FREE"
                      ? "Free users can only send winks"
                      : "Type a message..."
                  }
                  value={messageText}
                  onChange={handleTyping}
                  ref={chatInputRef}
                  disabled={sending || uploading || (user?.accountTier === "FREE" && messageText.trim() !== "😉")}
                />
                <button
                  type="button"
                  className="wink-button"
                  onClick={async () => {
                    try {
                      await sendMessage(activeConversation, "wink", "😉");
                    } catch (err) {
                      toast.error("Failed to send wink");
                    }
                  }}
                  disabled={sending || uploading}
                >
                  <FaHeart />
                </button>
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

      {/* Video Call & Incoming Call UI (if applicable) */}
      {isCallActive && (
        <div className="video-call-overlay">
          <VideoCall
            isActive={true}
            onEndCall={() => setIsCallActive(false)}
            userId={user?._id}
            recipientId={activeUser?._id}
          />
        </div>
      )}
      {incomingCall && !isCallActive && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-container">
            <div className="incoming-call-header">
              <FaVideo className="call-icon" />
              <h3>Incoming Video Call</h3>
            </div>
            <div className="incoming-call-body">
              <p>{activeUser.nickname} is calling you</p>
            </div>
            <div className="incoming-call-actions">
              <button onClick={handleRejectCall} className="reject-call-btn" aria-label="Reject call">
                <FaTimes /> Decline
              </button>
              <button onClick={handleAcceptCall} className="accept-call-btn" aria-label="Accept call">
                <FaVideo /> Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline styles */}
      <style jsx>{`
        .messages-page {
          display: flex;
          height: calc(100vh - 60px);
        }
        .conversations-panel {
          width: 300px;
          border-right: 1px solid #ddd;
          overflow-y: auto;
        }
        .messages-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .messages-header {
          display: flex;
          align-items: center;
          padding: 10px;
          border-bottom: 1px solid #ddd;
        }
        .user-avatar {
          position: relative;
        }
        .online-indicator {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 10px;
          height: 10px;
          background-color: #4caf50;
          border-radius: 50%;
          border: 2px solid white;
        }
        .messages-container {
          flex: 1;
          padding: 10px;
          overflow-y: auto;
        }
        .message-input-container {
          padding: 10px;
          border-top: 1px solid #ddd;
        }
        .message-form {
          display: flex;
          align-items: center;
        }
        .attachment-button {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1.2rem;
          margin-right: 10px;
        }
        .file-input {
          display: none;
        }
        .send-button {
          background: #4caf50;
          border: none;
          color: white;
          padding: 8px 12px;
          margin-left: 10px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 1.2rem;
        }
        .send-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .selected-file {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f5f5f5;
          padding: 5px 10px;
          border-radius: 4px;
          margin-bottom: 10px;
        }
        .upload-progress {
          display: flex;
          align-items: center;
        }
        .progress-bar {
          background: #4caf50;
          height: 4px;
          flex: 1;
          margin-right: 5px;
        }
        .video-call-overlay,
        .incoming-call-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.85);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
};

export default MessagesPage;

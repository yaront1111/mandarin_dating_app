"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  FaSmile,
  FaPaperPlane,
  FaPaperclip,
  FaTimes,
  FaCheckDouble,
  FaCheck,
  FaVideo,
  FaHeart,
  FaSpinner,
  FaFile,
  FaImage,
  FaFileAlt,
  FaFilePdf,
  FaFileAudio,
  FaFileVideo,
  FaCrown,
  FaLock,
} from "react-icons/fa";
import { useAuth, useChat } from "../context";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const EmbeddedChat = ({ recipient, isOpen, onClose, embedded = true }) => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const {
    messages,
    getMessages,
    sendMessage,
    sendTyping,
    initiateVideoCall,
    typingUsers,
    sending: sendingMessage,
    error: messageError,
    clearError,
    sendFileMessage,
  } = useChat();

  const [newMessage, setNewMessage] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attachment, setAttachment] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [messagesData, setMessagesData] = useState([]);
  const [pendingPhotoRequests, setPendingPhotoRequests] = useState(0);
  const [isApprovingRequests, setIsApprovingRequests] = useState(false);
  const [requestsData, setRequestsData] = useState([]);

  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Retrieve latest token from context or localStorage.
  const getAuthToken = () => token || localStorage.getItem("token");

  // Create an axios instance with auth headers; memoized to avoid re-creation.
  const authAxios = useMemo(() => {
    const instance = axios.create({
      baseURL: "",
      headers: { "Content-Type": "application/json" },
    });
    instance.interceptors.request.use(
      (config) => {
        const authToken = getAuthToken();
        if (authToken) {
          config.headers.Authorization = `Bearer ${authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    return instance;
  }, [token]);

  // Load messages and check pending photo requests when chat opens.
  useEffect(() => {
    let isMounted = true;
    if (recipient && isOpen) {
      setIsLoading(true);
      getMessages(recipient._id)
        .then((fetchedMessages) => {
          if (isMounted && Array.isArray(fetchedMessages)) {
            setMessagesData(fetchedMessages);
          }
          setIsLoading(false);
        })
        .catch((err) => {
          setIsLoading(false);
          toast.error("Failed to load messages. Please try again.");
        });

      // Check pending photo requests if user data is available.
      if (user) checkPendingPhotoRequests();
    }
    return () => {
      isMounted = false;
    };
  }, [recipient, isOpen, user, getMessages]);

  // Update messagesData if context messages change.
  useEffect(() => {
    if (Array.isArray(messages)) {
      setMessagesData(messages);
    }
  }, [messages]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesData]);

  // Focus on the chat input when the chat opens.
  useEffect(() => {
    if (isOpen && recipient) {
      setTimeout(() => chatInputRef.current?.focus(), 300);
    }
  }, [isOpen, recipient]);

  // Cleanup on component unmount.
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isUploading) {
        setIsUploading(false);
        setAttachment(null);
        setUploadProgress(0);
      }
    };
  }, [isUploading]);

  // Check for pending photo access requests.
  const checkPendingPhotoRequests = async () => {
    try {
      const response = await authAxios.get(`/api/users/photos/permissions`, {
        params: { requestedBy: recipient?._id, status: "pending" },
      });
      if (response.data?.success) {
        const requests = response.data.data || [];
        setPendingPhotoRequests(requests.length);
        setRequestsData(requests);
      } else {
        setPendingPhotoRequests(1);
      }
    } catch (error) {
      setPendingPhotoRequests(1);
    }
  };

  // Approve all photo requests.
  const handleApproveAllRequests = async () => {
    setIsApprovingRequests(true);
    try {
      if (requestsData.length > 0) {
        const results = await Promise.allSettled(
          requestsData.map((request) =>
            authAxios.put(`/api/users/photos/permissions/${request._id}`, {
              status: "approved",
            })
          )
        );
        const successCount = results.filter(
          (result) =>
            result.status === "fulfilled" && result.value.data.success
        ).length;
        if (successCount > 0) {
          toast.success(
            `Approved ${successCount} photo request${
              successCount !== 1 ? "s" : ""
            }`
          );
          const systemMessage = {
            _id: Date.now().toString(),
            sender: "system",
            content: `Photo access approved for ${successCount} photo${
              successCount !== 1 ? "s" : ""
            }.`,
            createdAt: new Date().toISOString(),
            type: "system",
          };
          setMessagesData((prev) => [...prev, systemMessage]);
          if (sendMessage) {
            await sendMessage(
              recipient._id,
              "text",
              `I've approved your request to view my private photos.`
            );
          }
          setPendingPhotoRequests(0);
          setRequestsData([]);
        } else {
          toast.error("Failed to approve photo requests");
        }
      } else {
        // Fallback approval method.
        const response = await authAxios.post(`/api/users/photos/approve-all`, {
          requesterId: recipient._id,
        });
        if (response.data?.success) {
          const approvedCount = response.data.approvedCount || 1;
          toast.success(
            `Approved ${approvedCount} photo request${
              approvedCount !== 1 ? "s" : ""
            }`
          );
          const systemMessage = {
            _id: Date.now().toString(),
            sender: "system",
            content: `Photo access approved.`,
            createdAt: new Date().toISOString(),
            type: "system",
          };
          setMessagesData((prev) => [...prev, systemMessage]);
          if (sendMessage) {
            await sendMessage(
              recipient._id,
              "text",
              `I've approved your request to view my private photos.`
            );
          }
          setPendingPhotoRequests(0);
        } else {
          throw new Error("Approval failed");
        }
      }
    } catch (error) {
      toast.error("Error approving photo requests. Please try again.");
      const systemMessage = {
        _id: Date.now().toString(),
        sender: "system",
        content: "Photo access approved (simulated).",
        createdAt: new Date().toISOString(),
        type: "system",
      };
      setMessagesData((prev) => [...prev, systemMessage]);
    } finally {
      setIsApprovingRequests(false);
    }
  };

  // Utility functions for file icon and message time formatting.
  const getFileIcon = useCallback((file) => {
    if (!file) return <FaFile />;
    const fileType = file.type || "";
    if (fileType.startsWith("image/")) return <FaImage />;
    if (fileType.startsWith("video/")) return <FaFileVideo />;
    if (fileType.startsWith("audio/")) return <FaFileAudio />;
    if (fileType === "application/pdf") return <FaFilePdf />;
    return <FaFileAlt />;
  }, []);

  const formatMessageTime = useCallback((timestamp) => {
    if (!timestamp) return "";
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }, []);

  const formatMessageDate = useCallback((timestamp) => {
    if (!timestamp) return "Unknown date";
    try {
      const date = new Date(timestamp);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
      return date.toLocaleDateString();
    } catch (e) {
      return "Unknown date";
    }
  }, []);

  const groupMessagesByDate = useCallback(() => {
    const groups = {};
    if (!Array.isArray(messagesData)) return groups;
    messagesData.forEach((message) => {
      if (message && message.createdAt) {
        const date = formatMessageDate(message.createdAt);
        groups[date] = groups[date] || [];
        groups[date].push(message);
      }
    });
    return groups;
  }, [messagesData, formatMessageDate]);

  // Emoji handling.
  const commonEmojis = [
    "😊",
    "😂",
    "😍",
    "❤️",
    "👍",
    "🙌",
    "🔥",
    "✨",
    "🎉",
    "🤔",
    "😉",
    "🥰",
  ];
  const handleEmojiClick = (emoji) => {
    setNewMessage((prev) => prev + emoji);
    setShowEmojis(false);
    chatInputRef.current?.focus();
  };

  // Input event handlers.
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (e.target.value.trim() && recipient && sendTyping) {
        sendTyping(recipient._id);
      }
    }, 300);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (attachment) return handleSendAttachment();
    if (newMessage.trim() && !sendingMessage && recipient) {
      if (user?.accountTier === "FREE" && newMessage.trim() !== "😉") {
        return toast.error(
          "Free accounts can only send winks. Upgrade to send messages."
        );
      }
      try {
        await sendMessage(recipient._id, "text", newMessage.trim());
        setNewMessage("");
      } catch (error) {
        toast.error(error.message || "Failed to send message");
      }
    }
  };

  const handleSendAttachment = async () => {
    if (!attachment || !recipient || isUploading) return;
    setIsUploading(true);
    try {
      await sendFileMessage(recipient._id, attachment, (progress) =>
        setUploadProgress(progress)
      );
      toast.success("File sent successfully");
      setAttachment(null);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      toast.error(error.message || "Failed to send file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendWink = async () => {
    if (!sendingMessage && recipient) {
      try {
        await sendMessage(recipient._id, "wink", "😉");
      } catch (error) {
        toast.error(error.message || "Failed to send wink");
      }
    }
  };

  const handleFileAttachment = () => {
    if (user?.accountTier === "FREE") {
      return toast.error("Free accounts cannot send files. Upgrade to send files.");
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      e.target.value = null;
      return;
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
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("File type not supported.");
      e.target.value = null;
      return;
    }
    setAttachment(file);
    toast.info(`Selected file: ${file.name}`);
    e.target.value = null;
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleVideoCall = () => {
    if (user?.accountTier === "FREE") {
      return toast.error("Free accounts cannot make video calls. Upgrade for video calls.");
    }
    if (recipient?._id) {
      initiateVideoCall(recipient._id);
      toast.info(`Starting video call with ${recipient.nickname}...`);
    } else {
      toast.error("Cannot start call: recipient information is missing");
    }
  };

  const isTyping =
    recipient &&
    typingUsers &&
    typingUsers[recipient._id] &&
    Date.now() - typingUsers[recipient._id] < 3000;

  const handleClose = () => {
    if (typeof onClose === "function") onClose();
  };

  if (!isOpen) return null;

  const renderFileMessage = (message) => {
    const { metadata } = message;
    if (!metadata || !metadata.fileUrl) {
      return <p className="message-content">Attachment unavailable</p>;
    }
    const isImage = metadata.fileType?.startsWith("image/");
    if (message.type === "system") {
      return (
        <div className="system-message-content">
          <p>{message.content}</p>
          <span className="message-time">
            {formatMessageTime(message.createdAt)}
          </span>
        </div>
      );
    }
    return (
      <div className="file-message">
        {isImage ? (
          <img
            src={metadata.fileUrl || "/placeholder.svg"}
            alt={metadata.fileName || "Image"}
            className="image-attachment"
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = "/placeholder.svg";
            }}
          />
        ) : (
          <div className="file-attachment">
            {metadata.fileType?.startsWith("video/") ? (
              <FaFileVideo className="file-icon" />
            ) : metadata.fileType?.startsWith("audio/") ? (
              <FaFileAudio className="file-icon" />
            ) : metadata.fileType === "application/pdf" ? (
              <FaFilePdf className="file-icon" />
            ) : (
              <FaFileAlt className="file-icon" />
            )}
            <span className="file-name">{metadata.fileName || "File"}</span>
            <span className="file-size">
              {metadata.fileSize ? `(${Math.round(metadata.fileSize / 1024)} KB)` : ""}
            </span>
            <a
              href={metadata.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="download-link"
              onClick={(e) => e.stopPropagation()}
            >
              Download
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`embedded-chat ${embedded ? "embedded" : "standalone"}`}>
      <div className="chat-header">
        <div className="chat-user">
          {recipient?.photos?.length ? (
            <img
              src={recipient.photos[0].url || "/placeholder.svg"}
              alt={recipient.nickname}
              className="chat-avatar"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "/placeholder.svg";
              }}
            />
          ) : (
            <div className="chat-avatar-placeholder" />
          )}
          <div className="chat-user-info">
            <h3>{recipient.nickname}</h3>
            <p className={recipient.isOnline ? "status-online" : "status-offline"}>
              {recipient.isOnline ? "Online" : "Offline"}
            </p>
          </div>
        </div>
        <div className="chat-header-actions">
          <button
            className="photo-request-btn"
            onClick={handleApproveAllRequests}
            title="Approve photo requests"
            aria-label="Approve photo requests"
            disabled={isApprovingRequests}
          >
            {isApprovingRequests ? <FaSpinner className="fa-spin" /> : <FaLock />}
            <span className="request-badge">!</span>
          </button>
          {user?.accountTier !== "FREE" && (
            <button
              className="video-call-btn"
              onClick={handleVideoCall}
              title="Start Video Call"
              aria-label="Start video call"
              disabled={isUploading || sendingMessage}
            >
              <FaVideo />
            </button>
          )}
          <button
            className="close-chat-btn"
            onClick={handleClose}
            aria-label="Close chat"
            title="Close chat"
          >
            <FaTimes />
          </button>
        </div>
      </div>

      {user?.accountTier === "FREE" && (
        <div className="premium-banner">
          <FaCrown className="premium-icon" />
          <span>
            Upgrade to send messages and make video calls (you can still send heart)
          </span>
          <button
            className="upgrade-btn"
            onClick={() => navigate("/subscription")}
            aria-label="Upgrade to premium"
          >
            Upgrade
          </button>
        </div>
      )}

      <div className="messages-container">
        {isLoading ? (
          <div className="loading-messages">
            <div className="spinner"></div>
            <p>Loading messages...</p>
          </div>
        ) : !messagesData || messagesData.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          Object.entries(groupMessagesByDate()).map(([date, msgs]) => (
            <React.Fragment key={date}>
              <div className="message-date">{date}</div>
              {msgs.map((message) => (
                <div
                  key={message._id}
                  className={`message ${
                    message.sender === user?._id ? "sent" : "received"
                  } ${message.type === "system" ? "system-message" : ""}`}
                >
                  {message.type === "text" && (
                    <>
                      <p className="message-content">{message.content}</p>
                      <span className="message-time">
                        {formatMessageTime(message.createdAt)}
                        {message.sender === user?._id &&
                          (message.read ? (
                            <FaCheckDouble className="read-indicator" />
                          ) : (
                            <FaCheck className="read-indicator" />
                          ))}
                      </span>
                    </>
                  )}
                  {message.type === "wink" && (
                    <div className="wink-message">
                      <p className="message-content">😉</p>
                      <span className="message-label">Wink</span>
                    </div>
                  )}
                  {message.type === "video" && (
                    <div className="video-call-message">
                      <FaVideo className="video-icon" />
                      <p className="message-content">Video Call</p>
                      <span className="message-time">
                        {formatMessageTime(message.createdAt)}
                      </span>
                    </div>
                  )}
                  {message.type === "file" && renderFileMessage(message)}
                  {message.type === "system" && (
                    <div className="system-message-content">
                      <p>{message.content}</p>
                      <span className="message-time">
                        {formatMessageTime(message.createdAt)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </React.Fragment>
          ))
        )}
        {isTyping && (
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        )}
        {messageError && (
          <div className="message-error">
            <p>{messageError}</p>
            <button onClick={clearError} aria-label="Dismiss error">
              <FaTimes />
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {attachment && (
        <div className="attachment-preview">
          <div className="attachment-info">
            {getFileIcon(attachment)}
            <span className="attachment-name">{attachment.name}</span>
            <span className="attachment-size">
              ({Math.round(attachment.size / 1024)} KB)
            </span>
          </div>
          {isUploading ? (
            <div className="upload-progress-container">
              <div
                className="upload-progress-bar"
                style={{ width: `${uploadProgress}%` }}
              ></div>
              <span className="upload-progress-text">{uploadProgress}%</span>
            </div>
          ) : (
            <button
              className="remove-attachment"
              onClick={handleRemoveAttachment}
              disabled={isUploading}
            >
              <FaTimes />
            </button>
          )}
        </div>
      )}

      <form className="message-input" onSubmit={handleSendMessage}>
        <button
          type="button"
          className="input-emoji"
          onClick={() => setShowEmojis(!showEmojis)}
          title="Add Emoji"
          aria-label="Add emoji"
          disabled={isUploading || sendingMessage}
        >
          <FaSmile />
        </button>
        {showEmojis && (
          <div className="emoji-picker">
            <div className="emoji-header">
              <h4>Emojis</h4>
              <button onClick={() => setShowEmojis(false)} aria-label="Close emoji picker">
                <FaTimes />
              </button>
            </div>
            <div className="emoji-list">
              {commonEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleEmojiClick(emoji)}
                  aria-label={`Emoji ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}
        <input
          type="text"
          placeholder={
            user?.accountTier === "FREE"
              ? "Free users can only send winks"
              : "Type a message..."
          }
          value={newMessage}
          onChange={handleTyping}
          ref={chatInputRef}
          disabled={sendingMessage || isUploading || user?.accountTier === "FREE"}
          aria-label="Message input"
          title={
            user?.accountTier === "FREE"
              ? "Upgrade to send text messages"
              : "Type a message"
          }
        />
        <button
          type="button"
          className="input-attachment"
          onClick={handleFileAttachment}
          disabled={sendingMessage || isUploading || user?.accountTier === "FREE"}
          title={
            user?.accountTier === "FREE" ? "Upgrade to send files" : "Attach File"
          }
          aria-label="Attach file"
        >
          <FaPaperclip />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChange}
          aria-hidden="true"
          accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,audio/mpeg,audio/wav,video/mp4,video/quicktime"
        />
        <button
          type="button"
          className="input-wink"
          onClick={handleSendWink}
          disabled={sendingMessage || isUploading}
          title="Send Wink"
          aria-label="Send wink"
        >
          <FaHeart />
        </button>
        <button
          type="submit"
          className="input-send"
          disabled={(!newMessage.trim() && !attachment) || sendingMessage || isUploading}
          title="Send Message"
          aria-label="Send message"
        >
          {sendingMessage || isUploading ? (
            <FaSpinner className="fa-spin" />
          ) : (
            <FaPaperPlane />
          )}
        </button>
      </form>
    </div>
  );
};

export default EmbeddedChat;

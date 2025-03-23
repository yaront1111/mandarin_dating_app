"use client";

import React from "react";
import {
  FaCheck,
  FaCheckDouble,
  FaFile,
  FaVideo,
  FaRegSmileBeam,
} from "react-icons/fa";

/**
 * MessageBubble component
 *
 * Renders a single message bubble with content and time.
 * Supports different message types: text, wink, video, file, and system.
 *
 * Props:
 * - message: The message object containing type, content, metadata, createdAt, read, etc.
 * - isOwn: Boolean indicating if the message was sent by the current user.
 */
const MessageBubble = ({ message, isOwn }) => {
  /**
   * Renders the content of the message based on its type.
   */
  const renderMessageContent = () => {
    switch (message.type) {
      case "text":
        return <p className="message-content">{message.content}</p>;
      case "wink":
        return <p className="message-content">😉</p>;
      case "video":
        return (
          <div className="message-video">
            <FaVideo className="video-icon" />
            <span>Video Call</span>
          </div>
        );
      case "file":
        return (
          <div className="message-file">
            <FaFile className="file-icon" />
            <span className="file-name">
              {message.metadata?.fileName || "Attachment"}
            </span>
          </div>
        );
      case "system":
        return <p className="system-message">{message.content}</p>;
      default:
        return <p className="message-content">{message.content}</p>;
    }
  };

  /**
   * Formats the message creation time for display.
   */
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className={`message-bubble ${isOwn ? "own" : "received"}`}>
      {renderMessageContent()}
      <div className="message-info">
        <span className="message-time">{formatTime(message.createdAt)}</span>
        {isOwn && (
          <span className="read-status">
            {message.read ? <FaCheckDouble /> : <FaCheck />}
          </span>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;

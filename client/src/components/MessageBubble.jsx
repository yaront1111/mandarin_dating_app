"use client"

import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  CheckIcon,
  ClockIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  FileIcon,
  ImageIcon,
  FileTextIcon,
  MusicIcon,
  VideoIcon,
} from "lucide-react"

const MessageBubble = ({ message, isOwn, onRetry }) => {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)

  const getStatusIcon = () => {
    if (message.status === "sending") {
      return <ClockIcon className="h-3 w-3 text-gray-400" />
    } else if (message.status === "failed") {
      return <AlertCircleIcon className="h-3 w-3 text-red-500" />
    } else if (message.read) {
      return <CheckIcon className="h-3 w-3 text-blue-500" />
    } else {
      return <CheckIcon className="h-3 w-3 text-gray-400" />
    }
  }

  const getFileIcon = () => {
    const mimeType = message.metadata?.mimeType || ""

    if (mimeType.startsWith("image/")) {
      return <ImageIcon className="h-5 w-5" />
    } else if (mimeType.startsWith("text/")) {
      return <FileTextIcon className="h-5 w-5" />
    } else if (mimeType.startsWith("audio/")) {
      return <MusicIcon className="h-5 w-5" />
    } else if (mimeType.startsWith("video/")) {
      return <VideoIcon className="h-5 w-5" />
    } else {
      return <FileIcon className="h-5 w-5" />
    }
  }

  const renderMessageContent = () => {
    if (message.type === "text") {
      return <div className="message-text">{message.content}</div>
    } else if (message.type === "file") {
      const fileUrl = message.metadata?.fileUrl
      const fileName = message.metadata?.fileName || message.content || "File"
      const mimeType = message.metadata?.mimeType || ""

      if (mimeType.startsWith("image/") && fileUrl) {
        return (
          <div className="message-image-container">
            {!imageLoaded && !imageError && <div className="image-placeholder">Loading image...</div>}
            {imageError && <div className="image-error">Failed to load image</div>}
            <img
              src={fileUrl || "/placeholder.svg"}
              alt={fileName}
              className={`message-image ${imageLoaded ? "visible" : "hidden"}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </div>
        )
      } else if (mimeType.startsWith("audio/") && fileUrl) {
        return (
          <div className="message-audio-container">
            <audio controls className="message-audio">
              <source src={fileUrl} type={mimeType} />
              Your browser does not support the audio element.
            </audio>
          </div>
        )
      } else if (mimeType.startsWith("video/") && fileUrl) {
        return (
          <div className="message-video-container">
            <video controls className="message-video">
              <source src={fileUrl} type={mimeType} />
              Your browser does not support the video element.
            </video>
          </div>
        )
      } else {
        return (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="message-file">
            <div className="file-icon">{getFileIcon()}</div>
            <div className="file-details">
              <div className="file-name">{fileName}</div>
              {message.metadata?.fileSize && (
                <div className="file-size">{Math.round(message.metadata.fileSize / 1024)} KB</div>
              )}
            </div>
          </a>
        )
      }
    } else {
      return <div className="message-text">{message.content}</div>
    }
  }

  return (
    <div className={`message-wrapper ${isOwn ? "own" : "other"}`}>
      <div className={`message-bubble ${isOwn ? "own" : "other"}`}>
        {renderMessageContent()}

        <div className="message-meta">
          <span className="message-time">{formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}</span>

          {isOwn && <span className="message-status">{getStatusIcon()}</span>}

          {message.status === "failed" && onRetry && (
            <button onClick={onRetry} className="retry-button" aria-label="Retry sending message">
              <RefreshCwIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default MessageBubble

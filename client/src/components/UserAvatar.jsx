"use client"

import { useState, useEffect } from "react"
import PropTypes from "prop-types"

/**
 * Production-ready UserAvatar component with fixed image loading
 * and proper fallback handling
 */
const UserAvatar = ({
  userId,
  name = "User",
  size = 40,
  className = "",
  alt = "User Avatar",
  src = null,
  onClick = null,
  showStatus = false,
  isOnline = false,
}) => {
  const [imageError, setImageError] = useState(false)

  // Generate placeholder with user initials if image fails to load
  const generatePlaceholder = () => {
    const colors = [
      "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#34495e",
      "#16a085", "#27ae60", "#2980b9", "#8e44ad", "#2c3e50",
      "#f1c40f", "#e67e22", "#e74c3c", "#ecf0f1", "#95a5a6",
    ]

    // Use userId to pick a consistent color
    const colorIndex = userId
      ? userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
      : 0

    const bgColor = colors[colorIndex]

    // Get first letter of name or userId as fallback
    const initial = name
      ? name.charAt(0).toUpperCase()
      : userId
        ? userId.charAt(0).toUpperCase()
        : "?"

    return (
      <div
        className="flex items-center justify-center rounded-full text-white font-bold"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          backgroundColor: bgColor,
          fontSize: `${size / 2}px`,
        }}
      >
        {initial}
      </div>
    )
  }

  // Handle size classes if using predefined sizes
  const getSizeClass = () => {
    if (typeof size === "string") {
      switch (size) {
        case "xs": return "w-6 h-6"
        case "sm": return "w-8 h-8"
        case "md": return "w-10 h-10"
        case "lg": return "w-16 h-16"
        case "xl": return "w-24 h-24"
        default: return "w-10 h-10"
      }
    }
    return ""
  }

  // Reset error state when src or userId changes
  useEffect(() => {
    setImageError(false)
  }, [src, userId])

  // Use the provided src if available, otherwise use the avatar API endpoint
  const avatarUrl = src || (userId ? `/api/avatar/${userId}` : "/placeholder.svg")
  const sizeStyle = typeof size === "number" ? { width: `${size}px`, height: `${size}px` } : {}
  const sizeClass = typeof size === "string" ? getSizeClass() : ""

  return (
    <div className={`user-avatar-container ${className}`} onClick={onClick}>
      <div className={`user-avatar relative rounded-full overflow-hidden ${sizeClass}`} style={sizeStyle}>
        {!imageError ? (
          <img
            src={avatarUrl}
            alt={`${name}'s avatar`}
            className="w-full h-full object-cover rounded-full"
            onError={() => setImageError(true)}
            crossOrigin="anonymous"
          />
        ) : (
          generatePlaceholder()
        )}

        {/* Online status indicator */}
        {showStatus && isOnline && (
          <div
            className="status-indicator absolute"
            style={{
              right: "0",
              bottom: "0",
              width: "30%",
              height: "30%",
              maxWidth: "12px",
              maxHeight: "12px",
              minWidth: "6px",
              minHeight: "6px",
              backgroundColor: "#4CAF50",
              borderRadius: "50%",
              border: "2px solid white",
            }}
          ></div>
        )}
      </div>
    </div>
  )
}

UserAvatar.propTypes = {
  userId: PropTypes.string,
  name: PropTypes.string,
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
  alt: PropTypes.string,
  src: PropTypes.string,
  onClick: PropTypes.func,
  showStatus: PropTypes.bool,
  isOnline: PropTypes.bool,
}

export default UserAvatar

"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useStories, useUser, useAuth } from "../../context"
import { FaHeart, FaRegHeart, FaComment, FaShare, FaPlay, FaPause, FaVolumeUp, FaVolumeMute } from "react-icons/fa"
import { toast } from "react-toastify"
import "../../styles/stories.css"

const StoriesViewer = ({ storyId, userId, onClose }) => {
  // Context hooks
  const { stories = [], viewStory, loadUserStories, loadStories, reactToStory } = useStories() || {}
  const { user: contextUser } = useUser() || {}
  const { user: authUser, isAuthenticated } = useAuth() || {}

  // Use a combined user reference that tries both contexts
  const user = authUser || contextUser

  // Local state
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [userStories, setUserStories] = useState([])
  const [muted, setMuted] = useState(true)
  const [reacted, setReacted] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [actionClicked, setActionClicked] = useState(false)

  // Progress logic
  const progressInterval = useRef(null)
  const storyDuration = 5000 // 5 seconds
  const progressStep = 100 / (storyDuration / 100)
  const videoRef = useRef(null)
  const actionsRef = useRef(null)

  // Define currentStories BEFORE any useEffects that depend on it
  const currentStories = userId ? userStories : stories

  // Ensure all stories are loaded if needed
  useEffect(() => {
    if ((!stories || !stories.length) && loadStories) {
      loadStories(true).catch((err) => console.error("Error loading stories:", err))
    }
  }, [stories, loadStories])

  // Load user stories if userId is provided
  useEffect(() => {
    const fetchUserStories = async () => {
      if (!userId || !loadUserStories) return
      setLoading(true)
      try {
        const result = await loadUserStories(userId)
        const uniqueStories = []
        const storyIds = new Set()

        // Filter or unify
        const filtered = Array.isArray(result)
          ? result
          : stories.filter((st) => {
              const stUserId = typeof st.user === "string" ? st.user : st.user?._id
              return stUserId === userId
            })

        filtered.forEach((st) => {
          if (st._id && !storyIds.has(st._id)) {
            storyIds.add(st._id)
            uniqueStories.push(st)
          }
        })

        if (!uniqueStories.length) {
          setError("No stories available for this user")
        }
        setUserStories(uniqueStories)
      } catch (err) {
        console.error("Error loading user stories:", err)
        setError("Failed to load stories")
      } finally {
        setLoading(false)
      }
    }
    fetchUserStories()
  }, [userId, loadUserStories, stories])

  // Set initial reaction state based on the current story
  useEffect(() => {
    if (currentStories.length > 0 && currentStoryIndex >= 0 && currentStoryIndex < currentStories.length) {
      const current = currentStories[currentStoryIndex]
      console.log("Checking reactions for story:", current?._id, "User:", user?._id)

      // Check if user has already reacted to this story
      if (current && current.reactions && Array.isArray(current.reactions) && user) {
        const hasReacted = current.reactions.some(
          (reaction) => reaction.user === user._id || (reaction.user && reaction.user._id === user._id),
        )
        console.log("Has user reacted:", hasReacted, "Reactions:", current.reactions)
        setReacted(hasReacted)
      } else {
        setReacted(false)
      }
    }
  }, [currentStoryIndex, currentStories, user])

  // If storyId is provided, find its index
  useEffect(() => {
    if (storyId && (userId ? userStories : stories).length) {
      const currentArray = userId ? userStories : stories
      const idx = currentArray.findIndex((st) => st._id === storyId)
      if (idx !== -1) {
        setCurrentStoryIndex(idx)
      }
    }
  }, [storyId, userId, userStories, stories])

  // Mark story as viewed
  useEffect(() => {
    if (!viewStory || !currentStories.length) return
    const currentStory = currentStories[currentStoryIndex]
    if (currentStory && user && currentStory._id) {
      viewStory(currentStory._id).catch((err) => {
        console.error("Error marking story as viewed:", err)
      })
    }
  }, [currentStoryIndex, currentStories, user, viewStory])

  // Handle video playback
  useEffect(() => {
    if (videoRef.current) {
      if (paused) {
        videoRef.current.pause()
      } else {
        const playPromise = videoRef.current.play()

        // Handle play promise to avoid uncaught rejection errors
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            console.error("Error playing video:", error)
            // Auto-mute and try again (common solution for autoplay issues)
            if (error.name === "NotAllowedError" && !muted) {
              setMuted(true)
              videoRef.current.muted = true
              videoRef.current.play().catch((e) => console.error("Still couldn't play even with mute:", e))
            }
          })
        }
      }
    }
  }, [paused, currentStoryIndex, muted])

  // Progress bar auto-advance
  useEffect(() => {
    if (paused || loading || error || !currentStories.length) {
      // Clear progress interval if not active
      if (progressInterval.current) {
        clearInterval(progressInterval.current)
        progressInterval.current = null
      }
      return
    }

    // Start fresh
    setProgress(0)
    if (progressInterval.current) {
      clearInterval(progressInterval.current)
      progressInterval.current = null
    }

    // For video stories, use the video duration
    const currentStory = currentStories[currentStoryIndex]
    if (currentStory && (currentStory.mediaType === "video" || currentStory.type === "video") && videoRef.current) {
      // Let the video's timeupdate event handle progress
      return
    }

    // Interval logic for non-video stories
    progressInterval.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval.current)
          progressInterval.current = null
          if (currentStoryIndex < currentStories.length - 1) {
            setCurrentStoryIndex((prev) => prev + 1)
          } else {
            onClose?.()
          }
          return 0
        }
        return prev + progressStep
      })
    }, 100)

    // Cleanup
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current)
        progressInterval.current = null
      }
    }
  }, [currentStoryIndex, currentStories, paused, onClose, loading, error, progressStep])

  // Handle video timeupdate for progress
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const duration = videoRef.current.duration
      const currentTime = videoRef.current.currentTime

      if (duration > 0) {
        const progressPercent = (currentTime / duration) * 100
        setProgress(progressPercent)

        // Auto-advance when video ends
        if (progressPercent >= 99.5) {
          if (currentStoryIndex < currentStories.length - 1) {
            setCurrentStoryIndex((prev) => prev + 1)
          } else {
            onClose?.()
          }
        }
      }
    }
  }, [currentStoryIndex, currentStories.length, onClose])

  // Handlers
  const handlePrevStory = useCallback(
    (e) => {
      e?.stopPropagation()
      e?.preventDefault()

      // Don't navigate if clicking on action buttons
      if (actionClicked) {
        setActionClicked(false)
        return
      }

      // Prevent rapid clicks
      if (navigating) return

      if (currentStoryIndex > 0) {
        setNavigating(true)
        setCurrentStoryIndex((i) => i - 1)
        setProgress(0)

        // Reset navigation lock after a short delay
        setTimeout(() => setNavigating(false), 300)
      }
    },
    [currentStoryIndex, navigating, actionClicked],
  )

  const handleNextStory = useCallback(
    (e) => {
      e?.stopPropagation()
      e?.preventDefault()

      // Don't navigate if clicking on action buttons
      if (actionClicked) {
        setActionClicked(false)
        return
      }

      // Prevent rapid clicks
      if (navigating) return

      setNavigating(true)

      if (currentStoryIndex < currentStories.length - 1) {
        setCurrentStoryIndex((i) => i + 1)
        setProgress(0)
      } else {
        onClose?.()
      }

      // Reset navigation lock after a short delay
      setTimeout(() => setNavigating(false), 300)
    },
    [currentStoryIndex, currentStories, onClose, navigating, actionClicked],
  )

  const toggleMute = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()

    // Prevent navigation because an action was clicked
    setActionClicked(true)

    setMuted((prevMuted) => {
      const newMuted = !prevMuted

      // Update video element muted state directly
      if (videoRef.current) {
        videoRef.current.muted = newMuted
      }

      return newMuted
    })

    // Reset action clicked status after a delay
    setTimeout(() => setActionClicked(false), 300)
  }, [])

  const handleReact = useCallback(
    (e) => {
      console.log("React button clicked")
      e.stopPropagation()
      e.preventDefault()

      // Prevent navigation because an action was clicked
      setActionClicked(true)

      // Prevent already reacted case
      if (reacted) {
        console.log("Already reacted to this story")
        setTimeout(() => setActionClicked(false), 300)
        return
      }

      // Check if user is authenticated using isAuthenticated from AuthContext
      if (!isAuthenticated || !user) {
        console.log("User authentication status:", isAuthenticated, "User:", user)
        toast.error("You must be logged in to react to stories")
        setTimeout(() => setActionClicked(false), 300)
        return
      }

      if (!currentStories || currentStoryIndex >= currentStories.length) {
        setTimeout(() => setActionClicked(false), 300)
        return
      }

      const currentStory = currentStories[currentStoryIndex]
      if (!currentStory || !currentStory._id) {
        setTimeout(() => setActionClicked(false), 300)
        return
      }

      const storyId = currentStory._id
      if (storyId && reactToStory) {
        // Set immediately to prevent double-clicks
        setReacted(true)

        // Call the API
        reactToStory(storyId, "like")
          .then((response) => {
            if (!response || !response.success) {
              throw new Error(response?.message || "Failed to react to story")
            }
            console.log("Successfully reacted to story")

            // Update the local story data with the new reaction
            if (response.data && Array.isArray(response.data)) {
              // Find the current story and update its reactions
              const updatedStories = [...currentStories]
              if (updatedStories[currentStoryIndex]) {
                updatedStories[currentStoryIndex].reactions = response.data

                // If we're viewing user stories, update that array
                if (userId) {
                  setUserStories(updatedStories)
                }
              }
            }
          })
          .catch((error) => {
            console.error("Error reacting to story:", error)
            setReacted(false) // Reset on error
            toast.error("Failed to react to story")
          })
          .finally(() => {
            setTimeout(() => setActionClicked(false), 300)
          })
      } else {
        setTimeout(() => setActionClicked(false), 300)
      }
    },
    [user, isAuthenticated, currentStories, currentStoryIndex, reactToStory, reacted, userId],
  )

  const togglePause = useCallback((e) => {
    // Only toggle pause if not clicked in the action buttons area
    if (actionsRef.current && actionsRef.current.contains(e.target)) {
      return
    }

    e.stopPropagation()
    e.preventDefault()
    setPaused((prevPaused) => !prevPaused)
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const keyHandler = (e) => {
      if (navigating) return // Prevent rapid keypresses

      if (e.key === "ArrowLeft") {
        handlePrevStory()
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "Spacebar") {
        handleNextStory()
      } else if (e.key === "Escape") {
        onClose?.()
      }
    }
    document.addEventListener("keydown", keyHandler)
    return () => document.removeEventListener("keydown", keyHandler)
  }, [handlePrevStory, handleNextStory, onClose, navigating])

  const handleClose = () => onClose?.()

  // Action buttons styles
  const actionButtonsStyle = {
    position: "absolute",
    bottom: "80px",
    right: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    zIndex: 9999,
    pointerEvents: "auto",
  }

  const storyActionButtonStyle = {
    width: "46px",
    height: "46px",
    borderRadius: "50%",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "white",
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    backdropFilter: "blur(4px)",
    WebkitBackdropFilter: "blur(4px)",
    pointerEvents: "auto",
    boxShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
  }

  const activeButtonStyle = {
    ...storyActionButtonStyle,
    color: "var(--primary, #ff3366)",
    backgroundColor: "rgba(255, 51, 102, 0.2)",
    transform: "scale(1.1)",
  }

  const navigationStyle = {
    pointerEvents: "auto",
    zIndex: 900,
  }

  const navArrowStyle = {
    zIndex: 950,
  }

  // Loading or Error states
  if (loading) {
    return (
      <div className="stories-viewer-overlay">
        <div className="stories-viewer-container" style={{ justifyContent: "center", alignItems: "center" }}>
          <div className="spinner"></div>
          <p style={{ color: "white" }}>Loading stories...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stories-viewer-overlay">
        <div className="stories-viewer-container" style={{ justifyContent: "center", alignItems: "center" }}>
          <p style={{ color: "white" }}>{error}</p>
          <button
            onClick={handleClose}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              background: "#ff3366",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  if (!currentStories.length || currentStoryIndex >= currentStories.length) {
    return (
      <div className="stories-viewer-overlay">
        <div className="stories-viewer-container" style={{ justifyContent: "center", alignItems: "center" }}>
          <p style={{ color: "white" }}>No stories available</p>
          <button
            onClick={handleClose}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              background: "#ff3366",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const currentStory = currentStories[currentStoryIndex]
  if (!currentStory) {
    return (
      <div className="stories-viewer-overlay">
        <div className="stories-viewer-container" style={{ justifyContent: "center", alignItems: "center" }}>
          <p style={{ color: "white" }}>Story not available</p>
          <button
            onClick={handleClose}
            style={{
              marginTop: "20px",
              padding: "10px 20px",
              background: "#ff3366",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const getUserDisplayName = () => {
    const storyUser = currentStory.user || currentStory.userData || {}
    if (!storyUser || typeof storyUser === "string") return "Unknown User"
    return storyUser.nickname || storyUser.username || storyUser.name || "User"
  }

  const getProfilePicture = () => {
    const storyUser = currentStory.user || currentStory.userData || {}
    if (!storyUser || typeof storyUser === "string") {
      return `/api/avatar/default`
    }
    return storyUser.profilePicture || storyUser.avatar || `/api/avatar/${storyUser._id || "default"}`
  }

  const formatTimestamp = () => {
    try {
      return new Date(currentStory.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return "Recently"
    }
  }

  const getStoryContent = () => {
    // Ensure we have a valid story to display
    if (!currentStory) {
      return <div className="stories-text-content">No story available</div>
    }

    // Handle text stories
    if (currentStory.mediaType === "text" || currentStory.type === "text") {
      const styleProps = {}
      if (currentStory.backgroundStyle) {
        styleProps.background = currentStory.backgroundStyle
      } else if (currentStory.backgroundColor) {
        styleProps.background = currentStory.backgroundColor
      }
      if (currentStory.fontStyle) {
        styleProps.fontFamily = currentStory.fontStyle
      }

      return (
        <div className="stories-text-content" style={styleProps}>
          <div className="story-user-overlay">
            <span className="story-nickname">{getUserDisplayName()}</span>
          </div>
          {currentStory.text || currentStory.content || ""}
          {paused && (
            <div className="pause-indicator">
              <FaPlay size={24} />
            </div>
          )}
        </div>
      )
    }

    // Handle image stories
    if (
      (currentStory.mediaType?.startsWith("image") || currentStory.type === "image") &&
      (currentStory.mediaUrl || currentStory.media)
    ) {
      const mediaUrl = currentStory.mediaUrl || currentStory.media
      return (
        <div className="stories-image-container">
          <div className="story-user-overlay">
            <span className="story-nickname">{getUserDisplayName()}</span>
          </div>
          <img
            src={mediaUrl || "/placeholder.svg"}
            alt="Story"
            className="stories-media"
            crossOrigin="anonymous"
            onError={(e) => {
              e.target.onerror = null
              e.target.src = "/placeholder.svg"
            }}
          />
          {paused && (
            <div className="pause-indicator">
              <FaPlay size={24} />
            </div>
          )}
          {currentStory.content && currentStory.content.trim() && (
            <div className="story-caption">{currentStory.content}</div>
          )}
        </div>
      )
    }

    // Handle video stories
    if (
      (currentStory.mediaType?.startsWith("video") || currentStory.type === "video") &&
      (currentStory.mediaUrl || currentStory.media)
    ) {
      const mediaUrl = currentStory.mediaUrl || currentStory.media
      return (
        <div className="stories-video-container">
          <div className="story-user-overlay">
            <span className="story-nickname">{getUserDisplayName()}</span>
          </div>
          <video
            ref={videoRef}
            src={mediaUrl}
            className="stories-media"
            autoPlay
            muted={muted}
            loop={false}
            playsInline
            crossOrigin="anonymous"
            onTimeUpdate={handleTimeUpdate}
            onError={(e) => {
              console.error("Video failed to load:", e)
            }}
          />
          {paused && (
            <div className="pause-indicator">
              <FaPlay size={24} />
            </div>
          )}
          <button
            className="video-control mute-button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute video" : "Mute video"}
          >
            {muted ? <FaVolumeMute size={16} /> : <FaVolumeUp size={16} />}
          </button>
          {currentStory.content && currentStory.content.trim() && (
            <div className="story-caption">{currentStory.content}</div>
          )}
        </div>
      )
    }

    // Fallback for unknown story types
    return (
      <div className="stories-text-content">
        <div className="story-user-overlay">
          <span className="story-nickname">{getUserDisplayName()}</span>
        </div>
        <p>{currentStory.text || currentStory.content || "No content available"}</p>
        {paused && (
          <div className="pause-indicator">
            <FaPlay size={24} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="stories-viewer-overlay">
      <div className="stories-viewer-container">
        <div className="stories-viewer-header">
          {/* Progress bars */}
          <div className="stories-progress-container">
            {currentStories.map((_, index) => (
              <div key={index} className={`stories-progress-bar ${index < currentStoryIndex ? "completed" : ""}`}>
                {index === currentStoryIndex && (
                  <div className="stories-progress-fill" style={{ width: `${progress}%` }} />
                )}
              </div>
            ))}
          </div>

          {/* User info */}
          <div className="stories-user-info">
            <img
              src={getProfilePicture() || "/placeholder.svg"}
              alt={getUserDisplayName()}
              className="stories-user-avatar"
              onError={(e) => {
                e.target.onerror = null
                e.target.src = "/placeholder.svg"
              }}
            />
            <div className="stories-user-details">
              <span className="stories-username">{getUserDisplayName()}</span>
              <span className="stories-timestamp">{formatTimestamp()}</span>
            </div>
          </div>

          {/* Close button */}
          <button className="stories-close-btn" onClick={handleClose} aria-label="Close stories">
            ×
          </button>
        </div>

        <div
          className="stories-viewer-content"
          onClick={(e) => {
            // Only toggle pause if click is directly on content (not on a button or other element)
            if (e.target === e.currentTarget) {
              togglePause(e)
            }
          }}
        >
          {getStoryContent()}
        </div>

        <div className="stories-viewer-navigation" style={navigationStyle}>
          <div
            className="stories-nav-left"
            onClick={handlePrevStory}
            aria-label="Previous story"
            style={navArrowStyle}
          ></div>
          <div
            className="stories-nav-right"
            onClick={handleNextStory}
            aria-label="Next story"
            style={navArrowStyle}
          ></div>
        </div>

        {/* Improved Story actions */}
        <div
          ref={actionsRef}
          className="stories-actions"
          style={actionButtonsStyle}
          onClick={(e) => {
            // Prevent event bubbling
            e.stopPropagation()
            e.preventDefault()
            setActionClicked(true)
          }}
        >
          <button
            className={`story-action-button ${reacted ? "active" : ""}`}
            style={reacted ? activeButtonStyle : storyActionButtonStyle}
            onClick={handleReact}
            aria-label="Like story"
          >
            {reacted ? <FaHeart size={20} /> : <FaRegHeart size={20} />}
          </button>
          <button
            className="story-action-button"
            style={storyActionButtonStyle}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setActionClicked(true)
              toast.info("Comments feature coming soon!")
              setTimeout(() => setActionClicked(false), 300)
            }}
            aria-label="Comment on story"
          >
            <FaComment size={20} />
          </button>
          <button
            className="story-action-button"
            style={storyActionButtonStyle}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setActionClicked(true)
              toast.info("Share feature coming soon!")
              setTimeout(() => setActionClicked(false), 300)
            }}
            aria-label="Share story"
          >
            <FaShare size={20} />
          </button>
          <button
            className="story-action-button"
            style={storyActionButtonStyle}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              setActionClicked(true)
              togglePause(e)
              setTimeout(() => setActionClicked(false), 300)
            }}
            aria-label={paused ? "Play story" : "Pause story"}
          >
            {paused ? <FaPlay size={20} /> : <FaPause size={20} />}
          </button>
        </div>
      </div>
    </div>
  )
}

export default StoriesViewer

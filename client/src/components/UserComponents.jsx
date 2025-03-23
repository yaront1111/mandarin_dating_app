"use client"

// Optimized UserComponents.js with improved performance, security and UX
import { useState, useEffect, useCallback, memo, useMemo, useRef } from "react"
import { Link } from "react-router-dom"
import { FaHeart, FaComment, FaVideo, FaLock, FaUnlock, FaTrash, FaStar, FaSearch } from "react-icons/fa"
import { useAuth } from "../context/AuthContext"
import { useUser } from "../context/UserContext"
import apiService from "@services/apiService.jsx"
import { toast } from "react-toastify"
import { FixedSizeGrid, FixedSizeList } from "react-window"
import InfiniteLoader from "react-window-infinite-loader"
import AutoSizer from "react-virtualized-auto-sizer"
import debounce from "lodash/debounce"

// Import the normalizePhotoUrl utility
import { normalizePhotoUrl } from "../utils/index.js"

// Common constants
const GRID_COLUMN_COUNT = 3
const CARD_WIDTH = 300
const CARD_HEIGHT = 350
const LIST_ITEM_HEIGHT = 120
const BATCH_SIZE = 20

/**
 * Custom hook for handling debounced values
 */
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

// Update the LazyImage component to handle different URL formats
const LazyImage = memo(({ src, alt, className, placeholder = "/placeholder.svg" }) => {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const imgRef = useRef(null)

  // Format the source URL properly
  // From UserComponents.jsx - Updated formatSrc function in LazyImage component
  // In UserComponents.jsx - LazyImage component
  const formatSrc = useCallback(
    (url) => {
      if (!url) return placeholder
      return normalizePhotoUrl(url)
    },
    [placeholder],
  )

  const formattedSrc = formatSrc(src)

  useEffect(() => {
    // Initialize Intersection Observer for better performance
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (imgRef.current) {
            imgRef.current.src = formattedSrc
          }
          observer.disconnect()
        }
      },
      { rootMargin: "200px" }, // Load images 200px before they come into view
    )

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [formattedSrc])

  return (
    <div className={`lazy-image-container ${className}`}>
      {(!loaded || error) && (
        <img
          src={placeholder || "/placeholder.svg"}
          alt={`${alt} placeholder`}
          className={`placeholder-image ${className}`}
        />
      )}
      <img
        ref={imgRef}
        src={placeholder || "/placeholder.svg"} // Initially load placeholder, Observer will swap to actual src
        alt={alt}
        className={`${className} ${loaded ? "visible" : "hidden"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  )
})

/**
 * UserCard component for displaying user information in a grid or list
 */
export const UserCard = memo(
  ({ user, onMessageClick, onVideoClick, onLikeClick, layout = "grid", showActions = true }) => {
    const [isHovered, setIsHovered] = useState(false)
    const { user: currentUser } = useAuth()
    const { isUserLiked } = useUser()
    const isCurrentUser = currentUser && user && currentUser._id === user._id
    const liked = isUserLiked(user._id)

    // Format the last active time
    const formatLastActive = useCallback((lastActive) => {
      if (!lastActive) return "Unknown"

      const lastActiveDate = new Date(lastActive)
      const now = new Date()
      const diffMs = now - lastActiveDate
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMs / 3600000)
      const diffDays = Math.floor(diffMs / 86400000)

      if (diffMins < 1) return "Just now"
      if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`
      if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`

      return lastActiveDate.toLocaleDateString()
    }, [])

    // Get the profile photo URL
    const getProfilePhoto = useCallback(() => {
      if (!user || !user.photos || user.photos.length === 0) {
        return "/placeholder.svg"
      }
      return user.photos[0].url
    }, [user])

    // Handle card actions
    const handleMessageClick = useCallback(
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (onMessageClick) onMessageClick(user)
      },
      [onMessageClick, user],
    )

    const handleVideoClick = useCallback(
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (onVideoClick) onVideoClick(user)
      },
      [onVideoClick, user],
    )

    const handleLikeClick = useCallback(
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        if (onLikeClick) onLikeClick(user)
      },
      [onLikeClick, user],
    )

    // Memoize user details to prevent unnecessary re-renders
    const userDetails = useMemo(() => {
      const detailParts = []
      if (user.details?.age) detailParts.push(`${user.details.age}`)
      if (user.details?.gender) detailParts.push(`${user.details.gender}`)
      if (user.details?.location) detailParts.push(`${user.details.location}`)
      return detailParts.join(" • ")
    }, [user.details?.age, user.details?.gender, user.details?.location])

    // Render grid layout
    if (layout === "grid") {
      return (
        <div
          className="user-card"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label={`${user.nickname}'s profile card`}
        >
          <Link to={`/profile/${user._id}`} className="user-card-link">
            <div className="user-card-photo-container">
              <LazyImage
                src={getProfilePhoto()}
                alt={`${user.nickname}'s profile`}
                className="user-card-photo"
                placeholder="/placeholder.svg"
              />
              {user.isOnline && <span className="online-indicator" aria-label="Online"></span>}
            </div>

            <div className="user-card-info">
              <h3 className="user-card-name">{user.nickname}</h3>
              {userDetails && <p className="user-card-details">{userDetails}</p>}
              <p className="user-card-last-active">
                {user.isOnline ? "Online now" : `Last active: ${formatLastActive(user.lastActive)}`}
              </p>
            </div>

            {showActions && isHovered && !isCurrentUser && (
              <div className="user-card-actions">
                <button
                  onClick={handleMessageClick}
                  className="action-btn message-btn"
                  aria-label={`Message ${user.nickname}`}
                >
                  <FaComment />
                </button>
                <button
                  onClick={handleVideoClick}
                  className="action-btn video-btn"
                  aria-label={`Video call ${user.nickname}`}
                >
                  <FaVideo />
                </button>
                <button
                  onClick={handleLikeClick}
                  className={`action-btn like-btn ${liked ? "liked" : ""}`}
                  aria-label={`${liked ? "Unlike" : "Like"} ${user.nickname}`}
                >
                  <FaHeart />
                </button>
              </div>
            )}
          </Link>
        </div>
      )
    }

    // Render list layout
    return (
      <div
        className="user-list-item"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={`${user.nickname}'s profile item`}
      >
        <Link to={`/profile/${user._id}`} className="user-list-link">
          <div className="user-list-photo-container">
            <LazyImage
              src={getProfilePhoto()}
              alt={`${user.nickname}'s profile`}
              className="user-list-photo"
              placeholder="/placeholder.svg"
            />
            {user.isOnline && <span className="online-indicator" aria-label="Online"></span>}
          </div>

          <div className="user-list-info">
            <h3 className="user-list-name">{user.nickname}</h3>
            {userDetails && <p className="user-list-details">{userDetails}</p>}
            <p className="user-list-last-active">
              {user.isOnline ? "Online now" : `Last active: ${formatLastActive(user.lastActive)}`}
            </p>
          </div>
        </Link>

        {showActions && !isCurrentUser && (
          <div className="user-list-actions">
            <button
              onClick={handleMessageClick}
              className="action-btn message-btn"
              aria-label={`Message ${user.nickname}`}
            >
              <FaComment />
            </button>
            <button
              onClick={handleVideoClick}
              className="action-btn video-btn"
              aria-label={`Video call ${user.nickname}`}
            >
              <FaVideo />
            </button>
            <button
              onClick={handleLikeClick}
              className={`action-btn like-btn ${liked ? "liked" : ""}`}
              aria-label={`${liked ? "Unlike" : "Like"} ${user.nickname}`}
            >
              <FaHeart />
            </button>
          </div>
        )}
      </div>
    )
  },
)

/**
 * UserPhotoGallery component for displaying and managing user photos
 */
export const UserPhotoGallery = ({ userId, editable = false, onPhotoClick }) => {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const { user: currentUser } = useAuth()
  const isCurrentUser = currentUser && userId === currentUser._id
  const fileInputRef = useRef(null)

  // Fetch user photos
  const fetchPhotos = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiService.get(`/users/${userId}`)
      if (response.success && response.data.user) {
        setPhotos(response.data.user.photos || [])
      } else {
        throw new Error(response.error || "Failed to fetch photos")
      }
    } catch (err) {
      setError(err.message || "Failed to fetch photos")
      toast.error(err.message || "Failed to fetch photos")
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Load photos on mount
  useEffect(() => {
    fetchPhotos()
  }, [fetchPhotos])

  // Preview before upload
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload a JPEG, PNG, or GIF image.")
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.")
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewFile({
        file,
        preview: e.target.result,
      })
    }
    reader.readAsDataURL(file)
  }

  // Cancel preview
  const handleCancelUpload = () => {
    setPreviewFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = null
    }
  }

  // Handle photo upload
  // In UserComponents.jsx - In the uploadPhoto function
  const handlePhotoUpload = async (isPrivate = false) => {
    if (!previewFile) return

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append("photo", previewFile.file)
      formData.append("isPrivate", isPrivate)

      const response = await apiService.upload("/users/photos", formData, (progress) => {
        setUploadProgress(progress)
      })

      if (response.success) {
        toast.success(`Photo uploaded successfully${isPrivate ? " (Private)" : ""}!`)
        await fetchPhotos() // Ensure this is awaited
        setPreviewFile(null)
        setIsUploading(false) // Make sure to reset uploading state here
      } else {
        throw new Error(response.error || "Failed to upload photo")
      }
    } catch (err) {
      setError(err.message || "Failed to upload photo")
      toast.error(err.message || "Failed to upload photo")
      setIsUploading(false) // Important: reset uploading state on error
    } finally {
      setUploadProgress(0)
      if (fileInputRef.current) {
        fileInputRef.current.value = null
      }
    }
  }

  // Handle setting photo as profile photo
  const handleSetAsProfile = async (photoId) => {
    try {
      const response = await apiService.put(`/users/photos/${photoId}/profile`)
      if (response.success) {
        toast.success("Profile photo updated!")
        fetchPhotos()
      } else {
        throw new Error(response.error || "Failed to update profile photo")
      }
    } catch (err) {
      toast.error(err.message || "Failed to update profile photo")
    }
  }

  // Handle toggling photo privacy
  const handleTogglePrivacy = async (photoId, isCurrentlyPrivate) => {
    try {
      const response = await apiService.put(`/users/photos/${photoId}/privacy`, {
        isPrivate: !isCurrentlyPrivate,
      })
      if (response.success) {
        toast.success(`Photo is now ${!isCurrentlyPrivate ? "private" : "public"}`)
        fetchPhotos()
      } else {
        throw new Error(response.error || "Failed to update photo privacy")
      }
    } catch (err) {
      toast.error(err.message || "Failed to update photo privacy")
    }
  }

  // Handle deleting a photo
  const handleDeletePhoto = async (photoId) => {
    if (!window.confirm("Are you sure you want to delete this photo?")) return

    try {
      const response = await apiService.delete(`/users/photos/${photoId}`)
      if (response.success) {
        toast.success("Photo deleted successfully!")
        fetchPhotos()
      } else {
        throw new Error(response.error || "Failed to delete photo")
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete photo")
    }
  }

  // Handle photo click
  const handlePhotoClick = (photo) => {
    if (onPhotoClick) onPhotoClick(photo)
  }

  if (loading && photos.length === 0) {
    return <div className="loading-spinner">Loading photos...</div>
  }

  if (error && photos.length === 0) {
    return <div className="error-message">Error: {error}</div>
  }

  return (
    <div className="photo-gallery">
      {previewFile && (
        <div className="photo-preview-container">
          <h4>Photo Preview</h4>
          <div className="photo-preview">
            <img src={previewFile.preview || "/placeholder.svg"} alt="Preview" />
          </div>
          {isUploading ? (
            <div className="upload-progress">
              <div className="progress-bar" style={{ width: `${uploadProgress}%` }}></div>
              <span>{uploadProgress}%</span>
            </div>
          ) : (
            <div className="preview-actions">
              <button className="btn btn-primary" onClick={() => handlePhotoUpload(false)}>
                Upload as Public
              </button>
              <button className="btn btn-secondary" onClick={() => handlePhotoUpload(true)}>
                Upload as Private
              </button>
              <button className="btn btn-outline" onClick={handleCancelUpload}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {photos.length === 0 ? (
        <div className="no-photos">
          <p>No photos available</p>
          {isCurrentUser && editable && (
            <div className="upload-container">
              <label htmlFor="photo-upload" className="upload-btn">
                Upload your first photo
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={handleFileSelect}
                ref={fileInputRef}
                style={{ display: "none" }}
              />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="photo-grid">
            {photos.map((photo, index) => (
              <div key={photo._id} className="photo-item">
                <div
                  className="photo-container"
                  onClick={() => handlePhotoClick(photo)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Photo ${index + 1}${photo.isPrivate ? " (Private)" : ""}`}
                >
                  <LazyImage
                    src={photo.url || "/placeholder.svg"}
                    alt={`User photo ${index + 1}`}
                    className="photo-image"
                    placeholder="/placeholder.svg"
                  />
                  {photo.isPrivate && (
                    <div className="private-indicator">
                      <FaLock />
                    </div>
                  )}
                </div>

                {isCurrentUser && editable && (
                  <div className="photo-actions">
                    {index !== 0 && (
                      <button
                        onClick={() => handleSetAsProfile(photo._id)}
                        className="photo-action-btn profile-btn"
                        title="Set as profile photo"
                        aria-label="Set as profile photo"
                      >
                        <FaStar />
                      </button>
                    )}
                    <button
                      onClick={() => handleTogglePrivacy(photo._id, photo.isPrivate)}
                      className="photo-action-btn privacy-btn"
                      title={photo.isPrivate ? "Make public" : "Make private"}
                      aria-label={photo.isPrivate ? "Make public" : "Make private"}
                    >
                      {photo.isPrivate ? <FaUnlock /> : <FaLock />}
                    </button>
                    <button
                      onClick={() => handleDeletePhoto(photo._id)}
                      className="photo-action-btn delete-btn"
                      title="Delete photo"
                      aria-label="Delete photo"
                    >
                      <FaTrash />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isCurrentUser && editable && photos.length < 10 && !previewFile && (
            <div className="upload-container">
              <label htmlFor="photo-upload" className="upload-btn">
                Upload Photo
              </label>
              <input
                id="photo-upload"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif"
                onChange={handleFileSelect}
                ref={fileInputRef}
                style={{ display: "none" }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * UserPhotoViewer component for viewing photos with privacy controls
 */
export const UserPhotoViewer = ({ photo, userId, onClose, onNext, onPrevious, isPrivate, hasAccess }) => {
  const [requestingAccess, setRequestingAccess] = useState(false)
  const { user } = useAuth()
  const isCurrentUser = user && userId === user._id

  // Handle requesting access to private photo
  const handleRequestAccess = async () => {
    if (!user || isCurrentUser) return

    setRequestingAccess(true)
    try {
      const response = await apiService.post(`/users/photos/${photo._id}/request`, { userId })
      if (response.success) {
        toast.success("Access requested. The user will be notified.")
      } else {
        throw new Error(response.error || "Failed to request access")
      }
    } catch (err) {
      toast.error(err.message || "Failed to request access")
    } finally {
      setRequestingAccess(false)
    }
  }

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose()
      } else if (e.key === "ArrowRight") {
        onNext()
      } else if (e.key === "ArrowLeft") {
        onPrevious()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose, onNext, onPrevious])

  return (
    <div className="photo-viewer-overlay" onClick={onClose}>
      <div className="photo-viewer-container" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close photo viewer">
          &times;
        </button>

        {isPrivate && !hasAccess && !isCurrentUser ? (
          <div className="private-photo-container">
            <div className="private-photo-message">
              <FaLock size={48} />
              <h3>This photo is private</h3>
              <p>You need permission from the user to view this photo.</p>
              <button onClick={handleRequestAccess} disabled={requestingAccess} className="request-access-btn">
                {requestingAccess ? "Requesting..." : "Request Access"}
              </button>
            </div>
          </div>
        ) : (
          <div className="photo-viewer-content">
            <img src={photo.url || "/placeholder.svg"} alt="Full size" />

            <div className="photo-viewer-controls">
              <button onClick={onPrevious} className="nav-btn prev-btn" aria-label="Previous photo">
                &lt;
              </button>
              <button onClick={onNext} className="nav-btn next-btn" aria-label="Next photo">
                &gt;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Optimized UserList component with virtualization for better performance
 */
export const UserList = memo(
  ({
    users,
    onUserClick,
    onVideoClick,
    onLikeClick,
    loading,
    error,
    layout = "grid",
    hasMore = false,
    loadMore = null,
    totalCount = 0,
  }) => {
    const isItemLoaded = useCallback((index) => !hasMore || index < users.length, [hasMore, users.length])

    if (loading && users.length === 0) {
      return <div className="loading-spinner">Loading users...</div>
    }

    if (error) {
      return <div className="error-message">Error: {error}</div>
    }

    if (!users || users.length === 0) {
      return <div className="no-users">No users found</div>
    }

    // For grid layout, use grid virtualization
    if (layout === "grid") {
      const rowCount = Math.ceil(totalCount / GRID_COLUMN_COUNT)

      return (
        <div className="user-grid-container">
          <AutoSizer>
            {({ height, width }) => (
              <InfiniteLoader isItemLoaded={isItemLoaded} itemCount={totalCount} loadMoreItems={loadMore || (() => {})}>
                {({ onItemsRendered, ref }) => {
                  const newItemsRendered = ({
                    visibleRowStartIndex,
                    visibleRowStopIndex,
                    visibleColumnStartIndex,
                    visibleColumnStopIndex,
                  }) => {
                    const startIndex = visibleRowStartIndex * GRID_COLUMN_COUNT + visibleColumnStartIndex
                    const stopIndex = visibleRowStopIndex * GRID_COLUMN_COUNT + visibleColumnStopIndex

                    onItemsRendered({
                      overscanStartIndex: Math.max(0, startIndex - GRID_COLUMN_COUNT),
                      overscanStopIndex: Math.min(totalCount - 1, stopIndex + GRID_COLUMN_COUNT),
                      visibleStartIndex: startIndex,
                      visibleStopIndex: stopIndex,
                    })
                  }

                  return (
                    <FixedSizeGrid
                      ref={ref}
                      columnCount={GRID_COLUMN_COUNT}
                      columnWidth={width / GRID_COLUMN_COUNT}
                      height={height}
                      rowCount={rowCount}
                      rowHeight={CARD_HEIGHT}
                      width={width}
                      onItemsRendered={newItemsRendered}
                    >
                      {({ columnIndex, rowIndex, style }) => {
                        const index = rowIndex * GRID_COLUMN_COUNT + columnIndex
                        if (index >= users.length) {
                          // Return empty cell for placeholder
                          return loading ? (
                            <div style={style} className="user-card-placeholder">
                              <div className="loading-pulse"></div>
                            </div>
                          ) : null
                        }

                        const user = users[index]
                        return (
                          <div style={style}>
                            <UserCard
                              user={user}
                              onMessageClick={onUserClick}
                              onVideoClick={onVideoClick}
                              onLikeClick={onLikeClick}
                              layout="grid"
                            />
                          </div>
                        )
                      }}
                    </FixedSizeGrid>
                  )
                }}
              </InfiniteLoader>
            )}
          </AutoSizer>
        </div>
      )
    }

    // For list layout
    return (
      <div className="user-list-container">
        <AutoSizer>
          {({ height, width }) => (
            <InfiniteLoader isItemLoaded={isItemLoaded} itemCount={totalCount} loadMoreItems={loadMore || (() => {})}>
              {({ onItemsRendered, ref }) => (
                <FixedSizeList
                  ref={ref}
                  height={height}
                  width={width}
                  itemCount={totalCount}
                  itemSize={LIST_ITEM_HEIGHT}
                  onItemsRendered={onItemsRendered}
                >
                  {({ index, style }) => {
                    if (index >= users.length) {
                      // Return empty cell for placeholder
                      return loading ? (
                        <div style={style} className="user-list-placeholder">
                          <div className="loading-pulse"></div>
                        </div>
                      ) : null
                    }

                    const user = users[index]
                    return (
                      <div style={style}>
                        <UserCard
                          user={user}
                          onMessageClick={onUserClick}
                          onVideoClick={onVideoClick}
                          onLikeClick={onLikeClick}
                          layout="list"
                        />
                      </div>
                    )
                  }}
                </FixedSizeList>
              )}
            </InfiniteLoader>
          )}
        </AutoSizer>
      </div>
    )
  },
)

/**
 * Enhanced UserFilter component with debounced filtering
 */
export const UserFilter = ({ onFilter, initialFilters = {}, onResetFilters }) => {
  const [filters, setFilters] = useState({
    gender: initialFilters.gender || "",
    minAge: initialFilters.minAge || "",
    maxAge: initialFilters.maxAge || "",
    location: initialFilters.location || "",
    interests: initialFilters.interests || "",
    onlineOnly: initialFilters.onlineOnly || false,
  })

  // Debounce filter changes to reduce API calls
  const debouncedFilters = useDebounce(filters, 500)

  // Apply filters when debounced values change
  useEffect(() => {
    if (onFilter) onFilter(debouncedFilters)
  }, [debouncedFilters, onFilter])

  // Handle filter changes without needing a submit button
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target
    setFilters((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }))
  }, [])

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters({
      gender: "",
      minAge: "",
      maxAge: "",
      location: "",
      interests: "",
      onlineOnly: false,
    })
    if (onResetFilters) onResetFilters()
  }, [onResetFilters])

  return (
    <div className="user-filter-container">
      <div className="filter-header">
        <h3>Filter Users</h3>
        <button type="button" className="reset-filter-btn" onClick={resetFilters}>
          Reset All
        </button>
      </div>

      <div className="filter-form">
        <div className="filter-row">
          <div className="filter-group">
            <label htmlFor="gender">Gender</label>
            <select id="gender" name="gender" value={filters.gender} onChange={handleChange}>
              <option value="">Any</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non-binary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="filter-group">
            <label htmlFor="minAge">Min Age</label>
            <input
              type="number"
              id="minAge"
              name="minAge"
              min="18"
              max="120"
              value={filters.minAge}
              onChange={handleChange}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="maxAge">Max Age</label>
            <input
              type="number"
              id="maxAge"
              name="maxAge"
              min="18"
              max="120"
              value={filters.maxAge}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-group location-group">
            <label htmlFor="location">Location</label>
            <div className="location-input-wrapper">
              <FaSearch className="search-icon" />
              <input
                type="text"
                id="location"
                name="location"
                value={filters.location}
                onChange={handleChange}
                placeholder="City, Country"
              />
            </div>
          </div>

          <div className="filter-group interests-group">
            <label htmlFor="interests">Interests</label>
            <input
              type="text"
              id="interests"
              name="interests"
              value={filters.interests}
              onChange={handleChange}
              placeholder="Separate with commas"
            />
          </div>
        </div>

        <div className="filter-row">
          <div className="filter-group checkbox-group">
            <label htmlFor="onlineOnly" className="checkbox-label">
              <input
                type="checkbox"
                id="onlineOnly"
                name="onlineOnly"
                checked={filters.onlineOnly}
                onChange={handleChange}
              />
              <span className="checkbox-text">Online Users Only</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * User Search component for quick user search
 */
export const UserSearch = ({ onSearch }) => {
  const [searchTerm, setSearchTerm] = useState("")

  // Debounce search to avoid excessive API calls
  const debouncedHandleSearch = useCallback(
    debounce((value) => {
      if (onSearch) onSearch(value)
    }, 300),
    [onSearch],
  )

  const handleChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)
    debouncedHandleSearch(value)
  }

  return (
    <div className="user-search">
      <div className="search-input-wrapper">
        <FaSearch className="search-icon" />
        <input
          type="text"
          placeholder="Search users..."
          value={searchTerm}
          onChange={handleChange}
          className="search-input"
        />
        {searchTerm && (
          <button
            className="clear-search"
            onClick={() => {
              setSearchTerm("")
              debouncedHandleSearch("")
            }}
            aria-label="Clear search"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * User Avatar component for profile pictures
 */
export const UserAvatar = ({ user, size = "md", showStatus = true, className = "" }) => {
  const getProfilePhoto = () => {
    if (!user) return "/placeholder.svg"
    if (user.profilePicture) return user.profilePicture
    if (user.avatar) return user.avatar
    if (user.photos && user.photos.length > 0) return user.photos[0].url
    return "/placeholder.svg"
  }

  const sizeClasses = {
    xs: "avatar-xs",
    sm: "avatar-sm",
    md: "avatar-md",
    lg: "avatar-lg",
    xl: "avatar-xl",
  }

  return (
    <div className={`user-avatar ${sizeClasses[size]} ${className}`}>
      <img src={getProfilePhoto() || "/placeholder.svg"} alt={user?.nickname || "User"} className="avatar-img" />
      {showStatus && user?.isOnline && <span className="status-indicator online" aria-label="Online"></span>}
    </div>
  )
}

export default {
  UserCard,
  UserPhotoGallery,
  UserPhotoViewer,
  UserList,
  UserFilter,
  UserSearch,
  UserAvatar,
  LazyImage,
}

"use client"
import { useEffect, useState, useCallback, useRef } from "react"
import {
  FaHeart,
  FaComment,
  FaEllipsisH,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaRegClock,
  FaCheck,
  FaChevronRight,
  FaChevronLeft,
  FaLock,
  FaUserAlt,
  FaTrophy,
  FaFlag,
  FaBan,
  FaCamera,
  FaSpinner,
  FaTimes,
  FaEye,
  FaTimesCircle,
} from "react-icons/fa"
import { useUser, useChat, useAuth, useStories } from "../context"
import { EmbeddedChat } from "../components"
import StoriesViewer from "./Stories/StoriesViewer"
import StoryThumbnail from "./Stories/StoryThumbnail"
import { toast } from "react-toastify"
import apiService from "../services/apiService.jsx"
import "../styles/UserProfileModal.css" // Import the new CSS file
import { useNavigate } from "react-router-dom"

// Simple local Spinner component
const Spinner = () => (
  <div className="spinner">
    <FaSpinner className="spinner-icon" size={32} />
  </div>
)

// Helper function to normalize photo URLs
const normalizePhotoUrl = (url) => {
  if (!url) return null
  // If it's already a full URL, return it
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url
  }
  // If it's a relative path, make sure it has a leading slash
  if (!url.startsWith("/")) {
    return `/${url}`
  }
  return url
}

const UserProfileModal = ({ userId, isOpen, onClose }) => {
  const { user: currentUser } = useAuth()
  const {
    getUser,
    currentUser: profileUser,
    requestPhotoPermission,
    likeUser,
    unlikeUser,
    isUserLiked,
    error,
    blockUser,
    reportUser,
    sendMessage,
  } = useUser()
  const { initiateChat } = useChat()
  const { loadUserStories, hasUnviewedStories } = useStories()
  const [userStories, setUserStories] = useState([])
  const [showChat, setShowChat] = useState(false)
  const [activePhotoIndex, setActivePhotoIndex] = useState(0)
  const [showActions, setShowActions] = useState(false)
  const [showAllInterests, setShowAllInterests] = useState(false)
  const [showStories, setShowStories] = useState(false)
  const [loadingPermissions, setLoadingPermissions] = useState({}) // Track loading state per photo
  const [permissionStatus, setPermissionStatus] = useState({})
  const [photoLoadError, setPhotoLoadError] = useState({})
  const [isLiking, setIsLiking] = useState(false)
  const [isChatInitiating, setIsChatInitiating] = useState(false)
  const profileRef = useRef(null)
  const [isRequestingAll, setIsRequestingAll] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(false)
  const [isProcessingApproval, setIsProcessingApproval] = useState(false)
  const modalRef = useRef(null)
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)

  // Check if the profile belongs to the current user
  const isOwnProfile = currentUser && profileUser && currentUser._id === profileUser._id

  // Add a mounted ref to prevent state updates after component unmount
  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose])

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === "Escape") {
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscKey)
    }
    return () => {
      document.removeEventListener("keydown", handleEscKey)
    }
  }, [isOpen, onClose])

  // Add this console log right after the user data is fetched to see what's actually coming from the server
  useEffect(() => {
    const fetchUser = async () => {
      if (userId) {
        setLoading(true)
        try {
          const userData = await getUser(userId)
          console.log("User data received:", JSON.stringify(userData, null, 2))
          setUser(userData)
        } catch (error) {
          console.error("Error fetching user:", error)
        } finally {
          setLoading(false)
        }
      }
    }

    fetchUser()
  }, [userId, getUser])

  // Load user data
  useEffect(() => {
    if (isOpen && userId) {
      getUser(userId)
      // Load user stories safely
      try {
        loadUserStories?.(userId)
          .then((stories) => {
            if (isMountedRef.current && stories && Array.isArray(stories)) {
              setUserStories(stories)
            }
          })
          .catch((err) => console.error("Error loading stories:", err))
      } catch (error) {
        console.log("Stories functionality not available")
      }
      fetchPhotoPermissions()
      // If viewing own profile, fetch pending requests
      if (currentUser && currentUser._id === userId) {
        fetchPendingRequests()
      }
    }
    // Reset states when user changes or modal opens
    if (isOpen) {
      setActivePhotoIndex(0)
      setShowAllInterests(false)
      setShowActions(false)
      setPhotoLoadError({})
      setPermissionStatus({})
      setLoadingPermissions({})
      setPendingRequests([])
      setShowChat(false)
      setShowStories(false)
    }
    return () => {
      setShowChat(false)
      setShowStories(false)
    }
  }, [userId, getUser, loadUserStories, currentUser, isOpen])

  // Fetch pending photo access requests for the current user
  const fetchPendingRequests = async () => {
    if (!currentUser) return
    setIsLoadingRequests(true)
    try {
      const response = await apiService.get("/users/photos/permissions?status=pending")
      if (response.success) {
        // Group requests by user
        const requestsByUser = {}
        response.data.forEach((request) => {
          const userId = request.requestedBy._id
          if (!requestsByUser[userId]) {
            requestsByUser[userId] = {
              user: request.requestedBy,
              requests: [],
            }
          }
          requestsByUser[userId].requests.push(request)
        })
        // Convert to array
        const groupedRequests = Object.values(requestsByUser)
        setPendingRequests(groupedRequests)
      }
    } catch (error) {
      console.error("Error fetching pending requests:", error)
      toast.error("Failed to load photo access requests")
    } finally {
      setIsLoadingRequests(false)
    }
  }

  // Handle approving all requests from a specific user
  const handleApproveAllRequests = async (userId, requests) => {
    setIsProcessingApproval(true)
    try {
      const results = await Promise.allSettled(
        requests.map((request) =>
          apiService.put(`/users/photos/permissions/${request._id}`, {
            status: "approved",
          }),
        ),
      )
      const successCount = results.filter((result) => result.status === "fulfilled" && result.value.success).length
      if (successCount === requests.length) {
        toast.success(`Approved all photo requests from this user`)
      } else if (successCount > 0) {
        toast.success(`Approved ${successCount} out of ${requests.length} photo requests`)
      } else {
        toast.error("Failed to approve photo requests")
      }
      // Refresh the pending requests
      fetchPendingRequests()
    } catch (error) {
      console.error("Error approving requests:", error)
      toast.error("Failed to approve photo requests")
    } finally {
      setIsProcessingApproval(false)
    }
  }

  // Handle rejecting all requests from a specific user
  const handleRejectAllRequests = async (userId, requests) => {
    setIsProcessingApproval(true)
    try {
      const results = await Promise.allSettled(
        requests.map((request) =>
          apiService.put(`/users/photos/permissions/${request._id}`, {
            status: "rejected",
          }),
        ),
      )
      const successCount = results.filter((result) => result.status === "fulfilled" && result.value.success).length
      if (successCount === requests.length) {
        toast.success(`Rejected all photo requests from this user`)
      } else if (successCount > 0) {
        toast.success(`Rejected ${successCount} out of ${requests.length} photo requests`)
      } else {
        toast.error("Failed to reject photo requests")
      }
      // Refresh the pending requests
      fetchPendingRequests()
    } catch (error) {
      console.error("Error rejecting requests:", error)
      toast.error("Failed to reject photo requests")
    } finally {
      setIsProcessingApproval(false)
    }
  }

  // Improved handleRequestAccess function to handle multiple photo requests
  const handleRequestAccess = async (photoId, e) => {
    if (e) e.stopPropagation()
    if (!profileUser || !photoId) return
    // Set loading state for this specific photo
    setLoadingPermissions((prev) => ({
      ...prev,
      [photoId]: true,
    }))
    try {
      // Make a direct API call
      const response = await apiService.post(`/users/photos/${photoId}/request`, {
        userId: profileUser._id,
      })
      if (response.success) {
        // Update the local permission status immediately for better UX
        setPermissionStatus((prev) => ({
          ...prev,
          [photoId]: "pending",
        }))
        toast.success("Photo access requested")
      } else if (response.message && response.message.includes("already exists")) {
        // If there's an error but it's just that the request already exists
        setPermissionStatus((prev) => ({
          ...prev,
          [photoId]: "pending",
        }))
        toast.info("Access request already sent for this photo")
      } else {
        throw new Error(response.error || "Failed to request access")
      }
    } catch (error) {
      console.error("Error requesting photo access:", error)
      // Check if the error is about an existing request
      if (error.message && error.message.includes("already exists")) {
        setPermissionStatus((prev) => ({
          ...prev,
          [photoId]: "pending",
        }))
        toast.info("Access request already sent for this photo")
      } else {
        toast.error(error.message || "Failed to request photo access")
      }
    } finally {
      // Clear loading state for this specific photo
      setLoadingPermissions((prev) => ({
        ...prev,
        [photoId]: false,
      }))
      // Refresh all permissions to ensure we have the latest data
      fetchPhotoPermissions()
    }
  }

  // Improved fetchPhotoPermissions function
  const fetchPhotoPermissions = async () => {
    if (!userId) return
    try {
      const response = await apiService.get(`/users/${userId}/photo-permissions`)
      if (response.success) {
        const statusMap = {}
        response.data.forEach((permission) => {
          statusMap[permission.photo] = permission.status
        })
        setPermissionStatus(statusMap)
      } else {
        console.error("Error fetching permissions:", response.error)
      }
    } catch (error) {
      console.error("Error loading photo permissions:", error)
    }
  }

  // Handle image loading errors
  const handleImageError = useCallback((photoId) => {
    setPhotoLoadError((prev) => ({
      ...prev,
      [photoId]: true,
    }))
  }, [])

  // Handle liking/unliking users
  const handleLike = async () => {
    if (!profileUser || isLiking) return
    setIsLiking(true)
    try {
      if (isUserLiked(profileUser._id)) {
        await unlikeUser(profileUser._id, profileUser.nickname)
      } else {
        await likeUser(profileUser._id, profileUser.nickname)
      }
    } catch (error) {
      console.error("Error toggling like:", error)
    } finally {
      setIsLiking(false)
    }
  }

  const handleBlock = async () => {
    try {
      await blockUser(userId)
      onClose()
    } catch (error) {
      console.error("Error blocking user:", error)
    }
  }

  const handleReport = async () => {
    try {
      await reportUser(userId)
      onClose()
    } catch (error) {
      console.error("Error reporting user:", error)
    }
  }

  // Handle starting chat
  const handleMessage = async () => {
    setIsChatInitiating(true)
    try {
      await sendMessage(userId)
      navigate("/messages")
      onClose()
    } catch (error) {
      console.error("Error sending message:", error)
    } finally {
      setIsChatInitiating(false)
    }
  }

  // Close chat window
  const handleCloseChat = () => {
    setShowChat(false)
  }

  // View user stories
  const handleViewStories = () => {
    setShowStories(true)
  }

  // Close stories viewer
  const handleCloseStories = () => {
    setShowStories(false)
  }

  // Navigate through photos
  const nextPhoto = () => {
    if (profileUser?.photos && activePhotoIndex < profileUser.photos.length - 1) {
      setActivePhotoIndex(activePhotoIndex + 1)
    }
  }

  const prevPhoto = () => {
    if (activePhotoIndex > 0) {
      setActivePhotoIndex(activePhotoIndex - 1)
    }
  }

  // Calculate compatibility score between users
  const calculateCompatibility = () => {
    if (!profileUser || !profileUser.details || !currentUser || !currentUser.details) return 0
    let score = 0

    // Location
    if (profileUser.details.location === currentUser.details.location) {
      score += 25
    }

    // Age proximity
    const ageDiff = Math.abs((profileUser.details.age || 0) - (currentUser.details.age || 0))
    if (ageDiff <= 5) score += 25
    else if (ageDiff <= 10) score += 15
    else score += 5

    // Interests
    const profileInterests = profileUser.details?.interests || []
    const userInterests = currentUser.details?.interests || []
    const commonInterests = profileInterests.filter((i) => userInterests.includes(i))
    score += Math.min(50, commonInterests.length * 10)

    return Math.min(100, score)
  }

  // Request access to all private photos at once
  const handleRequestAccessToAllPhotos = async () => {
    if (!profileUser || !profileUser.photos) return
    // Find all private photos that don't have approved access
    const privatePhotos = profileUser.photos.filter(
      (photo) => photo.isPrivate && (!permissionStatus[photo._id] || permissionStatus[photo._id] !== "approved"),
    )
    if (privatePhotos.length === 0) {
      toast.info("No private photos to request access to")
      return
    }

    // Set loading state
    setIsRequestingAll(true)
    try {
      // Request access to each photo
      const results = await Promise.allSettled(
        privatePhotos.map((photo) =>
          apiService.post(`/users/photos/${photo._id}/request`, {
            userId: profileUser._id,
          }),
        ),
      )

      // Count successful requests
      const successCount = results.filter((result) => result.status === "fulfilled" && result.value.success).length
      // Count already pending requests
      const pendingCount = results.filter(
        (result) =>
          result.status === "fulfilled" && result.value.message && result.value.message.includes("already exists"),
      ).length

      // Update UI for all photos
      const newPermissionStatus = { ...permissionStatus }
      privatePhotos.forEach((photo) => {
        newPermissionStatus[photo._id] = "pending"
      })
      setPermissionStatus(newPermissionStatus)

      // Show appropriate message
      if (successCount > 0 && pendingCount > 0) {
        toast.success(`Requested access to ${successCount} photos. ${pendingCount} already pending.`)
      } else if (successCount > 0) {
        toast.success(`Successfully requested access to ${successCount} photos`)
      } else if (pendingCount > 0) {
        toast.info("Access requests already sent for all photos")
      }

      // Refresh permissions to ensure we have the latest data
      fetchPhotoPermissions()
    } catch (error) {
      console.error("Error requesting photo access:", error)
      toast.error("Failed to request access to some photos")
    } finally {
      setIsRequestingAll(false)
    }
  }

  // Check if there's a pending request from the current profile user
  const hasPendingRequestFromUser = pendingRequests.some(
    (item) => item.user && profileUser && item.user._id === profileUser._id,
  )

  // Get the pending requests from the current profile user
  const currentUserRequests = pendingRequests.find(
    (item) => item.user && profileUser && item.user._id === profileUser._id,
  )

  const compatibility = profileUser && currentUser ? calculateCompatibility() : 0
  const commonInterests =
    profileUser && currentUser && profileUser.details?.interests
      ? profileUser.details.interests.filter((interest) => currentUser.details?.interests?.includes(interest))
      : []

  if (!isOpen) return null

  // Handle errors and loading states
  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="loading-container">
            <Spinner />
            <p className="loading-text">Loading profile...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="error-container">
            <h3>Error Loading Profile</h3>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!profileUser) {
    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="not-found-container">
            <h3>User Not Found</h3>
            <p>The user you're looking for doesn't exist or has been removed.</p>
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Helper function to capitalize first letter
  const capitalize = (str) => {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  return (
    <div className="modal-overlay">
      <div className="modal-container user-profile-modal" ref={modalRef}>
        <button className="modal-close-btn" onClick={onClose}>
          <FaTimesCircle />
        </button>
        <div className="modern-user-profile" ref={profileRef}>
          <div className="container profile-content">
            {/* Show pending requests notification if this user has requested access to your photos */}
            {!isOwnProfile && hasPendingRequestFromUser && currentUserRequests && (
              <div className="pending-requests-notification">
                <div className="notification-content">
                  <FaEye className="notification-icon" />
                  <div className="notification-text">
                    <p>
                      <strong>{profileUser.nickname}</strong> has requested access to{" "}
                      {currentUserRequests.requests.length} of your private photos
                    </p>
                  </div>
                </div>
                <div className="notification-actions">
                  <button
                    className="btn btn-success"
                    onClick={() => handleApproveAllRequests(profileUser._id, currentUserRequests.requests)}
                    disabled={isProcessingApproval}
                  >
                    {isProcessingApproval ? <FaSpinner className="spinner-icon" /> : <FaCheck />} Approve All
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleRejectAllRequests(profileUser._id, currentUserRequests.requests)}
                    disabled={isProcessingApproval}
                  >
                    {isProcessingApproval ? <FaSpinner className="spinner-icon" /> : <FaTimes />} Reject All
                  </button>
                </div>
              </div>
            )}
            <div className="profile-layout">
              {/* Left: Photos */}
              <div className="profile-photos-section">
                {/* Stories Thumbnail */}
                {userStories && userStories.length > 0 && (
                  <div className="profile-stories">
                    <StoryThumbnail
                      user={profileUser}
                      hasUnviewedStories={hasUnviewedStories && hasUnviewedStories(profileUser._id)}
                      onClick={handleViewStories}
                    />
                  </div>
                )}
                {profileUser && profileUser.photos && profileUser.photos.length > 0 ? (
                  <div className="photo-gallery-container">
                    <div className="gallery-photo">
                      {profileUser.photos[activePhotoIndex] &&
                      profileUser.photos[activePhotoIndex].isPrivate &&
                      (!permissionStatus[profileUser.photos[activePhotoIndex]._id] ||
                        permissionStatus[profileUser.photos[activePhotoIndex]._id] !== "approved") ? (
                        <div className="private-photo-placeholder">
                          <FaLock className="lock-icon" />
                          <p>Private Photo</p>
                          {permissionStatus[profileUser.photos[activePhotoIndex]._id] === "pending" && (
                            <p className="permission-status pending">Request Pending</p>
                          )}
                          {permissionStatus[profileUser.photos[activePhotoIndex]._id] === "rejected" && (
                            <p className="permission-status rejected">Access Denied</p>
                          )}
                          {!permissionStatus[profileUser.photos[activePhotoIndex]._id] && (
                            <button
                              className="request-access-btn"
                              onClick={(e) => handleRequestAccess(profileUser.photos[activePhotoIndex]._id, e)}
                              disabled={loadingPermissions[profileUser.photos[activePhotoIndex]._id]}
                            >
                              {loadingPermissions[profileUser.photos[activePhotoIndex]._id] ? (
                                <FaSpinner className="spinner-icon" />
                              ) : (
                                "Request Access"
                              )}
                            </button>
                          )}
                        </div>
                      ) : (
                        profileUser.photos[activePhotoIndex] && (
                          <img
                            src={normalizePhotoUrl(profileUser.photos[activePhotoIndex].url) || "/placeholder.svg"}
                            alt={profileUser.nickname}
                            onError={() => handleImageError(profileUser.photos[activePhotoIndex]._id)}
                            style={{
                              display: photoLoadError[profileUser.photos[activePhotoIndex]._id] ? "none" : "block",
                            }}
                          />
                        )
                      )}
                      {profileUser.photos[activePhotoIndex] &&
                        photoLoadError[profileUser.photos[activePhotoIndex]._id] && (
                          <div className="image-error-placeholder">
                            <FaCamera size={48} />
                            <p>Image could not be loaded</p>
                          </div>
                        )}
                      {profileUser.isOnline && (
                        <div className="online-badge">
                          <span className="pulse"></span>
                          Online Now
                        </div>
                      )}
                      {profileUser.photos.length > 1 && (
                        <>
                          <button className="gallery-nav prev" onClick={prevPhoto} disabled={activePhotoIndex === 0}>
                            <FaChevronLeft />
                          </button>
                          <button
                            className="gallery-nav next"
                            onClick={nextPhoto}
                            disabled={activePhotoIndex === profileUser.photos.length - 1}
                          >
                            <FaChevronRight />
                          </button>
                        </>
                      )}
                    </div>
                    {profileUser.photos.length > 1 && (
                      <div className="photo-thumbnails">
                        {profileUser.photos.map((photo, index) => (
                          <div
                            key={photo._id || index}
                            className={`photo-thumbnail ${index === activePhotoIndex ? "active" : ""}`}
                            onClick={() => setActivePhotoIndex(index)}
                          >
                            {photo.isPrivate ? (
                              <div className="private-thumbnail">
                                <FaLock />
                                {permissionStatus[photo._id] && (
                                  <div className={`permission-status ${permissionStatus[photo._id]}`}>
                                    {permissionStatus[photo._id] === "pending" && "Pending"}
                                    {permissionStatus[photo._id] === "approved" && "Access Granted"}
                                    {permissionStatus[photo._id] === "rejected" && "Denied"}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <img
                                src={normalizePhotoUrl(photo.url) || "/placeholder.svg"}
                                alt={`${profileUser.nickname} ${index + 1}`}
                                onError={() => handleImageError(photo._id)}
                                style={{ display: photoLoadError[photo._id] ? "none" : "block" }}
                              />
                            )}
                            {photoLoadError[photo._id] && (
                              <div className="thumbnail-error">
                                <FaUserAlt />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="no-photo-placeholder">
                    <FaUserAlt size={64} />
                    <p>No photos available</p>
                  </div>
                )}
                <div className="profile-actions">
                  {!isOwnProfile && (
                    <>
                      <button
                        className={`btn profile-action-btn ${isUserLiked && isUserLiked(profileUser._id) ? "liked" : ""}`}
                        onClick={handleLike}
                        disabled={isLiking}
                      >
                        {isLiking ? <FaSpinner className="spinner-icon" /> : <FaHeart />}
                        <span>{isUserLiked && isUserLiked(profileUser._id) ? "Liked" : "Like"}</span>
                      </button>
                      <button
                        className="btn btn-primary profile-action-btn"
                        onClick={handleMessage}
                        disabled={isChatInitiating}
                      >
                        {isChatInitiating ? <FaSpinner className="spinner-icon" /> : <FaComment />}
                        <span>Message</span>
                      </button>
                    </>
                  )}
                  <div className="more-actions-dropdown">
                    <button className="btn btn-subtle" onClick={() => setShowActions(!showActions)}>
                      <FaEllipsisH />
                    </button>
                    {showActions && (
                      <div className="actions-dropdown">
                        <button className="dropdown-item" onClick={handleReport}>
                          <FaFlag /> Report User
                        </button>
                        <button className="dropdown-item" onClick={handleBlock}>
                          <FaBan /> Block User
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Right: User Details */}
              <div className="profile-details-section">
                <div className="user-headline">
                  <h1>
                    {profileUser.nickname}, {profileUser.details?.age || "?"}
                  </h1>
                  {profileUser.role === "premium" && (
                    <div className="premium-badge">
                      <FaTrophy /> Premium
                    </div>
                  )}
                </div>
                <div className="user-location">
                  <FaMapMarkerAlt />
                  <span>{profileUser.details?.location || "Unknown location"}</span>
                  <div className={`online-status ${profileUser.isOnline ? "online" : ""}`}>
                    {profileUser.isOnline ? "Online now" : "Offline"}
                  </div>
                </div>
                <div className="user-activity">
                  <div className="activity-item">
                    <FaRegClock />
                    <span>
                      {profileUser.isOnline
                        ? "Active now"
                        : `Last active ${new Date(profileUser.lastActive).toLocaleDateString()}`}
                    </span>
                  </div>
                  <div className="activity-item">
                    <FaCalendarAlt />
                    <span>Member since {new Date(profileUser.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                {!isOwnProfile && (
                  <div className="compatibility-section">
                    <h2>Compatibility</h2>
                    <div className="compatibility-score">
                      <div className="score-circle">
                        <svg viewBox="0 0 100 100">
                          <circle className="score-bg" cx="50" cy="50" r="45" />
                          <circle
                            className="score-fill"
                            cx="50"
                            cy="50"
                            r="45"
                            strokeDasharray="283"
                            strokeDashoffset={283 - (283 * compatibility) / 100}
                          />
                        </svg>
                        <div className="score-value">{compatibility}%</div>
                      </div>
                      <div className="compatibility-details">
                        <div className="compatibility-factor">
                          <span>Location</span>
                          <div className="factor-bar">
                            <div
                              className="factor-fill"
                              style={{
                                width:
                                  profileUser.details?.location === currentUser?.details?.location ? "100%" : "30%",
                              }}
                            ></div>
                          </div>
                        </div>
                        <div className="compatibility-factor">
                          <span>Age</span>
                          <div className="factor-bar">
                            <div
                              className="factor-fill"
                              style={{
                                width:
                                  Math.abs((profileUser.details?.age || 0) - (currentUser?.details?.age || 0)) <= 5
                                    ? "90%"
                                    : Math.abs((profileUser.details?.age || 0) - (currentUser?.details?.age || 0)) <= 10
                                      ? "60%"
                                      : "30%",
                              }}
                            ></div>
                          </div>
                        </div>
                        <div className="compatibility-factor">
                          <span>Interests</span>
                          <div className="factor-bar">
                            <div
                              className="factor-fill"
                              style={{
                                width: `${Math.min(100, commonInterests.length * 20)}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {profileUser.details?.bio && (
                  <div className="profile-section">
                    <h2>About Me</h2>
                    <p className="about-text">{profileUser.details.bio}</p>
                  </div>
                )}
                {profileUser.details?.iAm && (
                  <div className="profile-section">
                    <h2>I am a</h2>
                    <p>{capitalize(profileUser.details.iAm)}</p>
                  </div>
                )}

                {profileUser.details?.maritalStatus && (
                  <div className="profile-section">
                    <h2>Marital Status</h2>
                    <p>{profileUser.details.maritalStatus}</p>
                  </div>
                )}

                {profileUser.details?.lookingFor && profileUser.details.lookingFor.length > 0 && (
                  <div className="profile-section">
                    <h2>Looking For</h2>
                    <div className="tags-container">
                      {profileUser.details.lookingFor.map((item, index) => (
                        <span key={index} className="tag looking-for-tag">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profileUser.details?.intoTags && profileUser.details.intoTags.length > 0 && (
                  <div className="profile-section">
                    <h2>I'm Into</h2>
                    <div className="tags-container">
                      {profileUser.details.intoTags.map((item, index) => (
                        <span key={index} className="tag into-tag">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profileUser.details?.turnOns && profileUser.details.turnOns.length > 0 && (
                  <div className="profile-section">
                    <h2>It Turns Me On</h2>
                    <div className="tags-container">
                      {profileUser.details.turnOns.map((item, index) => (
                        <span key={index} className="tag turn-on-tag">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {profileUser.details?.interests?.length > 0 && (
                  <div className="profile-section">
                    <h2>Interests</h2>
                    <div className="interests-tags">
                      {(showAllInterests
                        ? profileUser.details.interests
                        : profileUser.details.interests.slice(0, 8)
                      ).map((interest) => (
                        <span
                          key={interest}
                          className={`interest-tag ${commonInterests.includes(interest) ? "common" : ""}`}
                        >
                          {interest}
                          {commonInterests.includes(interest) && <FaCheck className="common-icon" />}
                        </span>
                      ))}
                      {!showAllInterests && profileUser.details.interests.length > 8 && (
                        <button className="show-more-interests" onClick={() => setShowAllInterests(true)}>
                          +{profileUser.details.interests.length - 8} more
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Embedded Chat */}
            {showChat && (
              <>
                <div className="chat-overlay" onClick={handleCloseChat}></div>
                <EmbeddedChat recipient={profileUser} isOpen={showChat} onClose={handleCloseChat} />
              </>
            )}
            {/* Stories Viewer */}
            {showStories && <StoriesViewer userId={profileUser._id} onClose={handleCloseStories} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserProfileModal

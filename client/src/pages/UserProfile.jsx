"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  FaArrowLeft,
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
} from "react-icons/fa"
import { useParams, useNavigate } from "react-router-dom"
import { useUser, useChat, useAuth, useStories } from "../context"
import { EmbeddedChat } from "../components"
import StoriesViewer from "../components/Stories/StoriesViewer"
import StoryThumbnail from "../components/Stories/StoryThumbnail"
import { toast } from "react-toastify"
import apiService from "../services/apiService.jsx"
import { normalizePhotoUrl } from "../utils/index.js"

// Simple Spinner component
const Spinner = () => (
  <div className="spinner">
    <FaSpinner className="spinner-icon" size={32} />
  </div>
)

const UserProfile = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const {
    getUser,
    currentUser: profileUser,
    loading,
    requestPhotoPermission,
    likeUser,
    unlikeUser,
    isUserLiked,
    error,
  } = useUser()
  // FIX: Destructure sendMessage from useChat (needed for sending approval message)
  const { sendMessage } = useChat()
  const { loadUserStories, hasUnviewedStories } = useStories()

  // Local component state
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
  const [isRequestingAll, setIsRequestingAll] = useState(false)
  const [pendingRequests, setPendingRequests] = useState([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(false)
  const [isProcessingApproval, setIsProcessingApproval] = useState(false)

  // Check if viewing own profile
  const isOwnProfile = currentUser && profileUser && currentUser._id === profileUser._id

  // Mounted ref to avoid state updates after unmount
  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Fetch user data, stories, photo permissions, and pending requests when id changes
  useEffect(() => {
    if (id) {
      getUser(id)
      try {
        loadUserStories?.(id)
          .then((stories) => {
            if (isMountedRef.current && Array.isArray(stories)) {
              setUserStories(stories)
            }
          })
          .catch((err) => console.error("Error loading stories:", err))
      } catch (error) {
        console.log("Stories functionality not available")
      }
      fetchPhotoPermissions()
      if (currentUser && currentUser._id === id) {
        fetchPendingRequests()
      }
    }
    // Reset UI states when user changes
    setActivePhotoIndex(0)
    setShowAllInterests(false)
    setShowActions(false)
    setPhotoLoadError({})
    setPermissionStatus({})
    setLoadingPermissions({})
    setPendingRequests([])

    return () => {
      setShowChat(false)
      setShowStories(false)
    }
  }, [id, getUser, loadUserStories, currentUser])

  // Fetch pending photo access requests for the current user
  const fetchPendingRequests = async () => {
    if (!currentUser) return
    setIsLoadingRequests(true)
    try {
      const response = await apiService.get("/users/photos/permissions?status=pending")
      if (response.success) {
        // Group requests by requester
        const requestsByUser = {}
        response.data.forEach((request) => {
          const userId = request.requestedBy._id
          if (!requestsByUser[userId]) {
            requestsByUser[userId] = { user: request.requestedBy, requests: [] }
          }
          requestsByUser[userId].requests.push(request)
        })
        setPendingRequests(Object.values(requestsByUser))
      }
    } catch (error) {
      console.error("Error fetching pending requests:", error)
      toast.error("Failed to load photo access requests")
    } finally {
      setIsLoadingRequests(false)
    }
  }

  // Handle approval of all pending requests from a specific requester.
  // Note: The first parameter here is the requester’s ID.
  const handleApproveAllRequests = async (requesterId, requests) => {
    setIsProcessingApproval(true)
    try {
      const results = await Promise.allSettled(
        requests.map((request) =>
          apiService.put(`/users/photos/permissions/${request._id}`, { status: "approved" }),
        ),
      )
      const successCount = results.filter(
        (result) => result.status === "fulfilled" && result.value.success,
      ).length

      if (successCount === requests.length) {
        toast.success(`Approved all photo requests from this user`)
      } else if (successCount > 0) {
        toast.success(`Approved ${successCount} out of ${requests.length} photo requests`)
      } else {
        toast.error("Failed to approve photo requests")
      }
      // Send a message to the requester if sendMessage is available.
      if (sendMessage) {
        // Using requesterId here as the recipient of the approval message.
        await sendMessage(requesterId, "text", `I've approved your request to view my private photos.`)
      }
      fetchPendingRequests()
    } catch (error) {
      console.error("Error approving requests:", error)
      toast.error("Failed to approve photo requests")
    } finally {
      setIsProcessingApproval(false)
    }
  }

  // Handle rejection of all pending requests from a specific requester.
  const handleRejectAllRequests = async (requesterId, requests) => {
    setIsProcessingApproval(true)
    try {
      const results = await Promise.allSettled(
        requests.map((request) =>
          apiService.put(`/users/photos/permissions/${request._id}`, { status: "rejected" }),
        ),
      )
      const successCount = results.filter(
        (result) => result.status === "fulfilled" && result.value.success,
      ).length

      if (successCount === requests.length) {
        toast.success(`Rejected all photo requests from this user`)
      } else if (successCount > 0) {
        toast.success(`Rejected ${successCount} out of ${requests.length} photo requests`)
      } else {
        toast.error("Failed to reject photo requests")
      }
      fetchPendingRequests()
    } catch (error) {
      console.error("Error rejecting requests:", error)
      toast.error("Failed to reject photo requests")
    } finally {
      setIsProcessingApproval(false)
    }
  }

  // Handle requesting access for an individual photo
  const handleRequestAccess = async (photoId, e) => {
    if (e) e.stopPropagation()
    if (!profileUser || !photoId) return
    setLoadingPermissions((prev) => ({ ...prev, [photoId]: true }))
    try {
      const response = await apiService.post(`/users/photos/${photoId}/request`, {
        userId: profileUser._id,
      })
      if (response.success) {
        setPermissionStatus((prev) => ({ ...prev, [photoId]: "pending" }))
        toast.success("Photo access requested")
      } else if (response.message && response.message.includes("already exists")) {
        setPermissionStatus((prev) => ({ ...prev, [photoId]: "pending" }))
        toast.info("Access request already sent for this photo")
      } else {
        throw new Error(response.error || "Failed to request access")
      }
    } catch (error) {
      console.error("Error requesting photo access:", error)
      if (error.message && error.message.includes("already exists")) {
        setPermissionStatus((prev) => ({ ...prev, [photoId]: "pending" }))
        toast.info("Access request already sent for this photo")
      } else {
        toast.error(error.message || "Failed to request photo access")
      }
    } finally {
      setLoadingPermissions((prev) => ({ ...prev, [photoId]: false }))
      fetchPhotoPermissions()
    }
  }

  // Fetch photo permissions for the profile
  const fetchPhotoPermissions = async () => {
    if (!id) return
    try {
      const response = await apiService.get(`/users/${id}/photo-permissions`)
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
    setPhotoLoadError((prev) => ({ ...prev, [photoId]: true }))
  }, [])

  // Navigate back to the dashboard
  const handleBack = () => {
    navigate("/dashboard")
  }

  // Toggle like/unlike for the profile user
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

  // Handle opening the embedded chat
  const handleMessage = () => {
    setIsChatInitiating(true)
    // Simply open the chat dialog after a short delay
    setTimeout(() => {
      setShowChat(true)
      setIsChatInitiating(false)
    }, 500)
  }

  const handleCloseChat = () => {
    setShowChat(false)
  }

  const handleViewStories = () => {
    setShowStories(true)
  }

  const handleCloseStories = () => {
    setShowStories(false)
  }

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

  // Calculate compatibility score between current user and profile user
  const calculateCompatibility = () => {
    if (!profileUser || !profileUser.details || !currentUser || !currentUser.details) return 0
    let score = 0
    if (profileUser.details.location === currentUser.details.location) score += 25
    const ageDiff = Math.abs((profileUser.details.age || 0) - (currentUser.details.age || 0))
    if (ageDiff <= 5) score += 25
    else if (ageDiff <= 10) score += 15
    else score += 5
    const profileInterests = profileUser.details?.interests || []
    const userInterests = currentUser.details?.interests || []
    const commonInterests = profileInterests.filter((i) => userInterests.includes(i))
    score += Math.min(50, commonInterests.length * 10)
    return Math.min(100, score)
  }

  if (loading) {
    return (
      <div className="loading-container">
        <Spinner />
        <p className="loading-text">Loading profile...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error Loading Profile</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={handleBack}>
          Return to Dashboard
        </button>
      </div>
    )
  }

  if (!profileUser) {
    return (
      <div className="not-found-container">
        <h3>User Not Found</h3>
        <p>The user you're looking for doesn't exist or has been removed.</p>
        <button className="btn btn-primary" onClick={handleBack}>
          Return to Dashboard
        </button>
      </div>
    )
  }

  const compatibility = calculateCompatibility()
  const commonInterests =
    profileUser.details?.interests?.filter((interest) =>
      currentUser.details?.interests?.includes(interest),
    ) || []

  // Handle requesting access to all private photos at once
  const handleRequestAccessToAllPhotos = async () => {
    if (!profileUser || !profileUser.photos) return
    const privatePhotos = profileUser.photos.filter(
      (photo) =>
        photo.isPrivate &&
        (!permissionStatus[photo._id] || permissionStatus[photo._id] !== "approved"),
    )
    if (privatePhotos.length === 0) {
      toast.info("No private photos to request access to")
      return
    }
    setIsRequestingAll(true)
    try {
      const results = await Promise.allSettled(
        privatePhotos.map((photo) =>
          apiService.post(`/users/photos/${photo._id}/request`, { userId: profileUser._id }),
        ),
      )
      const successCount = results.filter(
        (result) => result.status === "fulfilled" && result.value.success,
      ).length
      const pendingCount = results.filter(
        (result) =>
          result.status === "fulfilled" &&
          result.value.message &&
          result.value.message.includes("already exists"),
      ).length
      const newPermissionStatus = { ...permissionStatus }
      privatePhotos.forEach((photo) => {
        newPermissionStatus[photo._id] = "pending"
      })
      setPermissionStatus(newPermissionStatus)
      if (successCount > 0 && pendingCount > 0) {
        toast.success(`Requested access to ${successCount} photos. ${pendingCount} already pending.`)
      } else if (successCount > 0) {
        toast.success(`Successfully requested access to ${successCount} photos`)
      } else if (pendingCount > 0) {
        toast.info("Access requests already sent for all photos")
      }
      fetchPhotoPermissions()
    } catch (error) {
      console.error("Error requesting photo access:", error)
      toast.error("Failed to request access to some photos")
    } finally {
      setIsRequestingAll(false)
    }
  }

  const hasPendingRequestFromUser = pendingRequests.some((item) => item.user._id === profileUser._id)
  const currentUserRequests = pendingRequests.find((item) => item.user._id === profileUser._id)

  return (
    <div className="modern-user-profile" ref={profileRef}>
      <div className="container profile-content">
        <button className="back-button" onClick={handleBack}>
          <FaArrowLeft /> Back to Discover
        </button>

        {/* Pending requests notification */}
        {!isOwnProfile && hasPendingRequestFromUser && currentUserRequests && (
          <div className="pending-requests-notification">
            <div className="notification-content">
              <FaEye className="notification-icon" />
              <div className="notification-text">
                <p>
                  <strong>{profileUser.nickname}</strong> has requested access to {currentUserRequests.requests.length}{" "}
                  of your private photos
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
          {/* Photos & Stories Section */}
          <div className="profile-photos-section">
            {userStories && userStories.length > 0 && (
              <div className="profile-stories">
                <StoryThumbnail
                  user={profileUser}
                  hasUnviewedStories={hasUnviewedStories(profileUser._id)}
                  onClick={handleViewStories}
                />
              </div>
            )}

            {profileUser.photos && profileUser.photos.length > 0 ? (
              <div className="photo-gallery-container">
                <div className="gallery-photo">
                  {profileUser.photos[activePhotoIndex].isPrivate &&
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
                    </div>
                  ) : (
                    <img
                      src={normalizePhotoUrl(profileUser.photos[activePhotoIndex].url) || "/placeholder.svg"}
                      alt={profileUser.nickname}
                      onError={() => handleImageError(profileUser.photos[activePhotoIndex]._id)}
                      style={{ display: photoLoadError[profileUser.photos[activePhotoIndex]._id] ? "none" : "block" }}
                    />
                  )}
                  {photoLoadError[profileUser.photos[activePhotoIndex]._id] && (
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
                    className={`btn profile-action-btn ${isUserLiked(profileUser._id) ? "liked" : ""}`}
                    onClick={handleLike}
                    disabled={isLiking}
                  >
                    {isLiking ? <FaSpinner className="spinner-icon" /> : <FaHeart />}
                    <span>{isUserLiked(profileUser._id) ? "Liked" : "Like"}</span>
                  </button>
                  <button
                    className="btn btn-primary profile-action-btn"
                    onClick={handleMessage}
                    disabled={isChatInitiating}
                  >
                    {isChatInitiating ? <FaSpinner className="spinner-icon" /> : <FaComment />}
                    <span>Message</span>
                  </button>

                  {profileUser.photos &&
                    profileUser.photos.some(
                      (photo) =>
                        photo.isPrivate &&
                        (!permissionStatus[photo._id] || permissionStatus[photo._id] !== "approved"),
                    ) && (
                      <button
                        className="btn btn-secondary profile-action-btn"
                        onClick={handleRequestAccessToAllPhotos}
                        disabled={isRequestingAll}
                      >
                        {isRequestingAll ? <FaSpinner className="spinner-icon" /> : <FaLock />}
                        <span>Request All Photos</span>
                      </button>
                    )}
                </>
              )}

              <div className="more-actions-dropdown">
                <button className="btn btn-subtle" onClick={() => setShowActions(!showActions)}>
                  <FaEllipsisH />
                </button>
                {showActions && (
                  <div className="actions-dropdown">
                    <button className="dropdown-item">
                      <FaFlag /> Report User
                    </button>
                    <button className="dropdown-item">
                      <FaBan /> Block User
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Profile Details Section */}
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

            {/* Pending photo access requests (only if viewing own profile) */}
            {isOwnProfile && pendingRequests.length > 0 && (
              <div className="pending-requests-section">
                <h2>Photo Access Requests</h2>
                <div className="requests-list">
                  {pendingRequests.map((item) => (
                    <div key={item.user._id} className="request-item">
                      <div className="request-user-info">
                        <div className="request-user-photo">
                          {item.user.photos && item.user.photos.length > 0 ? (
                            <img
                              src={normalizePhotoUrl(item.user.photos[0].url) || "/placeholder.svg"}
                              alt={item.user.nickname}
                              onError={(e) => {
                                e.target.onerror = null
                                e.target.src = "/placeholder.svg"
                              }}
                            />
                          ) : (
                            <FaUserAlt />
                          )}
                        </div>
                        <div className="request-user-details">
                          <h4>{item.user.nickname}</h4>
                          <p>Requested access to {item.requests.length} photos</p>
                        </div>
                      </div>
                      <div className="request-actions">
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleApproveAllRequests(item.user._id, item.requests)}
                          disabled={isProcessingApproval}
                        >
                          {isProcessingApproval ? <FaSpinner className="spinner-icon" /> : <FaCheck />} Approve
                        </button>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => handleRejectAllRequests(item.user._id, item.requests)}
                          disabled={isProcessingApproval}
                        >
                          {isProcessingApproval ? <FaSpinner className="spinner-icon" /> : <FaTimes />} Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                        strokeDashoffset={283 - (283 * calculateCompatibility()) / 100}
                      />
                    </svg>
                    <div className="score-value">{calculateCompatibility()}%</div>
                  </div>
                  <div className="compatibility-details">
                    <div className="compatibility-factor">
                      <span>Location</span>
                      <div className="factor-bar">
                        <div
                          className="factor-fill"
                          style={{
                            width: profileUser.details?.location === currentUser.details?.location ? "100%" : "30%",
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
                              Math.abs((profileUser.details?.age || 0) - (currentUser.details?.age || 0)) <= 5
                                ? "90%"
                                : Math.abs((profileUser.details?.age || 0) - (currentUser.details?.age || 0)) <= 10
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

            {profileUser?.details?.iAm && (
              <div className="profile-section">
                <h4>I am a</h4>
                <p>{profileUser.details.iAm}</p>
              </div>
            )}

            {profileUser?.details?.lookingFor?.length > 0 && (
              <div className="profile-section">
                <h4>Looking for</h4>
                <div className="interests-tags">
                  {profileUser.details.lookingFor.map((item) => (
                    <span key={item} className="interest-tag">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profileUser?.details?.intoTags?.length > 0 && (
              <div className="profile-section">
                <h4>I'm into</h4>
                <div className="interests-tags">
                  {profileUser.details.intoTags.map((tag) => (
                    <span key={tag} className="interest-tag tag-purple">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profileUser?.details?.turnOns?.length > 0 && (
              <div className="profile-section">
                <h4>It turns me on</h4>
                <div className="interests-tags">
                  {profileUser.details.turnOns.map((tag) => (
                    <span key={tag} className="interest-tag tag-pink">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {commonInterests.length > 0 && !isOwnProfile && (
              <div className="profile-section">
                <h2>Common Interests</h2>
                <div className="common-interests">
                  {commonInterests.map((interest) => (
                    <div key={interest} className="common-interest-item">
                      <FaCheck />
                      <span>{interest}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Embedded Chat */}
        {showChat && (
          <>
            <div className="chat-overlay" onClick={() => setShowChat(false)}></div>
            <EmbeddedChat recipient={profileUser} isOpen={showChat} onClose={() => setShowChat(false)} />
          </>
        )}

        {/* Stories Viewer */}
        {showStories && <StoriesViewer userId={profileUser._id} onClose={handleCloseStories} />}
      </div>
    </div>
  )
}

export default UserProfile

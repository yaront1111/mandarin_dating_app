"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  memo,
} from "react";
import { Link } from "react-router-dom";
import {
  FaHeart,
  FaComment,
  FaVideo,
  FaLock,
  FaUnlock,
  FaTrash,
  FaStar,
  FaSearch,
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaRegClock,
  FaCalendarAlt,
  FaUserAlt,
  FaTrophy,
  FaFlag,
  FaBan,
  FaSpinner,
  FaEye,
  FaCheck,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { FixedSizeGrid, FixedSizeList } from "react-window";
import InfiniteLoader from "react-window-infinite-loader";
import AutoSizer from "react-virtualized-auto-sizer";
import debounce from "lodash/debounce";

import { useAuth } from "../context/AuthContext";
import { useUser } from "../context/UserContext";
import { useChat } from "../context/ChatContext";
import { useStories } from "../context/StoriesContext";
import apiService from "@services/apiService.jsx";

// Utility to normalize photo URLs
import { normalizePhotoUrl } from "../utils/index.js";

// ---------------------------------------------------------------------------
// Constants for Virtualized Layouts
// ---------------------------------------------------------------------------
const GRID_COLUMN_COUNT = 3;
const CARD_WIDTH = 300;
const CARD_HEIGHT = 350;
const LIST_ITEM_HEIGHT = 120;

// ---------------------------------------------------------------------------
// Custom Hooks
// ---------------------------------------------------------------------------
/**
 * useDebounce: Returns a debounced value that updates after a given delay.
 */
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

/**
 * useOnClickOutside: Triggers a callback when a click occurs outside the referenced element.
 */
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      handler(event);
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}

/**
 * useEscapeKey: Triggers a callback when the Escape key is pressed.
 */
function useEscapeKey(handler) {
  useEffect(() => {
    const listener = (event) => {
      if (event.key === "Escape") handler(event);
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [handler]);
}

// ---------------------------------------------------------------------------
// LazyImage Component
// ---------------------------------------------------------------------------
/**
 * LazyImage: Loads an image only when it enters the viewport.
 */
const LazyImage = memo(({ src, alt, className, placeholder = "/placeholder.svg" }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef(null);

  const formatSrc = useCallback(
    (url) => (url ? normalizePhotoUrl(url) : placeholder),
    [placeholder],
  );
  const formattedSrc = formatSrc(src);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && imgRef.current) {
          imgRef.current.src = formattedSrc;
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    if (imgRef.current) observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [formattedSrc]);

  return (
    <div className={`lazy-image-container ${className}`}>
      {(!loaded || error) && (
        <img
          src={placeholder}
          alt={`${alt} placeholder`}
          className={`placeholder-image ${className}`}
        />
      )}
      <img
        ref={imgRef}
        src={placeholder}
        alt={alt}
        className={`${className} ${loaded ? "visible" : "hidden"}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// UserCard Component
// ---------------------------------------------------------------------------
/**
 * UserCard: Displays user profile information in grid or list layout.
 */
export const UserCard = memo(
  ({ user, onMessageClick, onVideoClick, onLikeClick, layout = "grid", showActions = true }) => {
    const [isHovered, setIsHovered] = useState(false);
    const { user: currentUser } = useAuth();
    const { isUserLiked } = useUser();
    const isCurrentUser = currentUser && user && currentUser._id === user._id;
    const liked = isUserLiked(user._id);

    const formatLastActive = useCallback((lastActive) => {
      if (!lastActive) return "Unknown";
      const lastDate = new Date(lastActive);
      const now = new Date();
      const diffMins = Math.floor((now - lastDate) / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
      return lastDate.toLocaleDateString();
    }, []);

    const getProfilePhoto = useCallback(() => {
      if (user.photos && user.photos.length > 0) return user.photos[0].url;
      return "/placeholder.svg";
    }, [user.photos]);

    const handleMessageClick = useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        onMessageClick && onMessageClick(user);
      },
      [onMessageClick, user],
    );
    const handleVideoClick = useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        onVideoClick && onVideoClick(user);
      },
      [onVideoClick, user],
    );
    const handleLikeClick = useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        onLikeClick && onLikeClick(user);
      },
      [onLikeClick, user],
    );

    const userDetails = useMemo(() => {
      const parts = [];
      if (user.details?.age) parts.push(`${user.details.age}`);
      if (user.details?.gender) parts.push(user.details.gender);
      if (user.details?.location) parts.push(user.details.location);
      return parts.join(" • ");
    }, [user.details]);

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
              <LazyImage src={getProfilePhoto()} alt={`${user.nickname}'s profile`} className="user-card-photo" />
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
                <button onClick={handleMessageClick} className="action-btn message-btn" aria-label={`Message ${user.nickname}`}>
                  <FaComment />
                </button>
                <button onClick={handleVideoClick} className="action-btn video-btn" aria-label={`Video call ${user.nickname}`}>
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
      );
    }

    // List layout rendering
    return (
      <div
        className="user-list-item"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={`${user.nickname}'s profile item`}
      >
        <Link to={`/profile/${user._id}`} className="user-list-link">
          <div className="user-list-photo-container">
            <LazyImage src={getProfilePhoto()} alt={`${user.nickname}'s profile`} className="user-list-photo" />
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
            <button onClick={handleMessageClick} className="action-btn message-btn" aria-label={`Message ${user.nickname}`}>
              <FaComment />
            </button>
            <button onClick={handleVideoClick} className="action-btn video-btn" aria-label={`Video call ${user.nickname}`}>
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
    );
  },
);

// ---------------------------------------------------------------------------
// UserPhotoGallery Component
// ---------------------------------------------------------------------------
/**
 * UserPhotoGallery: Displays a grid of user photos with upload functionality.
 */
export const UserPhotoGallery = ({ userId, editable = false, onPhotoClick }) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState({});
  const [loadingPermissions, setLoadingPermissions] = useState({});
  const fileInputRef = useRef(null);
  const { user: currentUser } = useAuth();
  const isCurrentUser = currentUser && userId === currentUser._id;

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get(`/users/${userId}`);
      if (response.success && response.data.user) {
        setPhotos(response.data.user.photos || []);
      } else {
        throw new Error(response.error || "Failed to fetch photos");
      }
    } catch (err) {
      setError(err.message || "Failed to fetch photos");
      toast.error(err.message || "Failed to fetch photos");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload a JPEG, PNG, or GIF image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File is too large. Maximum size is 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewFile({ file, preview: ev.target.result });
    };
    reader.readAsDataURL(file);
  }, []);

  const handleCancelUpload = useCallback(() => {
    setPreviewFile(null);
    if (fileInputRef.current) fileInputRef.current.value = null;
  }, []);

  const handlePhotoUpload = useCallback(async (isPrivate = false) => {
    if (!previewFile) return;
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const formData = new FormData();
      formData.append("photo", previewFile.file);
      formData.append("isPrivate", isPrivate);
      const response = await apiService.upload("/users/photos", formData, (progress) => {
        setUploadProgress(progress);
      });
      if (response.success) {
        toast.success(`Photo uploaded successfully${isPrivate ? " (Private)" : ""}!`);
        await fetchPhotos();
        setPreviewFile(null);
      } else {
        throw new Error(response.error || "Failed to upload photo");
      }
    } catch (err) {
      setError(err.message || "Failed to upload photo");
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  }, [previewFile, fetchPhotos]);

  // ---------------------------------------------------------------------------
  // Photo Permission
  // ---------------------------------------------------------------------------
  const fetchPhotoPermissions = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await apiService.get(`/users/${userId}/photo-permissions`);
      if (response.success) {
        const statusMap = {};
        response.data.forEach((permission) => {
          statusMap[permission.photo] = permission.status;
        });
        setPermissionStatus(statusMap);
      } else {
        console.error("Error fetching permissions:", response.error);
      }
    } catch (error) {
      console.error("Error loading photo permissions:", error);
    }
  }, [userId]);

  const handleRequestAccess = useCallback(
    async (photoId, e) => {
      if (e) e.stopPropagation();
      if (!photoId) return;
      setLoadingPermissions((prev) => ({ ...prev, [photoId]: true }));
      try {
        const response = await apiService.post(`/users/photos/${photoId}/request`, { userId });
        if (response.success) {
          setPermissionStatus((prev) => ({ ...prev, [photoId]: "pending" }));
          toast.success("Photo access requested");
        } else if (response.message && response.message.includes("already exists")) {
          setPermissionStatus((prev) => ({ ...prev, [photoId]: "pending" }));
          toast.info("Access request already sent for this photo");
        } else {
          throw new Error(response.error || "Failed to request access");
        }
      } catch (error) {
        if (error.message && error.message.includes("already exists")) {
          setPermissionStatus((prev) => ({ ...prev, [photoId]: "pending" }));
          toast.info("Access request already sent for this photo");
        } else {
          toast.error(error.message || "Failed to request photo access");
        }
      } finally {
        setLoadingPermissions((prev) => ({ ...prev, [photoId]: false }));
        fetchPhotoPermissions();
      }
    },
    [userId, fetchPhotoPermissions],
  );

  if (loading && photos.length === 0) {
    return <div className="loading-spinner">Loading photos...</div>;
  }
  if (error && photos.length === 0) {
    return <div className="error-message">Error: {error}</div>;
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
          {editable && (
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
        <div className="photo-grid">
          {photos.map((photo, index) => (
            <div key={photo._id} className="photo-item">
              <div
                className="photo-container"
                onClick={() => onPhotoClick && onPhotoClick(photo)}
                role="button"
                tabIndex={0}
                aria-label={`Photo ${index + 1}${photo.isPrivate ? " (Private)" : ""}`}
              >
                {photo.isPrivate &&
                (!permissionStatus[photo._id] || permissionStatus[photo._id] !== "approved") ? (
                  <div className="private-photo-overlay">
                    <div className="overlay-content">
                      <span className="lock-icon">
                        <FaLock />
                      </span>
                      <p>Private Photo</p>
                      {permissionStatus[photo._id] === "pending" && (
                        <p className="permission-status pending">Request Pending</p>
                      )}
                      {permissionStatus[photo._id] === "rejected" && (
                        <p className="permission-status rejected">Access Denied</p>
                      )}
                      {!permissionStatus[photo._id] && (
                        <button
                          onClick={(e) => handleRequestAccess(photo._id, e)}
                          disabled={loadingPermissions[photo._id]}
                          className="btn request-access-btn"
                        >
                          {loadingPermissions[photo._id] ? (
                            <FaSpinner className="spinner-icon" />
                          ) : (
                            "Request Access"
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <LazyImage
                    src={photo.url || "/placeholder.svg"}
                    alt={`User photo ${index + 1}`}
                    className="photo-image"
                    placeholder="/placeholder.svg"
                    onError={() => handleImageError(photo._id)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editable && photos.length < 10 && !previewFile && (
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
    </div>
  );
};

// ---------------------------------------------------------------------------
// UserPhotoViewer Component
// ---------------------------------------------------------------------------
/**
 * UserPhotoViewer: Displays a full-size photo with privacy overlay if needed.
 */
export const UserPhotoViewer = ({ photo, userId, onClose, onNext, onPrevious, isPrivate, hasAccess }) => {
  const [requestingAccess, setRequestingAccess] = useState(false);
  const { user } = useAuth();
  const isCurrentUser = user && userId === user._id;

  const handleRequestAccess = async () => {
    if (!user || isCurrentUser) return;
    setRequestingAccess(true);
    try {
      const response = await apiService.post(`/users/photos/${photo._id}/request`, { userId });
      if (response.success) {
        toast.success("Access requested. The user will be notified.");
      } else {
        throw new Error(response.error || "Failed to request access");
      }
    } catch (err) {
      toast.error(err.message || "Failed to request access");
    } finally {
      setRequestingAccess(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onNext();
      else if (e.key === "ArrowLeft") onPrevious();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrevious]);

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
                <FaChevronLeft />
              </button>
              <button onClick={onNext} className="nav-btn next-btn" aria-label="Next photo">
                <FaChevronRight />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UserList Component with Virtualization
// ---------------------------------------------------------------------------
/**
 * UserList: Displays a list or grid of users using virtualization.
 */
export const UserList = memo(
  ({ users, onUserClick, onVideoClick, onLikeClick, loading, error, layout = "grid", hasMore = false, loadMore = () => {}, totalCount = 0 }) => {
    const isItemLoaded = useCallback((index) => !hasMore || index < users.length, [hasMore, users.length]);

    if (loading && users.length === 0) {
      return <div className="loading-spinner">Loading users...</div>;
    }
    if (error) {
      return <div className="error-message">Error: {error}</div>;
    }
    if (!users || users.length === 0) {
      return <div className="no-users">No users found</div>;
    }

    if (layout === "grid") {
      const rowCount = Math.ceil(totalCount / GRID_COLUMN_COUNT);
      return (
        <div className="user-grid-container">
          <AutoSizer>
            {({ height, width }) => (
              <InfiniteLoader isItemLoaded={isItemLoaded} itemCount={totalCount} loadMoreItems={loadMore}>
                {({ onItemsRendered, ref }) => {
                  const newItemsRendered = ({ visibleRowStartIndex, visibleRowStopIndex, visibleColumnStartIndex, visibleColumnStopIndex }) => {
                    const startIndex = visibleRowStartIndex * GRID_COLUMN_COUNT + visibleColumnStartIndex;
                    const stopIndex = visibleRowStopIndex * GRID_COLUMN_COUNT + visibleColumnStopIndex;
                    onItemsRendered({
                      overscanStartIndex: Math.max(0, startIndex - GRID_COLUMN_COUNT),
                      overscanStopIndex: Math.min(totalCount - 1, stopIndex + GRID_COLUMN_COUNT),
                      visibleStartIndex: startIndex,
                      visibleStopIndex: stopIndex,
                    });
                  };
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
                        const index = rowIndex * GRID_COLUMN_COUNT + columnIndex;
                        if (index >= users.length) {
                          return loading ? (
                            <div style={style} className="user-card-placeholder">
                              <div className="loading-pulse"></div>
                            </div>
                          ) : null;
                        }
                        const user = users[index];
                        return (
                          <div style={style}>
                            <UserCard user={user} onMessageClick={onUserClick} onVideoClick={onVideoClick} onLikeClick={onLikeClick} layout="grid" />
                          </div>
                        );
                      }}
                    </FixedSizeGrid>
                  );
                }}
              </InfiniteLoader>
            )}
          </AutoSizer>
        </div>
      );
    }

    // List layout
    return (
      <div className="user-list-container">
        <AutoSizer>
          {({ height, width }) => (
            <InfiniteLoader isItemLoaded={isItemLoaded} itemCount={totalCount} loadMoreItems={loadMore}>
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
                      return loading ? (
                        <div style={style} className="user-list-placeholder">
                          <div className="loading-pulse"></div>
                        </div>
                      ) : null;
                    }
                    const user = users[index];
                    return (
                      <div style={style}>
                        <UserCard user={user} onMessageClick={onUserClick} onVideoClick={onVideoClick} onLikeClick={onLikeClick} layout="list" />
                      </div>
                    );
                  }}
                </FixedSizeList>
              )}
            </InfiniteLoader>
          )}
        </AutoSizer>
      </div>
    );
  }
);

// ---------------------------------------------------------------------------
// UserFilter Component
// ---------------------------------------------------------------------------
/**
 * UserFilter: Provides UI to filter users based on criteria.
 */
export const UserFilter = ({ onFilter, initialFilters = {}, onResetFilters }) => {
  const [filters, setFilters] = useState({
    gender: initialFilters.gender || "",
    minAge: initialFilters.minAge || "",
    maxAge: initialFilters.maxAge || "",
    location: initialFilters.location || "",
    interests: initialFilters.interests || "",
    onlineOnly: initialFilters.onlineOnly || false,
  });
  const debouncedFilters = useDebounce(filters, 500);
  useEffect(() => {
    onFilter && onFilter(debouncedFilters);
  }, [debouncedFilters, onFilter]);
  const handleChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }, []);
  const resetFilters = useCallback(() => {
    const reset = {
      gender: "",
      minAge: "",
      maxAge: "",
      location: "",
      interests: "",
      onlineOnly: false,
    };
    setFilters(reset);
    onResetFilters && onResetFilters();
  }, [onResetFilters]);
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
            <input type="number" id="minAge" name="minAge" min="18" max="120" value={filters.minAge} onChange={handleChange} />
          </div>
          <div className="filter-group">
            <label htmlFor="maxAge">Max Age</label>
            <input type="number" id="maxAge" name="maxAge" min="18" max="120" value={filters.maxAge} onChange={handleChange} />
          </div>
        </div>
        <div className="filter-row">
          <div className="filter-group location-group">
            <label htmlFor="location">Location</label>
            <div className="location-input-wrapper">
              <FaSearch className="search-icon" />
              <input type="text" id="location" name="location" value={filters.location} onChange={handleChange} placeholder="City, Country" />
            </div>
          </div>
          <div className="filter-group interests-group">
            <label htmlFor="interests">Interests</label>
            <input type="text" id="interests" name="interests" value={filters.interests} onChange={handleChange} placeholder="Separate with commas" />
          </div>
        </div>
        <div className="filter-row">
          <div className="filter-group checkbox-group">
            <label htmlFor="onlineOnly" className="checkbox-label">
              <input type="checkbox" id="onlineOnly" name="onlineOnly" checked={filters.onlineOnly} onChange={handleChange} />
              <span className="checkbox-text">Online Users Only</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UserSearch Component
// ---------------------------------------------------------------------------
/**
 * UserSearch: Provides a simple search input for quick user searches.
 */
export const UserSearch = ({ onSearch }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedHandleSearch = useCallback(
    debounce((value) => {
      onSearch && onSearch(value);
    }, 300),
    [onSearch],
  );
  const handleChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedHandleSearch(value);
  };
  return (
    <div className="user-search">
      <div className="search-input-wrapper">
        <FaSearch className="search-icon" />
        <input type="text" placeholder="Search users..." value={searchTerm} onChange={handleChange} className="search-input" />
        {searchTerm && (
          <button className="clear-search" onClick={() => { setSearchTerm(""); debouncedHandleSearch(""); }} aria-label="Clear search">
            &times;
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UserAvatar Component
// ---------------------------------------------------------------------------
/**
 * UserAvatar: Displays a user's profile picture with an optional online status indicator.
 */
export const UserAvatar = ({ user, size = "md", showStatus = true, className = "" }) => {
  const getProfilePhoto = () => {
    if (!user) return "/placeholder.svg";
    if (user.profilePicture) return user.profilePicture;
    if (user.avatar) return user.avatar;
    if (user.photos && user.photos.length > 0) return user.photos[0].url;
    return "/placeholder.svg";
  };

  const sizeClasses = {
    xs: "avatar-xs",
    sm: "avatar-sm",
    md: "avatar-md",
    lg: "avatar-lg",
    xl: "avatar-xl",
  };

  return (
    <div className={`user-avatar ${sizeClasses[size]} ${className}`}>
      <img src={getProfilePhoto() || "/placeholder.svg"} alt={user?.nickname || "User"} className="avatar-img" />
      {showStatus && user?.isOnline && <span className="status-indicator online" aria-label="Online"></span>}
    </div>
  );
};

export default {
  UserCard,
  UserPhotoGallery,
  UserPhotoViewer,
  UserList,
  UserFilter,
  UserSearch,
  UserAvatar,
  LazyImage,
};

"use client"

// client/src/context/UserContext.js
import { createContext, useReducer, useContext, useEffect, useCallback, useRef, useState } from "react"
import { toast } from "react-toastify"
import { FaHeart } from "react-icons/fa"
import apiService from "@services/apiService.jsx"
import { useAuth } from "./AuthContext"

// Create UserContext
const UserContext = createContext()

// User reducer to handle state updates
const userReducer = (state, action) => {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload }
    case "GET_USERS":
      return { ...state, users: action.payload, loading: false }
    case "GET_USER":
      return {
        ...state,
        currentUser: action.payload.user,
        messages: action.payload.messages,
        loading: false,
      }
    case "USER_ONLINE":
      return {
        ...state,
        users: state.users.map((user) =>
          user._id === action.payload.userId ? { ...user, isOnline: true, lastActive: Date.now() } : user,
        ),
        currentUser:
          state.currentUser && state.currentUser._id === action.payload.userId
            ? { ...state.currentUser, isOnline: true, lastActive: Date.now() }
            : state.currentUser,
      }
    case "USER_OFFLINE":
      return {
        ...state,
        users: state.users.map((user) =>
          user._id === action.payload.userId ? { ...user, isOnline: false, lastActive: Date.now() } : user,
        ),
        currentUser:
          state.currentUser && state.currentUser._id === action.payload.userId
            ? { ...state.currentUser, isOnline: false, lastActive: Date.now() }
            : state.currentUser,
      }
    case "UPLOAD_PHOTO":
      return {
        ...state,
        currentUser: state.currentUser
          ? { ...state.currentUser, photos: [...(state.currentUser.photos || []), action.payload] }
          : state.currentUser,
        uploadingPhoto: false,
      }
    case "UPLOADING_PHOTO":
      return { ...state, uploadingPhoto: true }
    case "PHOTO_PERMISSION_REQUESTED":
      return {
        ...state,
        photoPermissions: [...state.photoPermissions, action.payload],
      }
    case "PHOTO_PERMISSION_UPDATED":
      return {
        ...state,
        photoPermissions: state.photoPermissions.map((permission) =>
          permission._id === action.payload._id ? action.payload : permission,
        ),
      }
    case "UPDATE_PROFILE":
      return {
        ...state,
        currentUser: { ...state.currentUser, ...action.payload },
        updatingProfile: false,
      }
    case "UPDATING_PROFILE":
      return { ...state, updatingProfile: true }
    case "USER_ERROR":
      toast.error(action.payload)
      return {
        ...state,
        error: action.payload,
        loading: false,
        uploadingPhoto: false,
        updatingProfile: false,
      }
    case "CLEAR_ERROR":
      return { ...state, error: null }
    default:
      return state
  }
}

// Initial state for the user context
const initialState = {
  users: [],
  currentUser: null,
  messages: [],
  photoPermissions: [],
  loading: false,
  uploadingPhoto: false,
  updatingProfile: false,
  error: null,
}

export const UserProvider = ({ children }) => {
  const [state, dispatch] = useReducer(userReducer, initialState)
  const { user, isAuthenticated } = useAuth()

  // Use a ref to store the debounce timeout ID
  const debounceTimeoutRef = useRef(null)

  // getUsers function: fetches all users and updates state
  const getUsers = useCallback(async () => {
    dispatch({ type: "SET_LOADING", payload: true })
    try {
      const data = await apiService.get("/users")
      if (data.success) {
        dispatch({ type: "GET_USERS", payload: data.data })
        return data.data
      } else {
        throw new Error(data.error || "Failed to fetch users")
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to fetch users"
      dispatch({ type: "USER_ERROR", payload: errorMsg })
      return []
    }
  }, [])

  // Debounced getUsers: cancels previous timeout and calls getUsers after 500ms delay.
  const debouncedGetUsers = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
    debounceTimeoutRef.current = setTimeout(() => {
      if (isAuthenticated && user) {
        getUsers()
      }
    }, 500)
  }, [isAuthenticated, user, getUsers])

  // Initial data loading: call debouncedGetUsers when authenticated user is available.
  useEffect(() => {
    if (isAuthenticated && user) {
      debouncedGetUsers()
    }
    // Cleanup the debounce timeout on unmount.
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)
    }
  }, [isAuthenticated, user, debouncedGetUsers])

  /**
   * Get a specific user profile and message history.
   * @param {string} id - User ID.
   */
  const getUser = useCallback(async (id) => {
    if (!id) return null

    // Validate if id is a valid MongoDB ObjectId
    const isValidId = /^[0-9a-fA-F]{24}$/.test(id)
    if (!isValidId) {
      const errorMsg = "Invalid user ID format"
      dispatch({ type: "USER_ERROR", payload: errorMsg })
      return null
    }

    dispatch({ type: "SET_LOADING", payload: true })
    try {
      const data = await apiService.get(`/users/${id}`)
      if (data.success) {
        dispatch({ type: "GET_USER", payload: data.data })
        return data.data
      } else {
        throw new Error(data.error || "Failed to fetch user")
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to fetch user"
      dispatch({ type: "USER_ERROR", payload: errorMsg })
      return null
    }
  }, [])

  /**
   * Update the current user's profile.
   * @param {Object} profileData - Data to update.
   */
  const updateProfile = useCallback(async (profileData) => {
    dispatch({ type: "UPDATING_PROFILE", payload: true })
    try {
      const data = await apiService.put("/users/profile", profileData)
      if (data.success) {
        dispatch({ type: "UPDATE_PROFILE", payload: data.data })
        toast.success("Profile updated successfully")
        return data.data
      } else {
        throw new Error(data.error || "Failed to update profile")
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to update profile"
      dispatch({ type: "USER_ERROR", payload: errorMsg })
      return null
    }
  }, [])

  /**
   * Upload a photo.
   * @param {File} file - Photo file.
   * @param {boolean} isPrivate - Whether photo is private.
   */
  const uploadPhoto = useCallback(async (file, isPrivate) => {
    dispatch({ type: "UPLOADING_PHOTO", payload: true })
    try {
      const formData = new FormData()
      formData.append("photo", file)
      formData.append("isPrivate", isPrivate)

      // Use apiService.upload which supports progress tracking.
      const data = await apiService.upload("/users/photos", formData, (progress) => {
        // Optional: update UI progress state here
        console.log(`Upload progress: ${progress}%`)
      })

      if (data.success) {
        dispatch({ type: "UPLOAD_PHOTO", payload: data.data })
        toast.success(`${isPrivate ? "Private" : "Public"} photo uploaded successfully`)
        return data.data
      } else {
        throw new Error(data.error || "Failed to upload photo")
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to upload photo"
      dispatch({ type: "USER_ERROR", payload: errorMsg })
      return null
    }
  }, [])

  /**
   * Request permission to view a private photo.
   * @param {string} photoId - ID of the photo.
   * @param {string} userId - ID of the photo owner.
   */
  const requestPhotoPermission = useCallback(async (photoId, userId) => {
    try {
      const data = await apiService.post(`/photos/${photoId}/request`, { userId })
      if (data.success) {
        dispatch({ type: "PHOTO_PERMISSION_REQUESTED", payload: data.data })
        toast.success("Photo access request sent")
        return data.data
      } else {
        throw new Error(data.error || "Failed to request photo access")
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to request photo access"
      dispatch({ type: "USER_ERROR", payload: errorMsg })
      return null
    }
  }, [])

  /**
   * Update a photo permission request (approve or reject).
   * @param {string} permissionId - Permission request ID.
   * @param {string} status - New status ('approved' or 'rejected').
   */
  const updatePhotoPermission = useCallback(async (permissionId, status) => {
    try {
      const data = await apiService.put(`/photos/permissions/${permissionId}`, { status })
      if (data.success) {
        dispatch({ type: "PHOTO_PERMISSION_UPDATED", payload: data.data })
        toast.success(`Photo access ${status}`)
        return data.data
      } else {
        throw new Error(data.error || `Failed to ${status} photo access`)
      }
    } catch (err) {
      const errorMsg = err.error || err.message || `Failed to ${status} photo access`
      dispatch({ type: "USER_ERROR", payload: errorMsg })
      return null
    }
  }, [])

  /**
   * Refresh user data: refetch current user data and user list.
   * @param {string|null} userId - Optional user ID to refresh.
   */
  const refreshUserData = useCallback(
    async (userId = null) => {
      if (userId) {
        await getUser(userId)
      } else if (state.currentUser) {
        await getUser(state.currentUser._id)
      }
      await getUsers()
    },
    [state.currentUser, getUser, getUsers],
  )

  /**
   * Clear error state.
   */
  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" })
  }, [])

  // This will track liked users and handle like functionality
  const [likedUsers, setLikedUsers] = useState([])
  const [likesLoading, setLikesLoading] = useState(false)

  // Load liked users on mount
  useEffect(() => {
    if (isAuthenticated && user && user._id) {
      getLikedUsers()
    }
  }, [isAuthenticated, user])

  // Get all users liked by current user
  const getLikedUsers = useCallback(async () => {
    if (!user) return

    setLikesLoading(true)
    try {
      // Make sure we have a valid user before making the request
      if (!user._id || typeof user._id !== "string") {
        console.warn("Current user ID is missing or invalid", user)
        setLikedUsers([])
        return
      }

      // Validate if user._id is a valid MongoDB ObjectId
      const isValidId = /^[0-9a-fA-F]{24}$/.test(user._id)
      if (!isValidId) {
        console.warn(`Invalid user ID format: ${user._id}`)
        setLikedUsers([])
        return
      }

      const response = await apiService.get("/users/likes")
      if (response.success) {
        setLikedUsers(response.data || [])
      } else {
        console.error("Error in getLikedUsers:", response.error)
        // Set empty array on error to prevent undefined errors
        setLikedUsers([])
      }
    } catch (err) {
      console.error("Error fetching liked users:", err)
      // Set empty array on error to prevent undefined errors
      setLikedUsers([])
    } finally {
      setLikesLoading(false)
    }
  }, [user])

  // Check if a user is liked
  const isUserLiked = useCallback(
    (userId) => {
      if (!likedUsers || !Array.isArray(likedUsers)) return false
      return likedUsers.some((like) => like && like.recipient === userId)
    },
    [likedUsers],
  )

  // Like a user
  const likeUser = useCallback(
    async (userId, userName) => {
      if (!user || !user._id) return false

      try {
        // Validate userId
        if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
          toast.error("Invalid user ID format")
          return false
        }

        const response = await apiService.post(`/users/${userId}/like`)
        if (response.success) {
          // Add to liked users if not already there
          if (!isUserLiked(userId)) {
            setLikedUsers((prev) => [
              ...prev,
              {
                recipient: userId,
                createdAt: new Date().toISOString(),
              },
            ])
          }

          // Show success notification with heart icon
          toast.success(
            <div className="like-toast">
              <FaHeart className="like-icon pulse" />
              <span>You liked {userName || "this user"}</span>
            </div>,
          )

          // If free user, update remaining likes count
          if (response.likesRemaining !== undefined) {
            toast.info(`You have ${response.likesRemaining} likes remaining today`)
          }

          return true
        } else {
          // Handle case where response is {success: false} with no error message
          // This happens when user tries to like someone they've already liked
          const errorMsg = response.error || "You've already liked this user"
          toast.error(errorMsg)
          return false
        }
      } catch (err) {
        const errorMsg = err.error || err.message || "Failed to like user"
        toast.error(errorMsg)
        return false
      }
    },
    [user, isUserLiked],
  )

  // Unlike a user
  const unlikeUser = useCallback(
    async (userId, userName) => {
      if (!user || !user._id) return false

      try {
        // Validate userId
        if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
          toast.error("Invalid user ID format")
          return false
        }

        const response = await apiService.delete(`/users/${userId}/like`)
        if (response.success) {
          // Remove from liked users
          setLikedUsers((prev) => prev.filter((like) => like.recipient !== userId))

          toast.info(`You unliked ${userName || "this user"}`)
          return true
        } else {
          throw new Error(response.error || "Failed to unlike user")
        }
      } catch (err) {
        const errorMsg = err.error || err.message || "Failed to unlike user"
        toast.error(errorMsg)
        return false
      }
    },
    [user],
  )

  return (
    <UserContext.Provider
      value={{
        users: state.users,
        currentUser: state.currentUser,
        messages: state.messages,
        photoPermissions: state.photoPermissions,
        loading: state.loading,
        uploadingPhoto: state.uploadingPhoto,
        updatingProfile: state.updatingProfile,
        error: state.error,
        getUsers,
        getUser,
        updateProfile,
        uploadPhoto,
        requestPhotoPermission,
        updatePhotoPermission,
        refreshUserData,
        clearError,
        likedUsers,
        likesLoading,
        isUserLiked,
        likeUser,
        unlikeUser,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

/**
 * Custom hook to access the user context.
 */
export const useUser = () => {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider")
  }
  return context
}

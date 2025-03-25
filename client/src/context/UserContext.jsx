"use client";

import {
  createContext,
  useReducer,
  useContext,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";
import { FaHeart } from "react-icons/fa";
import apiService from "@services/apiService.jsx";
import { useAuth } from "./AuthContext";

// Create UserContext
const UserContext = createContext();

// User reducer to handle state updates
const userReducer = (state, action) => {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "GET_USERS":
      return { ...state, users: action.payload, loading: false };
    case "GET_USER":
      return {
        ...state,
        currentUser: action.payload.user,
        messages: action.payload.messages,
        loading: false,
      };
    case "USER_ONLINE":
      return {
        ...state,
        users: state.users.map((u) =>
          u._id === action.payload.userId
            ? { ...u, isOnline: true, lastActive: Date.now() }
            : u
        ),
        currentUser:
          state.currentUser && state.currentUser._id === action.payload.userId
            ? { ...state.currentUser, isOnline: true, lastActive: Date.now() }
            : state.currentUser,
      };
    case "USER_OFFLINE":
      return {
        ...state,
        users: state.users.map((u) =>
          u._id === action.payload.userId
            ? { ...u, isOnline: false, lastActive: Date.now() }
            : u
        ),
        currentUser:
          state.currentUser && state.currentUser._id === action.payload.userId
            ? { ...state.currentUser, isOnline: false, lastActive: Date.now() }
            : state.currentUser,
      };
    case "UPLOAD_PHOTO":
      return {
        ...state,
        currentUser: state.currentUser
          ? { ...state.currentUser, photos: [...(state.currentUser.photos || []), action.payload] }
          : state.currentUser,
        uploadingPhoto: false,
      };
    case "UPLOADING_PHOTO":
      return { ...state, uploadingPhoto: true };
    case "PHOTO_PERMISSION_REQUESTED":
      return { ...state, photoPermissions: [...state.photoPermissions, action.payload] };
    case "PHOTO_PERMISSION_UPDATED":
      return {
        ...state,
        photoPermissions: state.photoPermissions.map((permission) =>
          permission._id === action.payload._id ? action.payload : permission
        ),
      };
    case "UPDATE_PROFILE":
      return {
        ...state,
        currentUser: { ...state.currentUser, ...action.payload },
        updatingProfile: false,
      };
    case "UPDATING_PROFILE":
      return { ...state, updatingProfile: true };
    case "USER_ERROR":
      toast.error(action.payload);
      return {
        ...state,
        error: action.payload,
        loading: false,
        uploadingPhoto: false,
        updatingProfile: false,
      };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
};

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
};

export const UserProvider = ({ children }) => {
  const [state, dispatch] = useReducer(userReducer, initialState);
  const { user, isAuthenticated } = useAuth();

  // Ref to store the debounce timeout ID for getUsers
  const debounceTimeoutRef = useRef(null);

  // getUsers function: fetches all users and updates state
  const getUsers = useCallback(async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const data = await apiService.get("/users");
      if (data.success) {
        dispatch({ type: "GET_USERS", payload: data.data });
        return data.data;
      } else {
        throw new Error(data.error || "Failed to fetch users");
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to fetch users";
      dispatch({ type: "USER_ERROR", payload: errorMsg });
      return [];
    }
  }, []);

  // Debounced getUsers: delays getUsers call by 500ms
  const debouncedGetUsers = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      if (isAuthenticated && user) {
        getUsers();
      }
    }, 500);
  }, [isAuthenticated, user, getUsers]);

  // Initial data loading when an authenticated user is available
  useEffect(() => {
    if (isAuthenticated && user) {
      debouncedGetUsers();
    }
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [isAuthenticated, user, debouncedGetUsers]);

  /**
   * getUser: Fetches a specific user profile and message history.
   * @param {string} id - User ID.
   */
  const getUser = useCallback(async (id) => {
    if (!id) return null;

    // Validate if id is a valid MongoDB ObjectId
    const isValidId = /^[0-9a-fA-F]{24}$/.test(id);
    if (!isValidId) {
      const errorMsg = "Invalid user ID format";
      dispatch({ type: "USER_ERROR", payload: errorMsg });
      return null;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const data = await apiService.get(`/users/${id}`);
      if (data.success) {
        dispatch({ type: "GET_USER", payload: data.data });
        return data.data;
      } else {
        throw new Error(data.error || "Failed to fetch user");
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to fetch user";
      dispatch({ type: "USER_ERROR", payload: errorMsg });
      return null;
    }
  }, []);

  /**
   * updateProfile: Updates the current user's profile.
   * @param {Object} profileData - Profile data to update.
   */
  const updateProfile = useCallback(async (profileData) => {
    dispatch({ type: "UPDATING_PROFILE", payload: true });
    try {
      const data = await apiService.put("/users/profile", profileData);
      if (data.success) {
        dispatch({ type: "UPDATE_PROFILE", payload: data.data });
        toast.success("Profile updated successfully");
        return data.data;
      } else {
        throw new Error(data.error || "Failed to update profile");
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to update profile";
      dispatch({ type: "USER_ERROR", payload: errorMsg });
      return null;
    }
  }, []);

  /**
   * uploadPhoto: Uploads a photo.
   * @param {File} file - Photo file.
   * @param {boolean} isPrivate - Whether the photo is private.
   */
  const uploadPhoto = useCallback(async (file, isPrivate) => {
    dispatch({ type: "UPLOADING_PHOTO", payload: true });
    try {
      const formData = new FormData();
      formData.append("photo", file);
      formData.append("isPrivate", isPrivate);
      const data = await apiService.upload("/users/photos", formData, (progress) => {
        console.log(`Upload progress: ${progress}%`);
      });
      if (data.success) {
        dispatch({ type: "UPLOAD_PHOTO", payload: data.data });
        toast.success(`${isPrivate ? "Private" : "Public"} photo uploaded successfully`);
        return data.data;
      } else {
        throw new Error(data.error || "Failed to upload photo");
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to upload photo";
      dispatch({ type: "USER_ERROR", payload: errorMsg });
      return null;
    }
  }, []);

  /**
   * requestPhotoPermission: Requests permission to view a private photo.
   * @param {string} photoId - Photo ID.
   * @param {string} userId - Photo owner's user ID.
   */
  const requestPhotoPermission = useCallback(async (photoId, userId) => {
    try {
      const data = await apiService.post(`/photos/${photoId}/request`, { userId });
      if (data.success) {
        dispatch({ type: "PHOTO_PERMISSION_REQUESTED", payload: data.data });
        toast.success("Photo access request sent");
        return data.data;
      } else {
        throw new Error(data.error || "Failed to request photo access");
      }
    } catch (err) {
      const errorMsg = err.error || err.message || "Failed to request photo access";
      dispatch({ type: "USER_ERROR", payload: errorMsg });
      return null;
    }
  }, []);

  /**
   * updatePhotoPermission: Updates a photo permission request.
   * @param {string} permissionId - Permission request ID.
   * @param {string} status - New status ('approved' or 'rejected').
   */
  const updatePhotoPermission = useCallback(async (permissionId, status) => {
    try {
      const data = await apiService.put(`/photos/permissions/${permissionId}`, { status });
      if (data.success) {
        dispatch({ type: "PHOTO_PERMISSION_UPDATED", payload: data.data });
        toast.success(`Photo access ${status}`);
        return data.data;
      } else {
        throw new Error(data.error || `Failed to ${status} photo access`);
      }
    } catch (err) {
      const errorMsg = err.error || err.message || `Failed to ${status} photo access`;
      dispatch({ type: "USER_ERROR", payload: errorMsg });
      return null;
    }
  }, []);

  /**
   * refreshUserData: Refetches current user data and the user list.
   * @param {string|null} userId - Optional user ID.
   */
  const refreshUserData = useCallback(
    async (userId = null) => {
      if (userId) {
        await getUser(userId);
      } else if (state.currentUser) {
        await getUser(state.currentUser._id);
      }
      await getUsers();
    },
    [state.currentUser, getUser, getUsers]
  );

  /**
   * clearErrorState: Clears any error in the context.
   */
  const clearErrorState = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  // ---------------------------------------------------------------------------
  // Liked Users & Like Functionality
  // ---------------------------------------------------------------------------
  const [likedUsers, setLikedUsers] = useState([]);
  const [likesLoading, setLikesLoading] = useState(false);

  // Get all users liked by the current user
  const getLikedUsers = useCallback(async () => {
    if (!user) return;
    setLikesLoading(true);
    try {
      const response = await apiService.get("/users/likes");

      if (response.success && Array.isArray(response.data)) {
        // Transform data if needed to ensure it's in the expected format
        const formattedLikes = response.data.map(like => ({
          recipient: like.recipient, // Ensure this is a string
          sender: like.sender,
          createdAt: like.createdAt || new Date().toISOString()
        }));
        setLikedUsers(formattedLikes);
      } else {
        console.error("Invalid response format:", response);
        setLikedUsers([]);
      }
    } catch (err) {
      console.error("Error fetching liked users:", err);
      setLikedUsers([]);
    } finally {
      setLikesLoading(false);
    }
  }, [user]);

  // Load liked users when an authenticated user is available
  useEffect(() => {
    if (isAuthenticated && user && user._id) {
      getLikedUsers();
    }
  }, [isAuthenticated, user, getLikedUsers]);

  const isUserLiked = useCallback(
    (userId) => {
      if (!likedUsers || !Array.isArray(likedUsers) || likedUsers.length === 0) {
        return false;
      }

      // Try different comparison approaches
      return likedUsers.some((like) => {
        if (!like) return false;

        // Try string comparison
        if (typeof like.recipient === 'string' && like.recipient === userId) {
          return true;
        }

        // Try comparing as string if recipient is an object
        if (like.recipient && like.recipient.toString && like.recipient.toString() === userId) {
          return true;
        }

        // Handle case where recipient might be an object with _id
        if (like.recipient && like.recipient._id &&
            (like.recipient._id === userId || like.recipient._id.toString() === userId)) {
          return true;
        }

        return false;
      });
    },
    [likedUsers]
  );

  // Like a user
  const likeUser = useCallback(
    async (userId, userName) => {
      if (!user || !user._id) return false;
      try {
        if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
          toast.error("Invalid user ID format");
          return false;
        }
        const response = await apiService.post(`/users/${userId}/like`);
        if (response.success) {
          if (!isUserLiked(userId)) {
            setLikedUsers((prev) => [
              ...prev,
              { recipient: userId, createdAt: new Date().toISOString() },
            ]);
          }
          toast.success(
            <div className="like-toast">
              <FaHeart className="like-icon pulse" />
              <span>You liked {userName || "this user"}</span>
            </div>
          );
          if (response.likesRemaining !== undefined) {
            toast.info(`You have ${response.likesRemaining} likes remaining today`);
          }
          return true;
        } else {
          const errorMsg = response.error || "You've already liked this user";
          toast.error(errorMsg);
          return false;
        }
      } catch (err) {
        const errorMsg = err.error || err.message || "Failed to like user";
        toast.error(errorMsg);
        return false;
      }
    },
    [user, isUserLiked]
  );

  // Unlike a user
  const unlikeUser = useCallback(
    async (userId, userName) => {
      if (!user || !user._id) return false;
      try {
        if (!userId || !/^[0-9a-fA-F]{24}$/.test(userId)) {
          toast.error("Invalid user ID format");
          return false;
        }
        const response = await apiService.delete(`/users/${userId}/like`);
        if (response.success) {
          setLikedUsers((prev) => prev.filter((like) => like.recipient !== userId));
          toast.info(`You unliked ${userName || "this user"}`);
          return true;
        } else {
          throw new Error(response.error || "Failed to unlike user");
        }
      } catch (err) {
        const errorMsg = err.error || err.message || "Failed to unlike user";
        toast.error(errorMsg);
        return false;
      }
    },
    [user]
  );

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
        clearError: clearErrorState,
        likedUsers,
        likesLoading,
        isUserLiked,
        likeUser,
        unlikeUser,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

/**
 * Custom hook to access the user context.
 */
export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};


export default UserContext;

"use client";

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { toast } from "react-toastify";
import apiService from "@services/apiService.jsx";
import {
  getToken,
  setToken,
  removeToken,
  isTokenExpired,
} from "../utils/tokenStorage";

// Create AuthContext
const AuthContext = createContext();

// Custom hook for easy access to AuthContext
export const useAuth = () => useContext(AuthContext);

/**
 * AuthProvider component
 * Provides authentication state and helper methods to its children.
 */
export const AuthProvider = ({ children }) => {
  // Local state
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Refs to manage token refresh timers and promises
  const refreshTokenPromiseRef = useRef(null);
  const tokenRefreshTimerRef = useRef(null);
  const authCheckTimeoutRef = useRef(null);
  // Ref to always have the latest version of refreshToken
  const refreshTokenRef = useRef();

  // Clears any error
  const clearError = useCallback(() => setError(null), []);

  /**
   * logout: Clears token, resets user and auth status.
   */
  const logout = useCallback(async () => {
    setLoading(true);
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    try {
      // Use apiService to call logout endpoint
      await apiService.post("/auth/logout");
    } catch (err) {
      console.warn("Logout API call failed:", err);
    } finally {
      removeToken();
      setUser(null);
      setIsAuthenticated(false);
      toast.info("You have been logged out");
      setLoading(false);
    }
  }, []);

  /**
   * refreshToken: Refreshes the authentication token.
   * Returns a promise resolving to the new token.
   */
  const refreshToken = useCallback(() => {
    if (!isAuthenticated && !getToken()) return Promise.resolve(null);
    if (refreshTokenPromiseRef.current) return refreshTokenPromiseRef.current;

    refreshTokenPromiseRef.current = (async () => {
      const token = getToken();
      if (!token) return null;
      try {
        console.log("Refreshing auth token...");
        const response = await apiService.post(
          "/auth/refresh-token",
          { token },
          { headers: { "x-no-cache": "true" }, _isRefreshRequest: true }
        );
        if (response.success && response.token) {
          const newToken = response.token;
          const rememberMe = localStorage.getItem("token") !== null;
          setToken(newToken, rememberMe);
          scheduleTokenRefresh(newToken);
          console.log("Token refreshed successfully");
          return newToken;
        } else {
          throw new Error("Invalid refresh response");
        }
      } catch (err) {
        console.error("Token refresh failed:", err);
        refreshTokenPromiseRef.current = null;
        if (err?.response?.status === 401 || err?.status === 401) {
          logout();
        } else {
          const currentToken = getToken();
          if (currentToken && isTokenExpired(currentToken)) {
            console.log("Token expired, logging out");
            toast.error("Your session has expired. Please log in again.");
            logout();
          }
        }
        return null;
      } finally {
        setTimeout(() => {
          refreshTokenPromiseRef.current = null;
        }, 1000);
      }
    })();

    return refreshTokenPromiseRef.current;
  }, [isAuthenticated, logout]);

  // Update ref with latest refreshToken function
  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  /**
   * scheduleTokenRefresh: Schedules a token refresh five minutes before token expiry.
   * It calls the current refreshToken function stored in refreshTokenRef.
   */
  const scheduleTokenRefresh = useCallback((token) => {
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    try {
      const base64Url = token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      if (payload.exp) {
        const expiresAt = payload.exp * 1000;
        const now = Date.now();
        const timeUntilRefresh = expiresAt - now - 5 * 60 * 1000; // refresh 5 minutes before expiry
        if (timeUntilRefresh > 60000) {
          console.log(
            `Scheduling token refresh in ${Math.round(timeUntilRefresh / 60000)} minute(s)`
          );
          tokenRefreshTimerRef.current = setTimeout(() => {
            refreshTokenRef.current();
          }, timeUntilRefresh);
        } else {
          console.log("Token expires soon, refreshing now");
          refreshTokenRef.current();
        }
      }
    } catch (e) {
      console.error("Error scheduling token refresh:", e);
    }
  }, []);

  /**
   * register: Registers a new user.
   */
  const register = useCallback(async (userData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.post("/auth/register", userData);
      if (response.success) {
        setToken(response.token);
        setUser(response.user);
        setIsAuthenticated(true);
        setLoading(false);
        return true;
      } else {
        setError(response.error || "Registration failed");
        setLoading(false);
        return false;
      }
    } catch (err) {
      console.error("Registration error:", err);
      if (err.response && err.response.data) {
        const errorMessage =
          err.response.data.error ||
          (err.response.data.errors && err.response.data.errors[0].msg) ||
          "Registration failed. Please check your information and try again.";
        setError(errorMessage);
        throw new Error(errorMessage);
      } else {
        const errorMessage =
          "Network error. Please check your connection and try again.";
        setError(errorMessage);
        throw new Error(errorMessage);
      }
    }
  }, []);

  /**
   * verifyEmail: Verifies a user's email.
   */
  const verifyEmail = useCallback(async (token) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.post("/auth/verify-email", { token });
      if (response.success) {
        toast.success("Email verified successfully! You can now log in.");
        return response;
      } else {
        throw new Error(response.error || "Email verification failed");
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Email verification failed";
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * login: Authenticates the user with provided credentials.
   */
  const login = useCallback(
    async (credentials, rememberMe = false) => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiService.post("/auth/login", credentials);
        if (response.success && response.token) {
          setToken(response.token, rememberMe);
          scheduleTokenRefresh(response.token);
          if (response.user) {
            setUser(response.user);
            import("@services/notificationService.jsx").then((module) => {
              const notificationService = module.default;
              notificationService.initialize(response.user.settings?.notifications);
            });
            const welcomeMessage = response.user.nickname
              ? `Welcome back, ${response.user.nickname}!`
              : "Welcome back!";
            toast.success(welcomeMessage);
          } else {
            try {
              const userResponse = await apiService.get("/auth/me");
              if (userResponse.success && userResponse.data) {
                setUser(userResponse.data);
                import("@services/notificationService.jsx").then((module) => {
                  const notificationService = module.default;
                  notificationService.initialize(userResponse.data.settings?.notifications);
                });
                const welcomeMessage = userResponse.data.nickname
                  ? `Welcome back, ${userResponse.data.nickname}!`
                  : "Welcome back!";
                toast.success(welcomeMessage);
              } else {
                toast.success("Welcome back!");
              }
            } catch (userErr) {
              console.error("Error fetching user data:", userErr);
              toast.success("Welcome back!");
            }
          }
          setIsAuthenticated(true);
          return response;
        } else {
          throw new Error(response.error || "Login failed");
        }
      } catch (err) {
        const errorMessage = err.error || err.message || "Login failed";
        setError(errorMessage);
        toast.error(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [scheduleTokenRefresh]
  );

  /**
   * requestPasswordReset: Initiates a password reset.
   */
  const requestPasswordReset = useCallback(async (email) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.post("/auth/forgot-password", { email });
      if (response.success) {
        toast.success("Password reset instructions sent to your email");
        return response;
      } else {
        throw new Error(response.error || "Password reset request failed");
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Password reset request failed";
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * resetPassword: Resets the user's password.
   */
  const resetPassword = useCallback(async (token, newPassword) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.post("/auth/reset-password", {
        token,
        password: newPassword,
      });
      if (response.success) {
        toast.success("Password reset successful! You can now log in with your new password.");
        return response;
      } else {
        throw new Error(response.error || "Password reset failed");
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Password reset failed";
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * changePassword: Changes the user's password.
   */
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiService.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      if (response.success) {
        toast.success("Password changed successfully!");
        return response;
      } else {
        throw new Error(response.error || "Password change failed");
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Password change failed";
      setError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * getCurrentUser: Fetches the current user's profile.
   */
  const getCurrentUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiService.get("/auth/me");
      if (response.success) {
        setUser(response.data);
        setIsAuthenticated(true);
        import("@services/notificationService.jsx").then((module) => {
          const notificationService = module.default;
          notificationService.initialize(response.data.settings?.notifications);
        });
        return response.data;
      } else {
        throw new Error(response.error || "Failed to get user profile");
      }
    } catch (err) {
      console.error("Get current user error:", err);
      setUser(null);
      setIsAuthenticated(false);
      return null;
    } finally {
      setLoading(false);
      setAuthChecked(true);
    }
  }, []);

  // On mount, check authentication status with a safety timeout.
  useEffect(() => {
    if (authCheckTimeoutRef.current) {
      clearTimeout(authCheckTimeoutRef.current);
    }
    authCheckTimeoutRef.current = setTimeout(() => {
      console.warn("Auth check timeout - forcing loading state to false");
      setLoading(false);
      setAuthChecked(true);
    }, 15000);

    const checkAuth = async () => {
      const token = getToken();
      if (token) {
        try {
          if (isTokenExpired(token)) {
            console.log("Token expired, attempting to refresh");
            const newToken = await refreshToken();
            if (!newToken) {
              setUser(null);
              setIsAuthenticated(false);
              removeToken();
              setAuthChecked(true);
              setLoading(false);
              return;
            }
          }
          await getCurrentUser();
        } catch (err) {
          console.error("Auth check error:", err);
          setUser(null);
          setIsAuthenticated(false);
          removeToken();
          setAuthChecked(true);
          setLoading(false);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthChecked(true);
        setLoading(false);
      }
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current);
        authCheckTimeoutRef.current = null;
      }
    };

    checkAuth();

    return () => {
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current);
        authCheckTimeoutRef.current = null;
      }
    };
  }, [getCurrentUser, refreshToken]);

  // Cleanup token refresh timer on unmount
  useEffect(() => {
    return () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
      }
    };
  }, []);

  // Listen for global logout events
  useEffect(() => {
    const handleGlobalLogout = () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
      setUser(null);
      setIsAuthenticated(false);
      removeToken();
    };
    window.addEventListener("authLogout", handleGlobalLogout);
    return () => {
      window.removeEventListener("authLogout", handleGlobalLogout);
    };
  }, []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated,
    authChecked,
    register,
    verifyEmail,
    login,
    logout,
    refreshToken,
    requestPasswordReset,
    resetPassword,
    changePassword,
    getCurrentUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;

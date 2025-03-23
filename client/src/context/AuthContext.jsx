"use client"

import { createContext, useState, useContext, useEffect, useCallback, useRef } from "react"
import { toast } from "react-toastify"
import apiService from "@services/apiService.jsx"
import { getToken, setToken, removeToken, isTokenExpired } from "../utils/tokenStorage"

const AuthContext = createContext()

export const useAuth = () => useContext(AuthContext)

// Authentication-specific API calls
export const authApiService = {
  register: async (userData) => {
    return await apiService.post("/auth/register", userData)
  },
  login: async (credentials) => {
    return await apiService.post("/auth/login", credentials)
  },
  logout: async () => {
    return await apiService.post("/auth/logout")
  },
  verifyEmail: async (token) => {
    return await apiService.post("/auth/verify-email", { token })
  },
  requestPasswordReset: async (email) => {
    return await apiService.post("/auth/forgot-password", { email })
  },
  resetPassword: async (token, password) => {
    return await apiService.post("/auth/reset-password", { token, password })
  },
  changePassword: async (currentPassword, newPassword) => {
    return await apiService.post("/auth/change-password", {
      currentPassword,
      newPassword,
    })
  },
  getCurrentUser: async () => {
    return await apiService.get("/auth/me")
  },
  refreshToken: async (token) => {
    return await apiService.post("/auth/refresh-token", { token })
  },
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  // Refs for refresh token promise and timer
  const refreshTokenPromiseRef = useRef(null)
  const tokenRefreshTimerRef = useRef(null)
  const authCheckTimeoutRef = useRef(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    setLoading(true)
    try {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current)
        tokenRefreshTimerRef.current = null
      }
      try {
        await authApiService.logout()
      } catch (err) {
        console.warn("Logout API call failed:", err)
      }
      removeToken()
      setUser(null)
      setIsAuthenticated(false)
      toast.info("You have been logged out")
    } catch (err) {
      console.error("Logout error:", err)
      removeToken()
      setUser(null)
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const scheduleTokenRefresh = useCallback((token) => {
    if (tokenRefreshTimerRef.current) {
      clearTimeout(tokenRefreshTimerRef.current)
      tokenRefreshTimerRef.current = null
    }
    try {
      const base64Url = token.split(".")[1]
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
      const payload = JSON.parse(atob(base64))
      if (payload.exp) {
        const expiresAt = payload.exp * 1000
        const now = Date.now()
        const timeUntilRefresh = expiresAt - now - 5 * 60 * 1000 // refresh 5 minutes before expiry
        if (timeUntilRefresh > 60000) {
          console.log(`Scheduling token refresh in ${Math.round(timeUntilRefresh / 60000)} minutes`)
          const timer = setTimeout(() => {
            refreshToken()
          }, timeUntilRefresh)
          tokenRefreshTimerRef.current = timer
        } else {
          console.log("Token expires soon, refreshing now")
          refreshToken()
        }
      }
    } catch (e) {
      console.error("Error scheduling token refresh:", e)
    }
  }, [])

  const refreshToken = useCallback(() => {
    if (!isAuthenticated && !getToken()) return Promise.resolve(null)
    if (refreshTokenPromiseRef.current) return refreshTokenPromiseRef.current

    refreshTokenPromiseRef.current = (async () => {
      const token = getToken()
      if (!token) return null
      try {
        console.log("Refreshing auth token...")

        // Use apiService directly instead of authApiService to bypass interceptors
        const response = await apiService.post(
          "/auth/refresh-token",
          { token },
          {
            headers: { "x-no-cache": "true" },
            _isRefreshRequest: true,
          },
        )

        if (response.success && response.token) {
          const newToken = response.token
          const rememberMe = localStorage.getItem("token") !== null
          setToken(newToken, rememberMe)
          scheduleTokenRefresh(newToken)
          console.log("Token refreshed successfully")
          return newToken
        } else {
          throw new Error("Invalid refresh response")
        }
      } catch (err) {
        console.error("Token refresh failed:", err)
        refreshTokenPromiseRef.current = null

        if (err?.response?.status === 401 || err?.status === 401) {
          logout()
        } else {
          const currentToken = getToken()
          if (currentToken && isTokenExpired(currentToken)) {
            console.log("Token expired, logging out")
            toast.error("Your session has expired. Please log in again.")
            logout()
          }
        }
        return null
      } finally {
        setTimeout(() => {
          refreshTokenPromiseRef.current = null
        }, 1000)
      }
    })()

    return refreshTokenPromiseRef.current
  }, [isAuthenticated, logout, scheduleTokenRefresh])

  const register = useCallback(async (userData) => {
    setLoading(true)
    setError(null)

    try {
      const response = await authApiService.register(userData)

      if (response.success) {
        setToken(response.token)
        setUser(response.user)
        setIsAuthenticated(true)
        setLoading(false)
        return true
      } else {
        setError(response.error || "Registration failed")
        setLoading(false)
        return false
      }
    } catch (err) {
      console.error("Registration error:", err)

      // Handle specific validation errors
      if (err.response && err.response.data) {
        if (err.response.data.error) {
          const errorMessage = err.response.data.error
          setError(errorMessage)

          // Throw a more specific error for the component to handle
          throw new Error(errorMessage)
        } else if (err.response.data.errors && err.response.data.errors.length > 0) {
          // If there are multiple errors, show the first one
          const errorMessage = err.response.data.errors[0].msg
          setError(errorMessage)
          throw new Error(errorMessage)
        } else {
          const errorMessage = "Registration failed. Please check your information and try again."
          setError(errorMessage)
          throw new Error(errorMessage)
        }
      } else {
        const errorMessage = "Network error. Please check your connection and try again."
        setError(errorMessage)
        throw new Error(errorMessage)
      }

      setLoading(false)
      return false
    }
  }, [])

  const verifyEmail = useCallback(async (token) => {
    setLoading(true)
    setError(null)
    try {
      const response = await authApiService.verifyEmail(token)
      if (response.success) {
        toast.success("Email verified successfully! You can now log in.")
        return response
      } else {
        throw new Error(response.error || "Email verification failed")
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Email verification failed"
      setError(errorMessage)
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const login = useCallback(
    async (credentials, rememberMe = false) => {
      setLoading(true)
      setError(null)
      try {
        const response = await authApiService.login(credentials)
        if (response.success && response.token) {
          setToken(response.token, rememberMe)
          scheduleTokenRefresh(response.token)
          if (response.user) {
            setUser(response.user)
            import("@services/notificationService.jsx").then((module) => {
              const notificationService = module.default
              if (response.user.settings?.notifications) {
                notificationService.initialize(response.user.settings)
              } else {
                notificationService.initialize()
              }
            })
            const welcomeMessage = response.user.nickname ? `Welcome back, ${response.user.nickname}!` : "Welcome back!"
            toast.success(welcomeMessage)
          } else {
            try {
              const userResponse = await authApiService.getCurrentUser()
              if (userResponse.success && userResponse.data) {
                setUser(userResponse.data)
                import("@services/notificationService.jsx").then((module) => {
                  const notificationService = module.default
                  if (userResponse.data.settings?.notifications) {
                    notificationService.initialize(userResponse.data.settings)
                  } else {
                    notificationService.initialize()
                  }
                })
                const welcomeMessage = userResponse.data.nickname
                  ? `Welcome back, ${userResponse.data.nickname}!`
                  : "Welcome back!"
                toast.success(welcomeMessage)
              } else {
                toast.success("Welcome back!")
              }
            } catch (userErr) {
              console.error("Error fetching user data:", userErr)
              toast.success("Welcome back!")
            }
          }
          setIsAuthenticated(true)
          return response
        } else {
          throw new Error(response.error || "Login failed")
        }
      } catch (err) {
        const errorMessage = err.error || err.message || "Login failed"
        setError(errorMessage)
        toast.error(errorMessage)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [scheduleTokenRefresh],
  )

  const requestPasswordReset = useCallback(async (email) => {
    setLoading(true)
    setError(null)
    try {
      const response = await authApiService.requestPasswordReset(email)
      if (response.success) {
        toast.success("Password reset instructions sent to your email")
        return response
      } else {
        throw new Error(response.error || "Password reset request failed")
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Password reset request failed"
      setError(errorMessage)
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const resetPassword = useCallback(async (token, newPassword) => {
    setLoading(true)
    setError(null)
    try {
      const response = await authApiService.resetPassword(token, newPassword)
      if (response.success) {
        toast.success("Password reset successful! You can now log in with your new password.")
        return response
      } else {
        throw new Error(response.error || "Password reset failed")
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Password reset failed"
      setError(errorMessage)
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    setLoading(true)
    setError(null)
    try {
      const response = await authApiService.changePassword(currentPassword, newPassword)
      if (response.success) {
        toast.success("Password changed successfully!")
        return response
      } else {
        throw new Error(response.error || "Password change failed")
      }
    } catch (err) {
      const errorMessage = err.error || err.message || "Password change failed"
      setError(errorMessage)
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const getCurrentUser = useCallback(async () => {
    setLoading(true)
    try {
      const response = await authApiService.getCurrentUser()
      if (response.success) {
        setUser(response.data)
        setIsAuthenticated(true)
        import("@services/notificationService.jsx").then((module) => {
          const notificationService = module.default
          if (response.data.settings?.notifications) {
            notificationService.initialize(response.data.settings)
          } else {
            notificationService.initialize()
          }
        })
        return response.data
      } else {
        throw new Error(response.error || "Failed to get user profile")
      }
    } catch (err) {
      console.error("Get current user error:", err)
      setUser(null)
      setIsAuthenticated(false)
      return null
    } finally {
      setLoading(false)
      setAuthChecked(true)
    }
  }, [])

  // Check authentication status on mount with safety timeout
  useEffect(() => {
    // Safety timeout to prevent infinite loading
    if (authCheckTimeoutRef.current) {
      clearTimeout(authCheckTimeoutRef.current)
    }

    authCheckTimeoutRef.current = setTimeout(() => {
      console.warn("Auth check timeout - forcing loading state to false")
      setLoading(false)
      setAuthChecked(true)
    }, 15000) // 15-second timeout

    const checkAuth = async () => {
      const token = getToken()
      if (token) {
        try {
          if (isTokenExpired(token)) {
            console.log("Token expired, attempting to refresh")
            const newToken = await refreshToken()
            if (!newToken) {
              setUser(null)
              setIsAuthenticated(false)
              removeToken()
              setAuthChecked(true)
              setLoading(false)
              return
            }
          }
          await getCurrentUser()
        } catch (err) {
          console.error("Auth check error:", err)
          setUser(null)
          setIsAuthenticated(false)
          removeToken()
          setAuthChecked(true)
          setLoading(false)
        }
      } else {
        setUser(null)
        setIsAuthenticated(false)
        setAuthChecked(true)
        setLoading(false)
      }

      // Clear safety timeout
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current)
        authCheckTimeoutRef.current = null
      }
    }

    checkAuth()

    // Clean up timeout on unmount
    return () => {
      if (authCheckTimeoutRef.current) {
        clearTimeout(authCheckTimeoutRef.current)
        authCheckTimeoutRef.current = null
      }
    }
  }, [getCurrentUser, refreshToken])

  // Clean up token refresh timer on unmount
  useEffect(() => {
    return () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current)
      }
    }
  }, [])

  // Listen for auth logout events (e.g., from other parts of the app)
  useEffect(() => {
    const handleLogout = () => {
      if (tokenRefreshTimerRef.current) {
        clearTimeout(tokenRefreshTimerRef.current)
        tokenRefreshTimerRef.current = null
      }
      setUser(null)
      setIsAuthenticated(false)
      removeToken()
    }
    window.addEventListener("authLogout", handleLogout)
    return () => {
      window.removeEventListener("authLogout", handleLogout)
    }
  }, [])

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
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthContext

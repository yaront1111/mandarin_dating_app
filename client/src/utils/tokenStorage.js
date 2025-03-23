// Token storage utility functions

// Get token from storage (checks both sessionStorage and localStorage)
export const getToken = () => {
  return sessionStorage.getItem("token") || localStorage.getItem("token")
}

// Set token in storage
export const setToken = (token, rememberMe = false) => {
  if (!token) return

  // Always store in sessionStorage for the current session
  sessionStorage.setItem("token", token)

  // Also store in localStorage if rememberMe is true
  if (rememberMe) {
    localStorage.setItem("token", token)
  } else {
    localStorage.removeItem("token")
  }
}

// Remove token from all storage
export const removeToken = () => {
  sessionStorage.removeItem("token")
  localStorage.removeItem("token")
}

// Check if token is expired
export const isTokenExpired = (token) => {
  if (!token) return true

  try {
    // Parse token
    const base64Url = token.split(".")[1]
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
    const payload = JSON.parse(atob(base64))

    // Check expiration (with 30-second buffer)
    const expiresAt = payload.exp * 1000
    const now = Date.now()
    return now >= expiresAt - 30000 // 30-second buffer
  } catch (error) {
    console.error("Error parsing JWT token:", error)
    return true
  }
}

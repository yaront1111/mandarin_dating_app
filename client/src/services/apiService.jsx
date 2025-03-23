import axios from "axios"
import { toast } from "react-toastify"
import { getToken, setToken, removeToken, isTokenExpired } from "../utils/tokenStorage"

/**
 * Logger utility with configurable log levels
 */
class Logger {
  constructor(name) {
    this.name = name
    // Use import.meta.env.MODE instead of process.env.NODE_ENV
    this.logLevel = import.meta.env.MODE === "production" ? "error" : "debug"
    this.levels = { debug: 1, info: 2, warn: 3, error: 4 }
  }

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.logLevel]
  }

  prefix(level) {
    return `[${this.name}][${level.toUpperCase()}]`
  }

  debug(...args) {
    if (this.shouldLog("debug")) {
      console.debug(this.prefix("debug"), ...args)
    }
  }

  info(...args) {
    if (this.shouldLog("info")) {
      console.info(this.prefix("info"), ...args)
    }
  }

  warn(...args) {
    if (this.shouldLog("warn")) {
      console.warn(this.prefix("warn"), ...args)
    }
  }

  error(...args) {
    if (this.shouldLog("error")) {
      console.error(this.prefix("error"), ...args)
    }
  }
}

/**
 * Cache implementation for API responses
 */
class ResponseCache {
  constructor(maxSize = 100, ttl = 60000) {
    this.cache = new Map()
    this.maxSize = maxSize // Maximum number of cached responses
    this.ttl = ttl // Time-to-live in milliseconds
    this.logger = new Logger("ResponseCache")
  }

  generateKey(url, params) {
    const sortedParams = params ? JSON.stringify(Object.entries(params).sort()) : ""
    return `${url}:${sortedParams}`
  }

  set(url, params, data) {
    // Only cache successful responses
    if (!data || !data.success) return null
    const key = this.generateKey(url, params)
    const expiresAt = Date.now() + this.ttl
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry (first in Map)
      const oldestKey = this.cache.keys().next().value
      this.cache.delete(oldestKey)
      this.logger.debug(`Cache full, removing oldest entry: ${oldestKey}`)
    }
    this.cache.set(key, { data, expiresAt })
    this.logger.debug(`Cached response for: ${key}`)
    return data
  }

  get(url, params) {
    const key = this.generateKey(url, params)
    const cached = this.cache.get(key)
    if (!cached) {
      this.logger.debug(`Cache miss for: ${key}`)
      return null
    }
    if (cached.expiresAt < Date.now()) {
      this.logger.debug(`Cache expired for: ${key}`)
      this.cache.delete(key)
      return null
    }
    this.logger.debug(`Cache hit for: ${key}`)
    return cached.data
  }

  invalidate(url, params) {
    const key = params ? this.generateKey(url, params) : null
    if (key) {
      this.cache.delete(key)
      this.logger.debug(`Invalidated cache for: ${key}`)
    } else if (url) {
      for (const existingKey of this.cache.keys()) {
        if (existingKey.startsWith(`${url}:`)) {
          this.cache.delete(existingKey)
          this.logger.debug(`Invalidated cache for: ${existingKey}`)
        }
      }
    } else {
      this.cache.clear()
      this.logger.debug("Invalidated entire cache")
    }
  }
}

/**
 * Network state monitoring
 */
class NetworkMonitor {
  constructor(onStatusChange) {
    this.isOnline = navigator.onLine
    this.onStatusChange = onStatusChange
    this.logger = new Logger("NetworkMonitor")
    window.addEventListener("online", this.handleOnline.bind(this))
    window.addEventListener("offline", this.handleOffline.bind(this))
    this.logger.info(`Network monitor initialized. Online: ${this.isOnline}`)
  }

  handleOnline() {
    this.logger.info("Network connection restored")
    this.isOnline = true
    if (this.onStatusChange) this.onStatusChange(true)
  }

  handleOffline() {
    this.logger.warn("Network connection lost")
    this.isOnline = false
    if (this.onStatusChange) this.onStatusChange(false)
  }

  cleanup() {
    window.removeEventListener("online", this.handleOnline.bind(this))
    window.removeEventListener("offline", this.handleOffline.bind(this))
  }
}

/**
 * Request queue for offline operations
 */
class RequestQueue {
  constructor(apiInstance) {
    this.queue = []
    this.apiInstance = apiInstance
    this.isProcessing = false
    this.maxRetries = 3
    this.logger = new Logger("RequestQueue")
    this.loadFromStorage()
  }

  add(request) {
    this.queue.push({
      ...request,
      timestamp: Date.now(),
      retries: 0,
    })
    this.logger.debug(`Added request to queue: ${request.method} ${request.url}`)
    this.saveToStorage()
    return this.queue.length
  }

  loadFromStorage() {
    try {
      const savedQueue = localStorage.getItem("api_request_queue")
      if (savedQueue) {
        this.queue = JSON.parse(savedQueue)
        this.logger.info(`Loaded ${this.queue.length} requests from storage`)
      }
    } catch (err) {
      this.logger.error("Failed to load queue from storage:", err)
      this.queue = []
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem("api_request_queue", JSON.stringify(this.queue))
    } catch (err) {
      this.logger.error("Failed to save queue to storage:", err)
    }
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return
    this.isProcessing = true
    this.logger.info(`Processing queue with ${this.queue.length} requests`)
    const completedIndices = []
    for (let i = 0; i < this.queue.length; i++) {
      const request = this.queue[i]
      try {
        this.logger.debug(`Processing queued request: ${request.method} ${request.url}`)
        await this.apiInstance.request({
          url: request.url,
          method: request.method,
          data: request.data,
          params: request.params,
          headers: request.headers,
        })
        completedIndices.push(i)
        this.logger.debug(`Successfully processed queued request: ${request.method} ${request.url}`)
      } catch (err) {
        request.retries++
        this.logger.warn(
          `Failed to process queued request (attempt ${request.retries}): ${request.method} ${request.url}`,
        )
        if (request.retries >= this.maxRetries) {
          completedIndices.push(i)
          this.logger.error(
            `Giving up on queued request after ${this.maxRetries} attempts: ${request.method} ${request.url}`,
          )
        }
      }
    }
    for (let i = completedIndices.length - 1; i >= 0; i--) {
      this.queue.splice(completedIndices[i], 1)
    }
    this.saveToStorage()
    this.isProcessing = false
    this.logger.info(
      `Queue processing complete. ${completedIndices.length} requests processed, ${this.queue.length} remaining`,
    )
  }
}

/**
 * Enhanced API Service for making HTTP requests with advanced features
 */
class ApiService {
  constructor() {
    this.logger = new Logger("ApiService")
    this.baseURL =
      import.meta.env.VITE_API_URL ||
      (window.location.hostname.includes("localhost") ? "http://localhost:5000/api" : "/api")
    this.logger.info(`Initializing with baseURL: ${this.baseURL}`)

    // Create axios instance
    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeout: 15000,
    })

    // Initialize state and metrics
    this.refreshTokenPromise = null
    this.requestsToRetry = []
    this.pendingRequests = new Map()
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      retries: 0,
      avgResponseTime: 0,
    }

    // Initialize cache using environment variables for size and TTL
    this.cache = new ResponseCache(
      Number.parseInt(import.meta.env.VITE_CACHE_SIZE || "100"),
      Number.parseInt(import.meta.env.VITE_CACHE_TTL || "60000"),
    )

    // Setup request queue for offline operations
    this.requestQueue = new RequestQueue(this.api)

    // Track network state
    this.networkMonitor = new NetworkMonitor(this._handleNetworkStatusChange.bind(this))

    // Setup interceptors
    this._initializeInterceptors()

    // Load authentication token from storage
    this._loadAuthToken()
  }

  _handleNetworkStatusChange(isOnline) {
    if (isOnline) {
      this.logger.info("Network connection restored. Processing request queue...")
      setTimeout(() => this.requestQueue.processQueue(), 1000)
    } else {
      this.logger.warn("Network offline. Requests will be queued.")
    }
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("apiConnectionStatusChange", { detail: { isOnline } }))
    }
  }

  _initializeInterceptors() {
    this.api.interceptors.request.use(this._handleRequest.bind(this), this._handleRequestError.bind(this))
    this.api.interceptors.response.use(this._handleResponse.bind(this), this._handleResponseError.bind(this))
  }

  _handleRequest(config) {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    config.requestId = requestId
    config.startTime = Date.now()
    this.pendingRequests.set(requestId, { config, timestamp: Date.now() })
    this.metrics.totalRequests++
    if (config.method.toLowerCase() === "get" && config.headers["x-no-cache"]) {
      config.params = config.params || {}
      config.params["_"] = Date.now()
    }
    const token = this._getStoredToken()
    if (token && isTokenExpired(token) && !config.url.includes("/auth/refresh-token") && !config._isRefreshRequest) {
      if (!config._tokenRefreshRetry) {
        config._tokenRefreshRetry = true
        this.logger.debug(`Token expired before request. Queueing request: ${config.method} ${config.url}`)
        this.requestsToRetry.push(config)
        this.refreshToken().catch((err) => {
          this.logger.warn("Token refresh failed in request handler:", err.message)
        })
        const source = axios.CancelToken.source()
        config.cancelToken = source.token
        setTimeout(() => source.cancel("Token expired. Request will be retried."), 0)
      }
    }
    this.logger.debug(
      `Request: ${config.method.toUpperCase()} ${config.url}`,
      config.params ? `Params: ${JSON.stringify(config.params)}` : "",
    )
    return config
  }

  _handleRequestError(error) {
    this.logger.error("Request error:", error.message)
    this.metrics.failedRequests++
    return Promise.reject(error)
  }

  _handleResponse(response) {
    const requestTime = Date.now() - response.config.startTime
    this.metrics.successfulRequests++
    this.metrics.avgResponseTime =
      (this.metrics.avgResponseTime * (this.metrics.successfulRequests - 1) + requestTime) /
      this.metrics.successfulRequests
    if (response.config.requestId) {
      this.pendingRequests.delete(response.config.requestId)
    }
    this.logger.debug(
      `Response success: ${response.config.method.toUpperCase()} ${response.config.url} (${requestTime}ms)`,
    )
    if (response.config.method.toLowerCase() === "get" && !response.config.headers["x-no-cache"]) {
      this.cache.set(response.config.url, response.config.params, response.data)
    }
    return response.data
  }

  _handleResponseError(error) {
    if (axios.isCancel(error)) {
      this.logger.debug(`Request canceled: ${error.message}`)
      return Promise.reject({ success: false, error: "Request canceled", isCanceled: true })
    }
    if (error.config?.requestId) {
      this.pendingRequests.delete(error.config.requestId)
    }
    if (!error.response) {
      const isOffline = !navigator.onLine
      const errorMsg = isOffline
        ? "You are currently offline. Please check your connection."
        : "Network error. Please try again."
      if (!isOffline || error.config?.method === "get") {
        toast.error(errorMsg)
      }
      return Promise.reject({ success: false, error: errorMsg, isOffline, originalError: error })
    }
    return this._processHttpError(error)
  }

  async _processHttpError(error) {
    const originalRequest = error.config
    const status = error.response.status
    this.logger.error(
      `Response error: ${originalRequest.method.toUpperCase()} ${originalRequest.url}`,
      `Status: ${status}`,
      error.response.data,
    )
    if (status === 401 && !originalRequest._retry) {
      return this._handleAuthError(error)
    }
    const errorData = error.response.data
    const errorMsg =
      errorData?.error ||
      errorData?.message ||
      errorData?.msg ||
      (error.response.status === 400 && originalRequest.url.includes("/like")
        ? "You've already liked this user or reached your daily limit"
        : "An error occurred")
    const errorCode = errorData?.code || null
    this._showErrorNotification(status, errorMsg, errorCode)
    return Promise.reject({ success: false, error: errorMsg, code: errorCode, status, data: error.response.data })
  }

  async _handleAuthError(error) {
    const originalRequest = error.config
    originalRequest._retry = true
    if (originalRequest.url.includes("/auth/refresh-token")) {
      this.logger.warn("Refresh token request failed")
      this._handleLogout("Session expired. Please log in again.")
      return Promise.reject({ success: false, error: "Authentication failed", status: 401 })
    }
    this.logger.debug("Received 401 error. Attempting token refresh...")
    try {
      const newToken = await this.refreshToken()
      if (newToken) {
        this.logger.debug("Token refreshed successfully. Retrying original request.")
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        originalRequest.headers["x-auth-token"] = newToken
        return this.api(originalRequest)
      } else {
        this.logger.warn("Token refresh returned null")
        if (this._getStoredToken()) {
          this._handleLogout("Session expired. Please log in again.")
        }
        throw new Error("Failed to refresh token")
      }
    } catch (refreshError) {
      this.logger.error("Token refresh failed:", refreshError)
      if (this._getStoredToken()) {
        this._handleLogout("Session expired. Please log in again.")
      }
      return Promise.reject({ success: false, error: "Authentication failed", status: 401 })
    }
  }

  _showErrorNotification(status, message, code) {
    if (document.hidden) return
    switch (status) {
      case 400:
        toast.error(`Request error: ${message}`)
        break
      case 403:
        toast.error(`Access denied: ${message}`)
        break
      case 404:
        toast.error(`Not found: ${message}`)
        break
      case 422:
        toast.error(`Validation error: ${message}`)
        break
      case 429:
        toast.error("Too many requests. Please try again later.")
        break
      case 500:
      case 502:
      case 503:
      case 504:
        toast.error(`Server error (${status}). Please try again later.`)
        break
      default:
        toast.error(message)
    }
  }

  _handleLogout(message) {
    this._removeToken()
    this.setAuthToken(null)
    toast.error(message)
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent("authLogout"))
    }
  }

  _getStoredToken() {
    return getToken()
  }

  _storeToken(token, rememberMe = false) {
    if (!token) return
    setToken(token, rememberMe)
  }

  _removeToken() {
    removeToken()
  }

  _loadAuthToken() {
    const token = this._getStoredToken()
    if (token) {
      this.setAuthToken(token)
      if (isTokenExpired(token)) {
        console.log("Token expired, attempting to refresh")
        this.refreshToken().catch((err) => {
          console.warn("Token refresh failed on initialization:", err)
        })
      }
      return token
    }
    return null
  }

  setAuthToken(token) {
    if (token) {
      this.api.defaults.headers.common["Authorization"] = `Bearer ${token}`
      this.api.defaults.headers.common["x-auth-token"] = token
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`
      axios.defaults.headers.common["x-auth-token"] = token
      console.log("Auth token set in all API instances")
    } else {
      delete this.api.defaults.headers.common["Authorization"]
      delete this.api.defaults.headers.common["x-auth-token"]
      delete axios.defaults.headers.common["Authorization"]
      delete axios.defaults.headers.common["x-auth-token"]
      console.log("Auth token removed from all API instances")
    }
  }

  async refreshToken() {
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise
    }
    this.refreshTokenPromise = (async () => {
      try {
        console.log("Refreshing authentication token...")
        const currentToken = this._getStoredToken()
        if (!currentToken) {
          console.warn("No token available for refresh")
          return null
        }
        const response = await axios.post(
          `${this.baseURL}/auth/refresh-token`,
          { token: currentToken },
          {
            headers: { "Content-Type": "application/json", "x-no-cache": "true" },
          },
        )
        if (response.data && response.data.success && response.data.token) {
          const token = response.data.token
          this._storeToken(token, localStorage.getItem("token") !== null)
          this.setAuthToken(token)
          console.log("Token refreshed successfully")
          this._retryQueuedRequests(token)
          try {
            const payload = JSON.parse(atob(token.split(".")[1]))
            if (payload.exp) {
              const expiresIn = payload.exp * 1000 - Date.now() - 60000
              if (expiresIn > 0) {
                this.tokenRefreshTimer = setTimeout(() => this.refreshToken(), expiresIn)
                console.log(`Scheduled next token refresh in ${Math.round(expiresIn / 1000)} seconds`)
              }
            }
          } catch (e) {
            console.error("Error scheduling token refresh:", e)
          }
          return token
        } else {
          console.warn("Invalid refresh token response:", response.data)
          throw new Error("Invalid refresh token response")
        }
      } catch (error) {
        console.error("Token refresh failed:", error)
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          this._removeToken()
          this.setAuthToken(null)
          toast.error("Your session has expired. Please log in again.")
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("authLogout"))
          }
        }
        return null
      } finally {
        setTimeout(() => {
          this.refreshTokenPromise = null
        }, 1000)
      }
    })()
    return this.refreshTokenPromise
  }

  _retryQueuedRequests(token) {
    const requestsToRetry = [...this.requestsToRetry]
    this.requestsToRetry = []
    console.log(`Retrying ${requestsToRetry.length} queued requests with new token`)
    requestsToRetry.forEach((config) => {
      config.headers.Authorization = `Bearer ${token}`
      config.headers["x-auth-token"] = token
      this.api(config).catch((err) => {
        console.error(`Error retrying queued request: ${config.method} ${config.url}`, err)
      })
    })
  }

  // Add a helper method to process API responses consistently
  _processResponse(response) {
    // If the response is already in our expected format, return it
    if (response && typeof response.success === "boolean") {
      return response
    }

    // If the response is an error object with a message
    if (response && response.error) {
      return {
        success: false,
        error: response.error,
        data: response,
      }
    }

    // Otherwise, transform it to our expected format
    return {
      success: true,
      data: response,
    }
  }

  // Add a utility function to validate MongoDB ObjectIds
  isValidObjectId = (id) => {
    return id && typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id)
  }

  // Update the get method to use the _processResponse helper
  async get(url, params = {}, options = {}) {
    try {
      // Check if the endpoint contains an ID parameter (common pattern: /users/:id, /messages/:id)
      const idMatch = url.match(/\/([^/]+)$/)
      if (idMatch && idMatch[1] && !url.includes("?") && !url.endsWith("/")) {
        const potentialId = idMatch[1]
        // If it looks like a MongoDB ID but isn't valid, reject early
        if (potentialId.length === 24 && !this.isValidObjectId(potentialId)) {
          console.error(`Invalid ObjectId in request: ${potentialId}`)
          return {
            success: false,
            error: "Invalid ID format",
            status: 400,
          }
        }
      }

      // Continue with the original request
      const response = await this.api.get(url, {
        params,
        ...options,
        cancelToken: options.cancelToken,
      })
      return this._processResponse(response)
    } catch (error) {
      console.error(`GET request failed: ${url}`, error)
      throw error
    }
  }

  // Update the post method to use the _processResponse helper
  async post(url, data = {}, options = {}) {
    try {
      if (options.invalidateCache !== false) {
        this.cache.invalidate(url)
      }
      const response = await this.api.post(url, data, {
        ...options,
        cancelToken: options.cancelToken,
      })
      return this._processResponse(response)
    } catch (error) {
      console.error(`POST request failed: ${url}`, error)
      throw error
    }
  }

  // Update the put method to use the _processResponse helper
  async put(url, data = {}, options = {}) {
    try {
      if (options.invalidateCache !== false) {
        this.cache.invalidate(url)
      }
      const response = await this.api.put(url, data, {
        ...options,
        cancelToken: options.cancelToken,
      })
      return this._processResponse(response)
    } catch (error) {
      console.error(`PUT request failed: ${url}`, error)
      throw error
    }
  }

  // Update the delete method to use the _processResponse helper
  async delete(url, options = {}) {
    try {
      if (options.invalidateCache !== false) {
        this.cache.invalidate(url)
      }
      const response = await this.api.delete(url, {
        ...options,
        cancelToken: options.cancelToken,
      })
      return this._processResponse(response)
    } catch (error) {
      console.error(`DELETE request failed: ${url}`, error)
      throw error
    }
  }

  async upload(url, formData, onProgress = null, options = {}) {
    try {
      const source = axios.CancelToken.source()
      const response = await this.api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: onProgress
          ? (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
              onProgress(percentCompleted)
            }
          : undefined,
        cancelToken: source.token,
        ...options,
      })
      return response
    } catch (error) {
      console.error(`Upload failed: ${url}`, error)
      throw error
    }
  }

  async download(url, params = {}, onProgress = null, options = {}) {
    try {
      const source = axios.CancelToken.source()
      const response = await this.api.get(url, {
        params,
        responseType: "blob",
        onDownloadProgress: onProgress
          ? (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
              onProgress(percentCompleted)
            }
          : undefined,
        cancelToken: source.token,
        ...options,
      })
      return response
    } catch (error) {
      console.error(`Download failed: ${url}`, error)
      throw error
    }
  }

  createCancelToken() {
    return axios.CancelToken.source()
  }

  isCancel(error) {
    return axios.isCancel(error)
  }

  cancelAllRequests(reason = "Request canceled by user") {
    const pendingCount = this.pendingRequests.size
    if (pendingCount > 0) {
      console.log(`Canceling ${pendingCount} pending requests: ${reason}`)
      for (const [requestId, requestData] of this.pendingRequests.entries()) {
        const source = axios.CancelToken.source()
        source.cancel(reason)
        this.pendingRequests.delete(requestId)
      }
    }
  }

  async testConnection() {
    try {
      const source = this.createCancelToken()
      const timeout = setTimeout(() => {
        source.cancel("Connection test timeout")
      }, 5000)
      const result = await this.get("/auth/test-connection", {}, { cancelToken: source.token })
      clearTimeout(timeout)
      return {
        success: true,
        data: result,
        ping: result.timestamp ? new Date() - new Date(result.timestamp) : null,
      }
    } catch (error) {
      return {
        success: false,
        error: error.error || error.message || "Connection test failed",
        isOffline: !navigator.onLine,
      }
    }
  }

  async getHealthStatus() {
    try {
      const result = await this.get("/health", {}, { timeout: 3000 })
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.error || error.message || "Health check failed" }
    }
  }

  getMetrics() {
    return { ...this.metrics }
  }

  clearCache(url = null) {
    this.cache.invalidate(url)
  }

  processQueue() {
    if (navigator.onLine) {
      this.requestQueue.processQueue()
    }
  }

  cleanup() {
    this.cancelAllRequests("API service cleanup")
    if (this.networkMonitor) {
      this.networkMonitor.cleanup()
    }
  }

  async login(credentials, rememberMe = false) {
    try {
      const response = await this.post("/auth/login", credentials)
      if (response.success && response.token) {
        this._storeToken(response.token, rememberMe)
        this.setAuthToken(response.token)
        return response
      }
      throw new Error(response.error || "Invalid login response")
    } catch (error) {
      throw error
    }
  }

  async logout() {
    try {
      const token = this._getStoredToken()
      if (token) {
        await this.post("/auth/logout")
      }
    } catch (error) {
      console.warn("Logout request failed:", error)
    } finally {
      this._removeToken()
      this.setAuthToken(null)
      this.cancelAllRequests("User logout")
      this.clearCache()
    }
  }
}

// Create singleton instance
const apiService = new ApiService()

// Register cleanup on window unload
if (typeof window !== "undefined") {
  window.addEventListener("unload", () => {
    apiService.pendingRequests.forEach((request) => {
      if (request.config?.cancelToken?.cancel) {
        request.config.cancelToken.cancel("Navigation canceled request")
      }
    })
  })
}

export default apiService

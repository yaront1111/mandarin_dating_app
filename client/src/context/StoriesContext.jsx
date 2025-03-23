"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react"
import storiesService from "@services/storiesService.jsx"
import { useAuth } from "./AuthContext"
import { toast } from "react-toastify"

// Create context
const StoriesContext = createContext()

/**
 * Stories provider component
 * Manages stories data, loading, creation, deletion, and interactions
 */
export const StoriesProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth()
  const [stories, setStories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [viewedStories, setViewedStories] = useState({})
  const [lastFetch, setLastFetch] = useState(0)
  const [isCreatingStory, setIsCreatingStory] = useState(false)

  // Refs for managing async operations
  const refreshIntervalRef = useRef(null)
  const storyOperationsInProgress = useRef(new Map())
  const pendingRefreshTimeoutRef = useRef(null)

  // Loading state management
  const isLoadingRef = useRef(false)
  const loadingTimeoutRef = useRef(null)

  const storyBeingCreated = useRef(false)

  /**
   * Debounce function to limit multiple calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} - Debounced function
   */
  const debounce = useCallback((func, wait) => {
    let timeout
    return (...args) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func(...args), wait)
    }
  }, [])

  /**
   * Clear error helper
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Load all stories for the feed with improved caching and deduplication
   * @param {boolean} forceRefresh - Whether to bypass cache and force refresh
   * @returns {Promise<Array>} - Promise resolving to stories array
   */
  const loadStories = useCallback(
    async (forceRefresh = false) => {
      // Early return if currently loading
      if (isLoadingRef.current) {
        // Schedule for later instead of relying on a boolean flag
        if (pendingRefreshTimeoutRef.current) {
          clearTimeout(pendingRefreshTimeoutRef.current)
        }

        pendingRefreshTimeoutRef.current = setTimeout(() => {
          pendingRefreshTimeoutRef.current = null
          loadStories(true) // Force refresh when executing the delayed call
        }, 1000)

        return stories
      }

      // Check cache if not forcing refresh
      const now = Date.now()
      const cacheAge = now - lastFetch
      const cacheValid = stories.length > 0 && cacheAge < 60000 // 1 minute cache

      if (!forceRefresh && cacheValid) {
        return stories
      }

      // Set loading state
      isLoadingRef.current = true
      setLoading(true)

      // Clear any existing loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }

      // Set a timeout to clear loading state if the request takes too long
      loadingTimeoutRef.current = setTimeout(() => {
        isLoadingRef.current = false
        setLoading(false)
        setError("Request timeout. Please try again.")
        loadingTimeoutRef.current = null
      }, 30000) // 30-second timeout

      try {
        const response = await storiesService.getAllStories()

        if (!response.success) {
          throw new Error(response.message || "Failed to load stories")
        }

        if (!Array.isArray(response.data)) {
          throw new Error("Invalid response format: expected array of stories")
        }

        // Create a lookup map for quick duplicate detection
        const storyMap = new Map()
        const uniqueStories = []

        // Process stories in reverse to keep the newest in case of duplicates
        for (let i = response.data.length - 1; i >= 0; i--) {
          const story = response.data[i]

          // Skip invalid stories
          if (!story || !story._id) continue

          // Skip duplicate stories
          if (!storyMap.has(story._id)) {
            storyMap.set(story._id, true)
            uniqueStories.unshift(story) // Add to beginning to maintain original order
          }
        }

        setStories(uniqueStories)
        setLastFetch(now)
        setError(null)
        return uniqueStories
      } catch (err) {
        setError(err.message || "Failed to load stories")
        return []
      } finally {
        isLoadingRef.current = false
        setLoading(false)

        // Clear loading timeout
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current)
          loadingTimeoutRef.current = null
        }

        // Handle any pending refresh
        if (pendingRefreshTimeoutRef.current) {
          clearTimeout(pendingRefreshTimeoutRef.current)
          pendingRefreshTimeoutRef.current = null
        }
      }
    },
    [lastFetch, stories],
  )

  /**
   * Debounced version of loadStories to prevent too frequent refreshes
   */
  const debouncedLoadStories = useMemo(
    () =>
      debounce((forceRefresh) => {
        loadStories(forceRefresh)
      }, 300),
    [loadStories, debounce],
  )

  /**
   * Load stories for a specific user
   * @param {string} userId - User ID to load stories for
   * @returns {Promise<Array>} - Promise resolving to user's stories array
   */
  const loadUserStories = useCallback(async (userId) => {
    if (!userId) {
      console.error("Cannot load user stories: Missing userId")
      return []
    }

    const operationKey = `loadUserStories-${userId}`

    // Check if operation is already in progress
    if (storyOperationsInProgress.current.has(operationKey)) {
      // Return the existing promise to avoid duplicate requests
      return storyOperationsInProgress.current.get(operationKey)
    }

    // Create the operation promise
    const operationPromise = (async () => {
      try {
        setLoading(true)
        const response = await storiesService.getUserStories(userId)

        if (!response.success) {
          throw new Error(response.message || "Failed to load user stories")
        }

        return Array.isArray(response.data) ? [...response.data] : []
      } catch (err) {
        console.error(`Error loading stories for user ${userId}:`, err)
        return []
      } finally {
        setLoading(false)

        // Remove from in-progress operations after a short delay
        // This prevents rapid consecutive requests
        setTimeout(() => {
          storyOperationsInProgress.current.delete(operationKey)
        }, 300)
      }
    })()

    // Store the promise in the in-progress operations map
    storyOperationsInProgress.current.set(operationKey, operationPromise)
    return operationPromise
  }, [])

  /**
   * Create a new story with robust error handling
   * @param {Object} storyData - Story data object
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<Object>} - Promise resolving to creation result
   */
  const createStory = useCallback(
    async (storyData, onProgress) => {
      if (!user) {
        toast.error("You must be logged in to create a story")
        return { success: false, message: "You must be logged in to create a story" }
      }

      // Prevent duplicate submissions using both state and ref
      if (isCreatingStory || storyBeingCreated.current) {
        return { success: false, message: "Story creation already in progress" }
      }

      // Set creating state and ref
      setIsCreatingStory(true)
      storyBeingCreated.current = true
      setLoading(true)

      // Validate story data
      if (!storyData || !storyData.mediaType) {
        setIsCreatingStory(false)
        storyBeingCreated.current = false
        setLoading(false)
        toast.error("Invalid story data")
        return { success: false, message: "Invalid story data" }
      }

      // Normalize data for API compatibility
      const normalizedData = { ...storyData }

      // Ensure text stories have content field set
      if (normalizedData.mediaType === "text") {
        normalizedData.content = normalizedData.content || normalizedData.text

        if (!normalizedData.content) {
          setIsCreatingStory(false)
          storyBeingCreated.current = false
          setLoading(false)
          toast.error("Text stories require content")
          return { success: false, message: "Text stories require content" }
        }
      }

      try {
        let response

        // Use appropriate endpoint based on story type
        if (normalizedData.mediaType === "text") {
          response = await storiesService.createTextStory(normalizedData, onProgress)
        } else {
          response = await storiesService.createStory(normalizedData, onProgress)
        }

        if (!response.success) {
          throw new Error(response.message || "Failed to create story")
        }

        // Extract story from response (handling different API response formats)
        const newStory = response.data || response.story

        if (!newStory) {
          throw new Error("Story created but data not returned")
        }

        // Atomically update state to prevent race conditions
        setStories((prevStories) => {
          // Check for duplicate before adding
          if (prevStories.some((s) => s._id === newStory._id)) {
            return prevStories
          }
          return [newStory, ...prevStories]
        })

        return response
      } catch (err) {
        console.error("Error creating story:", err)
        toast.error(err.message || "Failed to create story")
        return { success: false, message: err.message || "Failed to create story" }
      } finally {
        setLoading(false)
        setIsCreatingStory(false)
        // Add a small delay before resetting the ref to prevent rapid consecutive submissions
        setTimeout(() => {
          storyBeingCreated.current = false
        }, 500)
      }
    },
    [user, isCreatingStory],
  )

  /**
   * Delete a story
   * @param {string} storyId - ID of story to delete
   * @returns {Promise<Object>} - Promise resolving to deletion result
   */
  const deleteStory = useCallback(
    async (storyId) => {
      if (!user) {
        toast.error("You must be logged in to delete a story")
        return { success: false, message: "You must be logged in to delete a story" }
      }

      if (!storyId) {
        toast.error("Invalid story ID")
        return { success: false, message: "Invalid story ID" }
      }

      const operationKey = `deleteStory-${storyId}`

      // Check if operation is already in progress
      if (storyOperationsInProgress.current.has(operationKey)) {
        return { success: false, message: "Delete operation in progress" }
      }

      // Create the operation promise
      const operationPromise = (async () => {
        try {
          setLoading(true)
          const response = await storiesService.deleteStory(storyId)

          if (!response.success) {
            throw new Error(response.message || "Failed to delete story")
          }

          // Update stories state atomically
          setStories((prevStories) => prevStories.filter((story) => story._id !== storyId))

          toast.success("Story deleted successfully")
          return response
        } catch (err) {
          console.error(`Error deleting story ${storyId}:`, err)
          toast.error(err.message || "Failed to delete story")
          return { success: false, message: err.message || "Failed to delete story" }
        } finally {
          setLoading(false)

          // Remove from in-progress operations after a short delay
          setTimeout(() => {
            storyOperationsInProgress.current.delete(operationKey)
          }, 300)
        }
      })()

      // Store the promise in the in-progress operations map
      storyOperationsInProgress.current.set(operationKey, operationPromise)
      return operationPromise
    },
    [user],
  )

  /**
   * Mark a story as viewed
   * @param {string} storyId - ID of story to mark as viewed
   * @returns {Promise<boolean>} - Promise resolving to success status
   */
  const viewStory = useCallback(
    async (storyId) => {
      if (!user || !storyId) return false

      const operationKey = `viewStory-${storyId}`

      // Check if operation is already in progress
      if (storyOperationsInProgress.current.has(operationKey)) {
        return storyOperationsInProgress.current.get(operationKey)
      }

      // Check if already viewed to reduce unnecessary API calls
      if (viewedStories[storyId]) {
        return true
      }

      // Create the operation promise
      const operationPromise = (async () => {
        try {
          const response = await storiesService.markStoryAsViewed(storyId)

          if (!response.success) {
            throw new Error(response.message || "Failed to mark story as viewed")
          }

          // Update viewed stories state atomically
          setViewedStories((prev) => ({ ...prev, [storyId]: Date.now() }))
          return true
        } catch (err) {
          console.error(`Error marking story ${storyId} as viewed:`, err)
          return false
        } finally {
          // Remove from in-progress operations after a short delay
          setTimeout(() => {
            storyOperationsInProgress.current.delete(operationKey)
          }, 300)
        }
      })()

      // Store the promise in the in-progress operations map
      storyOperationsInProgress.current.set(operationKey, operationPromise)
      return operationPromise
    },
    [user, viewedStories],
  )

  /**
   * Check if a user has unviewed stories
   * @param {string} userId - User ID to check for unviewed stories
   * @returns {boolean} - Whether user has unviewed stories
   */
  const hasUnviewedStories = useCallback(
    (userId) => {
      if (!stories || !userId || !user) return false

      const userStories = stories.filter((story) => {
        if (!story) return false

        // Handle different data formats for user reference
        const storyUserId = story.user && (typeof story.user === "string" ? story.user : story.user._id)

        return storyUserId === userId
      })

      // No stories or all stories viewed
      if (!userStories || userStories.length === 0) return false

      // Check if any story is unviewed
      return userStories.some((story) => !viewedStories[story._id])
    },
    [stories, viewedStories, user],
  )

  /**
   * React to a story
   * @param {string} storyId - ID of story to react to
   * @param {string} reactionType - Type of reaction
   * @returns {Promise<Object>} - Promise resolving to reaction result
   */
  const reactToStory = useCallback(
    async (storyId, reactionType) => {
      if (!user) {
        toast.error("You must be logged in to react to a story")
        return { success: false }
      }

      if (!storyId || !reactionType) {
        toast.error("Invalid story ID or reaction type")
        return { success: false, message: "Invalid story ID or reaction type" }
      }

      const operationKey = `reactToStory-${storyId}-${reactionType}`

      // Check if operation is already in progress
      if (storyOperationsInProgress.current.has(operationKey)) {
        return storyOperationsInProgress.current.get(operationKey)
      }

      // Create the operation promise
      const operationPromise = (async () => {
        try {
          const response = await storiesService.reactToStory(storyId, reactionType)

          if (!response.success) {
            throw new Error(response.message || "Failed to react to story")
          }

          toast.success("Reaction added!")

          return response
        } catch (err) {
          console.error("Error reacting to story:", err)
          toast.error(err.message || "Failed to add reaction")
          return { success: false }
        } finally {
          // Remove from in-progress operations after a short delay
          setTimeout(() => {
            storyOperationsInProgress.current.delete(operationKey)
          }, 300)
        }
      })()

      // Store the promise in the in-progress operations map
      storyOperationsInProgress.current.set(operationKey, operationPromise)
      return operationPromise
    },
    [user],
  )

  // Load viewed stories from localStorage on mount
  useEffect(() => {
    if (!user) return

    try {
      const storageKey = `viewedStories_${user._id}`
      const storedViewedStories = localStorage.getItem(storageKey)

      if (storedViewedStories) {
        const parsedStories = JSON.parse(storedViewedStories)

        // Validate the parsed data
        if (parsedStories && typeof parsedStories === "object") {
          setViewedStories(parsedStories)
        }
      }
    } catch (err) {
      console.error("Error parsing viewed stories from localStorage:", err)
      // Recover by resetting the viewed stories state
      setViewedStories({})
    }
  }, [user])

  // Save viewed stories to localStorage when they change
  useEffect(() => {
    if (!user || Object.keys(viewedStories).length === 0) return

    const storageKey = `viewedStories_${user._id}`
    const saveToStorage = debounce(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(viewedStories))
      } catch (err) {
        console.error("Error saving viewed stories to localStorage:", err)
      }
    }, 1000)

    saveToStorage()

    // Save immediately on unmount
    return () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(viewedStories))
      } catch (err) {
        console.error("Error saving viewed stories to localStorage on unmount:", err)
      }
    }
  }, [viewedStories, user, debounce])

  // Set up periodic refresh for stories when authenticated
  useEffect(() => {
    // Clear any existing interval when dependencies change
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }

    // Only set up refresh if user is authenticated
    if (!isAuthenticated) return

    // Initial load with delay to prevent UI freeze on page load
    const initialLoadTimeoutId = setTimeout(() => {
      if (isAuthenticated) {
        debouncedLoadStories(false)
      }
    }, 1000)

    // Set up refresh interval - 5 minutes
    const intervalId = setInterval(
      () => {
        // Only refresh if tab is visible and not already loading
        if (document.visibilityState === "visible" && !isLoadingRef.current) {
          debouncedLoadStories(true)
        }
      },
      5 * 60 * 1000,
    ) // 5 minutes

    // Store interval ID in ref
    refreshIntervalRef.current = intervalId

    // Cleanup function
    return () => {
      clearTimeout(initialLoadTimeoutId)

      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }

      // Clear any pending operations
      if (pendingRefreshTimeoutRef.current) {
        clearTimeout(pendingRefreshTimeoutRef.current)
        pendingRefreshTimeoutRef.current = null
      }

      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
        loadingTimeoutRef.current = null
      }
    }
  }, [isAuthenticated, debouncedLoadStories])

  // Create memoized context value to prevent unnecessary renders
  const contextValue = useMemo(
    () => ({
      stories,
      loading,
      error,
      clearError,
      loadStories,
      loadUserStories,
      createStory,
      deleteStory,
      viewStory,
      reactToStory,
      hasUnviewedStories,
      viewedStories,
    }),
    [
      stories,
      loading,
      error,
      clearError,
      loadStories,
      loadUserStories,
      createStory,
      deleteStory,
      viewStory,
      reactToStory,
      hasUnviewedStories,
      viewedStories,
    ],
  )

  return <StoriesContext.Provider value={contextValue}>{children}</StoriesContext.Provider>
}

/**
 * Custom hook to use the stories context
 * @returns {Object} Stories context
 */
export const useStories = () => {
  const context = useContext(StoriesContext)

  if (context === undefined) {
    console.warn("useStories must be used within a StoriesProvider")
    return null
  }

  return context
}

export default StoriesContext

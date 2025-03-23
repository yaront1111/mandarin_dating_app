"use client"

import { useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { HeartIcon, ChatBubbleLeftIcon, UserIcon } from "@heroicons/react/24/outline"
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid"

// Import the normalizePhotoUrl utility
import { normalizePhotoUrl } from "../utils/index.js"

/**
 * Enhanced UserCard component with proper server integration
 * Handles image loading errors and network issues gracefully
 */
const UserCard = ({ user, onLike, viewMode = "grid", onMessage }) => {
  const navigate = useNavigate()
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  if (!user) return null

  // Replace the getProfilePhotoUrl function with this improved version
  const getProfilePhotoUrlRef = useRef(() => {
    if (!user || !user.photos || !user.photos.length) {
      return "/placeholder.svg"
    }

    const photoUrl = user.photos[0].url || user.profilePhoto
    return normalizePhotoUrl(photoUrl)
  })

  // Update the ref whenever the user object changes
  useCallback(() => {
    getProfilePhotoUrlRef.current = () => {
      if (!user || !user.photos || !user.photos.length) {
        return "/placeholder.svg"
      }

      const photoUrl = user.photos[0].url || user.profilePhoto
      return normalizePhotoUrl(photoUrl)
    }
  }, [user])

  const getProfilePhotoUrl = getProfilePhotoUrlRef.current

  const handleCardClick = () => {
    navigate(`/user/${user._id}`)
  }

  const handleLikeClick = (e) => {
    e.stopPropagation()
    if (onLike) onLike(user._id, user.nickname)
  }

  const handleMessageClick = (e) => {
    e.stopPropagation()
    if (onMessage) onMessage(user)
  }

  const handleImageLoad = () => {
    setImageLoaded(true)
  }

  const handleImageError = () => {
    setImageError(true)
    setImageLoaded(true) // Still mark as loaded to remove placeholder
  }

  // Helper to format age and location properly
  const getSubtitle = () => {
    const parts = []
    if (user.details?.age) parts.push(`${user.details.age}`)
    if (user.details?.location) parts.push(user.details.location)
    if (user.details?.iAm) parts.push(`I am a ${user.details.iAm}`)
    return parts.join(" • ")
  }

  // Grid view card
  if (viewMode === "grid") {
    return (
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 h-full overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image container with gradient overlay */}
        <div className="aspect-w-1 aspect-h-1 relative">
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 animate-pulse flex items-center justify-center">
              <UserIcon className="h-12 w-12 text-gray-300 dark:text-gray-500" />
            </div>
          )}

          {!imageError ? (
            <img
              src={getProfilePhotoUrl() || "/placeholder.svg"}
              alt={`${user.nickname || "User"}'s profile`}
              className="w-full h-full object-cover transition-all duration-500"
              style={{
                opacity: imageLoaded ? 1 : 0,
                transform: isHovered ? "scale(1.05)" : "scale(1)",
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
              <UserIcon className="h-16 w-16 text-gray-400 dark:text-gray-500" />
            </div>
          )}

          {/* Gradient overlay - only visible on hover */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300"
            style={{ opacity: isHovered ? 0.8 : 0 }}
          />

          {/* Online indicator */}
          {user.isOnline && (
            <div className="absolute top-2 right-2 z-10">
              <span className="flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              </span>
            </div>
          )}
        </div>

        <div className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white text-lg tracking-tight">
                {user.nickname || user.firstName}
                {user.details?.age ? `, ${user.details.age}` : ""}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center">{getSubtitle()}</p>
            </div>
          </div>

          {user.details?.bio && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-3">{user.details.bio}</p>
          )}

          {user.details?.lookingFor?.length > 0 && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              <strong>Looking for:</strong> {user.details.lookingFor.join(", ")}
            </p>
          )}

          {user.details?.interests?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 mb-3">
              {user.details.interests.slice(0, 3).map((interest) => (
                <span
                  key={interest}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                >
                  {interest}
                </span>
              ))}
              {user.details.interests.length > 3 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  +{user.details.interests.length - 3}
                </span>
              )}
            </div>
          )}

          {user.details?.intoTags?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 mb-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Into:</span>
              {user.details.intoTags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                >
                  {tag}
                </span>
              ))}
              {user.details.intoTags.length > 2 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  +{user.details.intoTags.length - 2}
                </span>
              )}
            </div>
          )}

          {user.details?.turnOns?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 mb-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Turn ons:</span>
              {user.details.turnOns.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-50 text-pink-700 dark:bg-pink-900 dark:text-pink-300"
                >
                  {tag}
                </span>
              ))}
              {user.details.turnOns.length > 2 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  +{user.details.turnOns.length - 2}
                </span>
              )}
            </div>
          )}

          <div className="mt-auto flex space-x-2">
            <button
              onClick={handleLikeClick}
              className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg transition-colors ${
                user.isLiked
                  ? "bg-red-50 text-red-500 dark:bg-red-900/40 dark:text-red-300"
                  : "bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-500 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/40 dark:hover:text-red-300"
              }`}
              aria-label={user.isLiked ? "Unlike" : "Like"}
            >
              {user.isLiked ? <HeartIconSolid className="h-5 w-5" /> : <HeartIcon className="h-5 w-5" />}
            </button>
            <button
              onClick={handleMessageClick}
              className="flex-1 flex items-center justify-center py-2 px-3 rounded-lg bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blue-500 transition-colors dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
              aria-label="Message"
            >
              <ChatBubbleLeftIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // List view card
  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer transition-all duration-300 ease-in-out transform hover:-translate-y-1"
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex flex-col sm:flex-row">
        {/* Image container with fixed dimensions on mobile, aspect ratio on desktop */}
        <div className="relative w-full sm:w-48 h-48 sm:h-auto sm:aspect-square overflow-hidden">
          {!imageLoaded && (
            <div className="absolute inset-0 bg-gray-100 dark:bg-gray-700 animate-pulse flex items-center justify-center">
              <UserIcon className="h-12 w-12 text-gray-300 dark:text-gray-500" />
            </div>
          )}

          {!imageError ? (
            <img
              src={getProfilePhotoUrl() || "/placeholder.svg"}
              alt={`${user.nickname || "User"}'s profile`}
              className="w-full h-full object-cover transition-all duration-500"
              style={{
                opacity: imageLoaded ? 1 : 0,
                transform: isHovered ? "scale(1.05)" : "scale(1)",
              }}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
              <UserIcon className="h-16 w-16 text-gray-400 dark:text-gray-500" />
            </div>
          )}

          {/* Gradient overlay - only visible on hover */}
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300"
            style={{ opacity: isHovered ? 0.6 : 0 }}
          />

          {/* Online indicator */}
          {user.isOnline && (
            <div className="absolute top-2 right-2 z-10">
              <span className="flex h-3 w-3">
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              </span>
            </div>
          )}
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white text-lg">
                {user.nickname || user.firstName}
                {user.details?.age ? `, ${user.details.age}` : ""}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{getSubtitle()}</p>
            </div>
          </div>

          {user.details?.bio && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-3 flex-grow">{user.details.bio}</p>
          )}

          {user.details?.lookingFor?.length > 0 && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              <strong>Looking for:</strong> {user.details.lookingFor.join(", ")}
            </p>
          )}

          {user.details?.interests?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {user.details.interests.map((interest) => (
                <span
                  key={interest}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                >
                  {interest}
                </span>
              ))}
            </div>
          )}

          {user.details?.intoTags?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 mb-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Into:</span>
              {user.details.intoTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {user.details?.turnOns?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 mb-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Turn ons:</span>
              {user.details.turnOns.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-pink-50 text-pink-700 dark:bg-pink-900 dark:text-pink-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex space-x-2">
            <button
              onClick={handleLikeClick}
              className={`flex-1 flex items-center justify-center py-2 px-3 rounded-lg transition-colors ${
                user.isLiked
                  ? "bg-red-50 text-red-500 dark:bg-red-900/40 dark:text-red-300"
                  : "bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-500 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-red-900/40 dark:hover:text-red-300"
              }`}
              aria-label={user.isLiked ? "Unlike" : "Like"}
            >
              {user.isLiked ? <HeartIconSolid className="h-5 w-5" /> : <HeartIcon className="h-5 w-5" />}
            </button>
            <button
              onClick={handleMessageClick}
              className="flex-1 flex items-center justify-center py-2 px-3 rounded-lg bg-gray-50 hover:bg-blue-50 text-gray-500 hover:text-blue-500 transition-colors dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-blue-900/40 dark:hover:text-blue-300"
              aria-label="Message"
            >
              <ChatBubbleLeftIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserCard

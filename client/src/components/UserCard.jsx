"use client";

import { useState, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  HeartIcon,
  ChatBubbleLeftIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid } from "@heroicons/react/24/solid";

// Import the normalizePhotoUrl utility
import { normalizePhotoUrl } from "../utils/index.js";

/**
 * Enhanced UserCard component with proper server integration.
 * Handles image loading errors and network issues gracefully.
 *
 * @param {object} props
 * @param {object} props.user - The user object.
 * @param {function} props.onLike - Callback for when the like button is clicked.
 * @param {string} [props.viewMode="grid"] - Layout type ("grid" or "list").
 * @param {function} props.onMessage - Callback for when the message button is clicked.
 */
const UserCard = ({ user, onLike, viewMode = "grid", onMessage }) => {
  const navigate = useNavigate();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  if (!user) return null;

  // Use a ref to store a function that returns the profile photo URL.
  const getProfilePhotoUrlRef = useRef(() => {
    if (!user || !user.photos || !user.photos.length) {
      return "/placeholder.svg";
    }
    const photoUrl = user.photos[0].url || user.profilePhoto;
    return normalizePhotoUrl(photoUrl);
  });

  // Update the ref when the user changes.
  useCallback(() => {
    getProfilePhotoUrlRef.current = () => {
      if (!user || !user.photos || !user.photos.length) {
        return "/placeholder.svg";
      }
      const photoUrl = user.photos[0].url || user.profilePhoto;
      return normalizePhotoUrl(photoUrl);
    };
  }, [user]);

  const getProfilePhotoUrl = getProfilePhotoUrlRef.current;

  // Declare handleCardClick only once for both layouts.
  const handleCardClick = () => {
    navigate(`/user/${user._id}`);
  };

  const handleLikeClick = (e) => {
    e.stopPropagation();
    if (onLike) onLike(user._id, user.nickname);
  };

  const handleMessageClick = (e) => {
    e.stopPropagation();
    if (onMessage) onMessage(user);
  };

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoaded(true); // Mark as loaded to remove placeholder
  };

  // Helper to get subtitle information
  const getSubtitle = () => {
    const parts = [];
    if (user.details?.age) parts.push(`${user.details.age}`);
    if (user.details?.location) parts.push(user.details.location);
    if (user.details?.iAm) parts.push(`I am a ${user.details.iAm}`);
    return parts.join(" • ");
  };

  // Render Grid View
  if (viewMode === "grid") {
    return (
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 h-full overflow-hidden border border-gray-200 dark:border-gray-700"
        onClick={handleCardClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Image container */}
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
          {/* Gradient overlay */}
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
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                {getSubtitle()}
              </p>
            </div>
          </div>
          {user.details?.bio && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-3">
              {user.details.bio}
            </p>
          )}
          {user.details?.lookingFor && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong>Looking for:</strong> {user.details.lookingFor.join(", ")}
            </p>
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
              {user.isLiked ? (
                <HeartIconSolid className="h-5 w-5" />
              ) : (
                <HeartIcon className="h-5 w-5" />
              )}
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
    );
  }

  // Render List View using the same handleCardClick defined above.
  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden cursor-pointer transition-all duration-300 ease-in-out transform hover:-translate-y-1"
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex flex-col sm:flex-row">
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
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300"
            style={{ opacity: isHovered ? 0.6 : 0 }}
          />
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
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-3 flex-grow">
              {user.details.bio}
            </p>
          )}
          {user.details?.lookingFor && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              <strong>Looking for:</strong> {user.details.lookingFor.join(", ")}
            </p>
          )}
          {user.details?.interests && (
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
              {user.isLiked ? (
                <HeartIconSolid className="h-5 w-5" />
              ) : (
                <HeartIcon className="h-5 w-5" />
              )}
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
  );
};

export default UserCard;

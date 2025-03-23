"use client"

import { useMemo } from "react"
import { useUser } from "../../context"
import "../../styles/stories.css"
import UserAvatar from "../UserAvatar" // Import your UserAvatar component

const StoryThumbnail = ({ story, onClick, hasUnviewedStories, user: propUser }) => {
  const { user: contextUser } = useUser()

  // Derive user object from story or props
  const storyUser = useMemo(() => {
    // If user is directly provided as prop, use it
    if (propUser) return propUser

    // Otherwise try to extract from story
    if (!story) return {}
    if (typeof story.user === "object") return story.user
    if (story.userData && typeof story.userData === "object") return story.userData
    if (typeof story.user === "string") return { _id: story.user }
    return {}
  }, [story, propUser])

  // Check if this story is viewed by the current user
  const isViewed = useMemo(() => {
    if (typeof hasUnviewedStories !== "undefined") {
      // If parent told us there are unviewed stories for this user, we trust that
      return !hasUnviewedStories
    }
    if (!contextUser || !contextUser._id || !story?.viewers) return false
    if (!Array.isArray(story.viewers)) return false
    return story.viewers.includes(contextUser._id)
  }, [hasUnviewedStories, contextUser, story])

  const getUserDisplayName = () => {
    if (!storyUser) return "Unknown User"
    return storyUser.nickname || storyUser.username || storyUser.name || "User"
  }

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (typeof onClick === "function") onClick()
  }

  if (!story && !propUser) return null

  // Get user ID for avatar
  const userId = storyUser._id
  // Try to get a direct avatar property
  const avatarSrc = storyUser.profilePicture || storyUser.avatar || null

  return (
    <div className="story-thumbnail" onClick={handleClick}>
      <div className={`story-avatar-border ${isViewed ? "viewed" : ""}`}>
        <div className="rounded-full overflow-hidden">
          <UserAvatar
            userId={userId}
            name={getUserDisplayName()}
            className="story-avatar rounded-full"
            src={avatarSrc}
            size={64} // Set a specific size that matches the story-avatar size
          />
        </div>
      </div>
      <div className="story-username">{getUserDisplayName()}</div>
    </div>
  )
}

export default StoryThumbnail

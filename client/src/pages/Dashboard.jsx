"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaSearch,
  FaHeart,
  FaUserCircle,
  FaMapMarkerAlt,
  FaComments,
  FaThLarge,
  FaList,
  FaFilter,
  FaPlus,
} from "react-icons/fa";
import { toast } from "react-toastify";
import { useAuth, useUser, useChat, useStories } from "../context";
import EmbeddedChat from "../components/EmbeddedChat";
import { Navbar } from "../components/LayoutComponents";
import StoriesCarousel from "../components/Stories/StoriesCarousel";
import StoriesViewer from "../components/Stories/StoriesViewer";
import StoryCreator from "../components/Stories/StoryCreator";
import UserProfileModal from "../components/UserProfileModal";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { users, getUsers, loading } = useUser();
  const { unreadMessages } = useChat();
  const { createStory } = useStories();
  const { likeUser, unlikeUser, isUserLiked } = useUser();

  const [activeTab, setActiveTab] = useState("discover");
  const [showFilters, setShowFilters] = useState(false);
  const [filterValues, setFilterValues] = useState({
    ageMin: 18,
    ageMax: 99,
    distance: 100,
    online: false,
    verified: false,
    withPhotos: false,
    interests: [],
  });

  // Chat, story, and profile modal state
  const [chatUser, setChatUser] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" or "list"
  const [imageLoadErrors, setImageLoadErrors] = useState({});
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [viewingStoryId, setViewingStoryId] = useState(null);
  const [creatingStory, setCreatingStory] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);

  // Reset image error for a specific user
  const handleImageError = useCallback((userId) => {
    setImageLoadErrors((prev) => ({ ...prev, [userId]: true }));
  }, []);

  // Fetch users on mount and refresh periodically when tab is visible.
  useEffect(() => {
    getUsers();

    const refreshInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        getUsers();
      }
    }, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        getUsers();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Close open chat when unmounting
      setShowChat(false);
      setChatUser(null);
    };
  }, [getUsers]);

  // Filter and sort users efficiently.
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (u._id === user?._id) return false;
      const userAge = u.details?.age || 25;
      if (userAge < filterValues.ageMin || userAge > filterValues.ageMax) return false;
      if (filterValues.online && !u.isOnline) return false;
      if (filterValues.withPhotos && (!u.photos || u.photos.length === 0)) return false;
      if (filterValues.interests.length > 0) {
        const userInterests = u.details?.interests || [];
        const hasMatch = filterValues.interests.some((i) => userInterests.includes(i));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [users, user, filterValues]);

  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      return new Date(b.lastActive) - new Date(a.lastActive);
    });
  }, [filteredUsers]);

  const availableInterests = [
    "Dating",
    "Casual",
    "Friendship",
    "Long-term",
    "Travel",
    "Outdoors",
    "Movies",
    "Music",
    "Fitness",
    "Food",
    "Art",
  ];

  const toggleInterest = (interest) => {
    setFilterValues((prev) => {
      if (prev.interests.includes(interest)) {
        return { ...prev, interests: prev.interests.filter((i) => i !== interest) };
      }
      return { ...prev, interests: [...prev.interests, interest] };
    });
  };

  // Open the user profile modal.
  const handleUserCardClick = (userId) => {
    setSelectedUserId(userId);
    setShowUserProfileModal(true);
  };

  // Open chat with a user.
  const handleMessageUser = (e, user) => {
    e.stopPropagation();
    setChatUser(user);
    setShowChat(true);
  };

  const closeChat = () => {
    setShowChat(false);
    setChatUser(null);
  };

  // Handle story creation ensuring no duplicate submissions.
  const handleCreateStory = (storyData) => {
    if (!createStory || creatingStory) {
      toast.info(creatingStory ? "Story creation in progress, please wait..." : "Story creation is not available right now");
      return;
    }
    setCreatingStory(true);
    createStory(storyData)
      .then((response) => {
        if (response.success) {
          toast.success("Your story has been created!");
          setShowStoryCreator(false);
        } else {
          throw new Error(response.message || "Failed to create story");
        }
      })
      .catch((error) => {
        toast.error("Failed to create story: " + (error.message || "Unknown error"));
      })
      .finally(() => {
        setCreatingStory(false);
      });
  };

  // Reset image errors when filter values change.
  useEffect(() => {
    setImageLoadErrors({});
  }, [filterValues]);

  // Check for unread messages from a given user.
  const hasUnreadMessagesFrom = useCallback(
    (userId) =>
      Array.isArray(unreadMessages) &&
      unreadMessages.some((msg) => msg.sender === userId),
    [unreadMessages]
  );

  const countUnreadMessages = useCallback(
    (userId) =>
      Array.isArray(unreadMessages)
        ? unreadMessages.filter((msg) => msg.sender === userId).length
        : 0,
    [unreadMessages]
  );

  // Reset filter values.
  const resetFilters = useCallback(() => {
    setFilterValues({
      ageMin: 18,
      ageMax: 99,
      distance: 100,
      online: false,
      verified: false,
      withPhotos: false,
      interests: [],
    });
  }, []);

  const handleLikeUser = (e, matchedUser) => {
    e.stopPropagation();
    isUserLiked(matchedUser._id)
      ? unlikeUser(matchedUser._id, matchedUser.nickname)
      : likeUser(matchedUser._id, matchedUser.nickname);
  };

  return (
    <div className="modern-dashboard">
      <Navbar />

      <main className="dashboard-content">
        <div className="container">
          {/* Stories Section */}
          <div className="stories-section">
            <div className="stories-header d-flex justify-content-between align-items-center mb-3">
              <h2>Stories</h2>
              <button
                className="btn btn-primary create-story-btn"
                onClick={() => !creatingStory && setShowStoryCreator(true)}
                aria-label="Create a new story"
                disabled={creatingStory}
              >
                <FaPlus className="me-2 d-none d-sm-inline" />
                <span className="d-none d-md-inline">
                  {creatingStory ? "Creating..." : "Create Story"}
                </span>
              </button>
            </div>
            <StoriesCarousel
              onStoryClick={(storyId) => {
                if (!viewingStoryId) {
                  setViewingStoryId(storyId);
                }
              }}
            />
          </div>

          {/* Content Header with Filters and View Toggle */}
          <div className="content-header d-flex justify-content-between align-items-center">
            <h1>{activeTab === "discover" ? "Discover People" : "Your Matches"}</h1>
            <div className="content-actions d-flex align-items-center gap-2">
              <div className="view-toggle d-none d-md-flex">
                <button
                  className={`view-toggle-btn ${viewMode === "grid" ? "active" : ""}`}
                  onClick={() => setViewMode("grid")}
                  title="Grid View"
                  aria-label="Grid view"
                >
                  <FaThLarge />
                </button>
                <button
                  className={`view-toggle-btn ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title="List View"
                  aria-label="List view"
                >
                  <FaList />
                </button>
              </div>
              <div
                className={`filter-button d-flex ${showFilters ? "active" : ""}`}
                onClick={() => setShowFilters(!showFilters)}
                role="button"
                tabIndex={0}
                aria-expanded={showFilters}
                aria-label="Toggle filters"
              >
                <FaFilter />
                <span className="d-none d-md-inline">Filters</span>
              </div>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="filter-panel animate-fade-in">
              <div className="filter-section">
                <h3>Age Range</h3>
                <div className="filter-options">
                  <div className="range-slider">
                    <div className="range-values">
                      <span>{filterValues.ageMin}</span>
                      <span>{filterValues.ageMax}</span>
                    </div>
                    <input
                      type="range"
                      min="18"
                      max="99"
                      value={filterValues.ageMin}
                      onChange={(e) =>
                        setFilterValues({
                          ...filterValues,
                          ageMin: Number.parseInt(e.target.value),
                        })
                      }
                      className="range-input"
                      aria-label="Minimum age"
                    />
                    <input
                      type="range"
                      min="18"
                      max="99"
                      value={filterValues.ageMax}
                      onChange={(e) =>
                        setFilterValues({
                          ...filterValues,
                          ageMax: Number.parseInt(e.target.value),
                        })
                      }
                      className="range-input"
                      aria-label="Maximum age"
                    />
                  </div>
                </div>
              </div>

              <div className="filter-section">
                <h3>Distance</h3>
                <div className="filter-options">
                  <div className="range-slider">
                    <div className="range-value">
                      <span>{filterValues.distance} km</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="100"
                      value={filterValues.distance}
                      onChange={(e) =>
                        setFilterValues({
                          ...filterValues,
                          distance: Number.parseInt(e.target.value),
                        })
                      }
                      className="range-input"
                      aria-label="Maximum distance"
                    />
                  </div>
                </div>
              </div>

              <div className="filter-section">
                <h3>Show Only</h3>
                <div className="filter-options d-flex flex-column">
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      checked={filterValues.online}
                      onChange={() =>
                        setFilterValues({
                          ...filterValues,
                          online: !filterValues.online,
                        })
                      }
                      aria-label="Show only online users"
                    />
                    <span>Online Now</span>
                  </label>
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      checked={filterValues.verified}
                      onChange={() =>
                        setFilterValues({
                          ...filterValues,
                          verified: !filterValues.verified,
                        })
                      }
                      aria-label="Show only verified profiles"
                    />
                    <span>Verified Profiles</span>
                  </label>
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      checked={filterValues.withPhotos}
                      onChange={() =>
                        setFilterValues({
                          ...filterValues,
                          withPhotos: !filterValues.withPhotos,
                        })
                      }
                      aria-label="Show only profiles with photos"
                    />
                    <span>With Photos</span>
                  </label>
                </div>
              </div>

              <div className="filter-section">
                <h3>Interests</h3>
                <div className="tags-container">
                  {availableInterests.map((interest) => (
                    <button
                      key={interest}
                      className={`filter-tag ${
                        filterValues.interests.includes(interest) ? "active" : ""
                      }`}
                      onClick={() => toggleInterest(interest)}
                      aria-pressed={filterValues.interests.includes(interest)}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-actions">
                <button
                  className="btn btn-outline"
                  onClick={resetFilters}
                  aria-label="Reset filters"
                >
                  Reset
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowFilters(false)}
                  aria-label="Apply filters"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          )}

          {/* Users Grid/List */}
          <div className={`users-${viewMode} mt-4 animate-fade-in`}>
            {loading ? (
              <div className="loading-container">
                <div className="spinner spinner-dark"></div>
                <p className="loading-text">Loading users...</p>
              </div>
            ) : sortedUsers.length > 0 ? (
              sortedUsers.map((matchedUser) => (
                <div
                  key={matchedUser._id}
                  className="user-card"
                  onClick={() => handleUserCardClick(matchedUser._id)}
                >
                  <div className="user-card-photo">
                    {matchedUser.photos && matchedUser.photos.length > 0 ? (
                      <>
                        <img
                          src={matchedUser.photos[0].url || "/placeholder.svg"}
                          alt={matchedUser.nickname}
                          onError={() => handleImageError(matchedUser._id)}
                          style={{
                            display: imageLoadErrors[matchedUser._id]
                              ? "none"
                              : "block",
                          }}
                        />
                        {imageLoadErrors[matchedUser._id] && (
                          <div className="avatar-placeholder">
                            <FaUserCircle />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="avatar-placeholder">
                        <FaUserCircle />
                      </div>
                    )}
                    {matchedUser.isOnline && (
                      <div className="online-indicator"></div>
                    )}
                  </div>
                  <div className="user-card-info">
                    <div className="d-flex justify-content-between align-items-center">
                      <h3>
                        {matchedUser.nickname}, {matchedUser.details?.age || "?"}
                      </h3>
                      {hasUnreadMessagesFrom(matchedUser._id) && (
                        <span className="unread-badge">
                          {countUnreadMessages(matchedUser._id)}
                        </span>
                      )}
                    </div>
                    <p className="location">
                      <FaMapMarkerAlt className="location-icon" />
                      {matchedUser.details?.location || "Unknown location"}
                    </p>
                    {matchedUser.details?.interests &&
                      matchedUser.details.interests.length > 0 && (
                        <div className="user-interests">
                          {matchedUser.details.interests.slice(0, 3).map(
                            (interest, idx) => (
                              <span key={idx} className="interest-tag">
                                {interest}
                              </span>
                            )
                          )}
                          {matchedUser.details.interests.length > 3 && (
                            <span className="interest-more">
                              +{matchedUser.details.interests.length - 3}
                            </span>
                          )}
                        </div>
                      )}
                    <div className="user-actions">
                      <button
                        className={`card-action-button like ${
                          isUserLiked(matchedUser._id) ? "active" : ""
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLikeUser(e, matchedUser);
                        }}
                        aria-label={`${
                          isUserLiked(matchedUser._id) ? "Unlike" : "Like"
                        } ${matchedUser.nickname}`}
                      >
                        <FaHeart />
                      </button>
                      <button
                        className="card-action-button message"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!showChat) handleMessageUser(e, matchedUser);
                        }}
                        aria-label={`Message ${matchedUser.nickname}`}
                      >
                        <FaComments />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-results">
                <div className="no-results-icon">
                  <FaSearch />
                </div>
                <h3>No matches found</h3>
                <p>Try adjusting your filters to see more people</p>
                <button
                  className="btn btn-primary mt-3"
                  onClick={resetFilters}
                  aria-label="Reset filters"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Embedded Chat */}
      {showChat && chatUser && (
        <>
          <div className="chat-overlay" onClick={closeChat}></div>
          <EmbeddedChat recipient={chatUser} isOpen={showChat} onClose={closeChat} />
        </>
      )}

      {/* Story Creator Modal */}
      {showStoryCreator && (
        <StoryCreator
          onClose={() => setShowStoryCreator(false)}
          onSubmit={handleCreateStory}
        />
      )}

      {/* Stories Viewer */}
      {viewingStoryId && (
        <StoriesViewer storyId={viewingStoryId} onClose={() => setViewingStoryId(null)} />
      )}

      {/* User Profile Modal */}
      {showUserProfileModal && (
        <UserProfileModal
          userId={selectedUserId}
          isOpen={showUserProfileModal}
          onClose={() => setShowUserProfileModal(false)}
        />
      )}

      <style>{`
        /* Dashboard-specific styles */
        .dashboard-content {
          padding-top: 20px;
        }
        @media (max-width: 768px) {
          .dashboard-content { padding-top: 10px; }
        }
        .create-story-btn {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          border-radius: 20px;
        }
        .create-story-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .card-action-button.like.active {
          color: #ff4b4b;
          background-color: rgba(255, 75, 75, 0.1);
        }
        .card-action-button.like:hover {
          background-color: rgba(255, 75, 75, 0.15);
        }
        .card-action-button.like.active:hover {
          background-color: rgba(255, 75, 75, 0.2);
        }
      `}</style>
    </div>
  );
};

export default Dashboard;

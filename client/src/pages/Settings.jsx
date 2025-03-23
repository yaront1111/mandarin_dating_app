

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FaBell, FaLock, FaPalette, FaSignOutAlt, FaTrash, FaUser, FaShieldAlt, FaSave, FaTimes } from "react-icons/fa"
import { toast } from "react-toastify"
import { useAuth, useTheme, useUser } from "../context"
import { settingsService } from "../services"
import { ThemeToggle } from "../components/theme-toggle.tsx"

const Settings = () => {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const { currentUser, updateProfile } = useUser()

  // State for settings
  const [settings, setSettings] = useState({
    notifications: {
      messages: true,
      calls: true,
      stories: true,
      likes: true,
      comments: true,
    },
    privacy: {
      showOnlineStatus: true,
      showReadReceipts: true,
      showLastSeen: true,
      allowStoryReplies: "everyone", // 'everyone', 'friends', 'none'
    },
  })

  // UI states
  const [activeTab, setActiveTab] = useState("notifications")
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteError, setDeleteError] = useState("")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Load user settings on component mount
  useEffect(() => {
    if (currentUser) {
      // Initialize settings from user data
      const userSettings = currentUser.settings || {}

      setSettings({
        notifications: {
          messages: userSettings.notifications?.messages ?? true,
          calls: userSettings.notifications?.calls ?? true,
          stories: userSettings.notifications?.stories ?? true,
          likes: userSettings.notifications?.likes ?? true,
          comments: userSettings.notifications?.comments ?? true,
        },
        privacy: {
          showOnlineStatus: userSettings.privacy?.showOnlineStatus ?? true,
          showReadReceipts: userSettings.privacy?.showReadReceipts ?? true,
          showLastSeen: userSettings.privacy?.showLastSeen ?? true,
          allowStoryReplies: userSettings.privacy?.allowStoryReplies ?? "everyone",
        },
      })
    }
  }, [currentUser])

  // Handle toggle change for boolean settings
  const handleToggleChange = (section, setting) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [setting]: !prev[section][setting],
      },
    }))
    setHasUnsavedChanges(true)
  }

  // Handle radio/select change for non-boolean settings
  const handleRadioChange = (section, setting, value) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [setting]: value,
      },
    }))
    setHasUnsavedChanges(true)
  }

  // Handle theme change
  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
  }

  // Save settings to backend
  const handleSaveSettings = async () => {
    try {
      setSaving(true)

      // Update settings via API
      await settingsService.updateSettings(settings)

      // Update user profile with new settings
      if (currentUser) {
        await updateProfile({ settings })
      }

      toast.success("Settings saved successfully")
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("Failed to save settings. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  // Handle user logout
  const handleLogout = () => {
    if (hasUnsavedChanges) {
      if (window.confirm("You have unsaved changes. Are you sure you want to log out?")) {
        logout()
        navigate("/login")
      }
    } else {
      logout()
      navigate("/login")
    }
  }

  // Show delete account confirmation
  const handleDeleteAccount = () => {
    setShowDeleteConfirmation(true)
  }

  // Confirm account deletion
  const confirmDeleteAccount = async () => {
    try {
      setDeleteError("")

      if (!deletePassword) {
        setDeleteError("Please enter your password to confirm account deletion")
        return
      }

      const response = await settingsService.deleteAccount({ password: deletePassword })

      if (response.success) {
        toast.success("Account deleted successfully")
        logout()
        navigate("/login")
      } else {
        setDeleteError(response.error || "Failed to delete account")
      }
    } catch (error) {
      console.error("Error deleting account:", error)
      setDeleteError(error.error || "Failed to delete account. Please try again.")
    }
  }

  // Cancel account deletion
  const cancelDeleteAccount = () => {
    setShowDeleteConfirmation(false)
    setDeletePassword("")
    setDeleteError("")
  }

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "notifications":
        return (
          <div className="settings-content">
            <div className="settings-option">
              <div className="option-text">
                <h3>Message Notifications</h3>
                <p>Get notified when you receive new messages</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.notifications.messages}
                  onChange={() => handleToggleChange("notifications", "messages")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Call Notifications</h3>
                <p>Get notified for incoming calls</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.notifications.calls}
                  onChange={() => handleToggleChange("notifications", "calls")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Story Notifications</h3>
                <p>Get notified when friends post new stories</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.notifications.stories}
                  onChange={() => handleToggleChange("notifications", "stories")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Like Notifications</h3>
                <p>Get notified when someone likes your content</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.notifications.likes}
                  onChange={() => handleToggleChange("notifications", "likes")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Comment Notifications</h3>
                <p>Get notified when someone comments on your content</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.notifications.comments}
                  onChange={() => handleToggleChange("notifications", "comments")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        )

      case "privacy":
        return (
          <div className="settings-content">
            <div className="settings-option">
              <div className="option-text">
                <h3>Online Status</h3>
                <p>Show when you're active on the app</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.privacy.showOnlineStatus}
                  onChange={() => handleToggleChange("privacy", "showOnlineStatus")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Read Receipts</h3>
                <p>Let others know when you've read their messages</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.privacy.showReadReceipts}
                  onChange={() => handleToggleChange("privacy", "showReadReceipts")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Last Seen</h3>
                <p>Show when you were last active</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.privacy.showLastSeen}
                  onChange={() => handleToggleChange("privacy", "showLastSeen")}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Story Replies</h3>
                <p>Control who can reply to your stories</p>
              </div>
              <div className="radio-options">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="storyReplies"
                    value="everyone"
                    checked={settings.privacy.allowStoryReplies === "everyone"}
                    onChange={() => handleRadioChange("privacy", "allowStoryReplies", "everyone")}
                  />
                  Everyone
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="storyReplies"
                    value="friends"
                    checked={settings.privacy.allowStoryReplies === "friends"}
                    onChange={() => handleRadioChange("privacy", "allowStoryReplies", "friends")}
                  />
                  Friends only
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="storyReplies"
                    value="none"
                    checked={settings.privacy.allowStoryReplies === "none"}
                    onChange={() => handleRadioChange("privacy", "allowStoryReplies", "none")}
                  />
                  No one
                </label>
              </div>
            </div>
          </div>
        )

      case "appearance":
        return (
          <div className="settings-content">
            <div className="settings-option">
              <div className="option-text">
                <h3>Theme</h3>
                <p>Choose your preferred app theme</p>
              </div>
              <div className="theme-options">
                <button
                  className={`theme-option ${theme === "light" ? "active" : ""}`}
                  onClick={() => handleThemeChange("light")}
                >
                  <div className="theme-preview light"></div>
                  <span>Light</span>
                </button>
                <button
                  className={`theme-option ${theme === "dark" ? "active" : ""}`}
                  onClick={() => handleThemeChange("dark")}
                >
                  <div className="theme-preview dark"></div>
                  <span>Dark</span>
                </button>
                <button
                  className={`theme-option ${theme === "system" ? "active" : ""}`}
                  onClick={() => handleThemeChange("system")}
                >
                  <div className="theme-preview system"></div>
                  <span>System</span>
                </button>
              </div>
            </div>

            <div className="settings-option">
              <div className="option-text">
                <h3>Quick Theme Toggle</h3>
                <p>Quickly switch between light and dark mode</p>
              </div>
              <ThemeToggle />
            </div>
          </div>
        )

      case "account":
        return (
          <div className="settings-content">
            <div className="account-info">
              <div className="account-detail">
                <strong>Username:</strong> {user?.username || "Not available"}
              </div>
              <div className="account-detail">
                <strong>Email:</strong> {user?.email || "Not available"}
              </div>
              <div className="account-detail">
                <strong>Member since:</strong>{" "}
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Not available"}
              </div>
              <div className="account-detail">
                <strong>Subscription:</strong> {user?.subscription?.plan || "Free"}
              </div>
            </div>

            <div className="account-actions">
              <button className="settings-action-button edit" onClick={() => navigate("/profile")}>
                <FaUser />
                <span>Edit Profile</span>
              </button>

              <button className="settings-action-button logout" onClick={handleLogout}>
                <FaSignOutAlt />
                <span>Log out</span>
              </button>

              <button className="settings-action-button delete" onClick={handleDeleteAccount}>
                <FaTrash />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <h1 className="settings-title">Settings</h1>

        {/* Settings navigation */}
        <div className="settings-navigation">
          <button
            className={`settings-nav-item ${activeTab === "notifications" ? "active" : ""}`}
            onClick={() => setActiveTab("notifications")}
          >
            <FaBell className="settings-icon" />
            <span>Notifications</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === "privacy" ? "active" : ""}`}
            onClick={() => setActiveTab("privacy")}
          >
            <FaLock className="settings-icon" />
            <span>Privacy</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === "appearance" ? "active" : ""}`}
            onClick={() => setActiveTab("appearance")}
          >
            <FaPalette className="settings-icon" />
            <span>Appearance</span>
          </button>

          <button
            className={`settings-nav-item ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            <FaUser className="settings-icon" />
            <span>Account</span>
          </button>
        </div>

        {/* Settings content */}
        <div className="settings-panel">
          <div className="settings-header">
            {activeTab === "notifications" && <FaBell className="settings-header-icon" />}
            {activeTab === "privacy" && <FaLock className="settings-header-icon" />}
            {activeTab === "appearance" && <FaPalette className="settings-header-icon" />}
            {activeTab === "account" && <FaUser className="settings-header-icon" />}

            <h2 className="settings-section-title">
              {activeTab === "notifications" && "Notification Settings"}
              {activeTab === "privacy" && "Privacy Settings"}
              {activeTab === "appearance" && "Appearance Settings"}
              {activeTab === "account" && "Account Settings"}
            </h2>
          </div>

          {renderTabContent()}

          {/* Save button - only show for tabs with settings that need saving */}
          {(activeTab === "notifications" || activeTab === "privacy") && (
            <div className="settings-save">
              <button
                className={`btn btn-primary save-button ${hasUnsavedChanges ? "has-changes" : ""}`}
                onClick={handleSaveSettings}
                disabled={saving || !hasUnsavedChanges}
              >
                <FaSave />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirmation && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <div className="modal-header">
              <h2>
                <FaTrash /> Delete Account
              </h2>
              <button className="close-button" onClick={cancelDeleteAccount}>
                <FaTimes />
              </button>
            </div>

            <div className="modal-content">
              <div className="warning-message">
                <FaShieldAlt className="warning-icon" />
                <p>
                  This action <strong>cannot be undone</strong>. All your data will be permanently deleted, including:
                </p>
                <ul>
                  <li>Your profile information</li>
                  <li>All messages and conversations</li>
                  <li>Photos and media you've shared</li>
                  <li>Stories and other content</li>
                </ul>
              </div>

              <div className="password-confirmation">
                <label htmlFor="delete-password">Enter your password to confirm:</label>
                <input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Your password"
                  className={deleteError ? "error" : ""}
                />
                {deleteError && <div className="error-message">{deleteError}</div>}
              </div>
            </div>

            <div className="confirmation-actions">
              <button className="btn btn-secondary" onClick={cancelDeleteAccount}>
                <FaTimes /> Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDeleteAccount} disabled={!deletePassword}>
                <FaTrash /> Delete My Account
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Settings

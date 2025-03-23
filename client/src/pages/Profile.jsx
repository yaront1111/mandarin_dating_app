"use client"

// client/src/pages/Profile.js
import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth, useUser } from "../context"
import { toast } from "react-toastify"
import axios from "axios"
import {
  FaUserCircle,
  FaCamera,
  FaLock,
  FaLockOpen,
  FaStar,
  FaTrash,
  FaEdit,
  FaTimes,
  FaCheck,
  FaExclamationTriangle,
} from "react-icons/fa"
import { ThemeToggle } from "../components/theme-toggle.tsx"

// Import the normalizePhotoUrl utility
import { normalizePhotoUrl } from "../utils/index.js"

const Profile = () => {
  const { user } = useAuth()
  const { updateProfile, uploadPhoto, refreshUserData } = useUser()

  const [isEditing, setIsEditing] = useState(false)
  const [profileData, setProfileData] = useState({
    nickname: "",
    details: {
      age: "",
      gender: "",
      location: "",
      bio: "",
      interests: [],
      // Change back to iAm
      iAm: "",
      lookingFor: [],
      intoTags: [],
      turnOns: [],
      maritalStatus: "",
    },
  })
  const [localPhotos, setLocalPhotos] = useState([])
  const [profilePhotoIndex, setProfilePhotoIndex] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false)
  const [availableInterests] = useState([
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
    "Reading",
    "Gaming",
    "Photography",
    "Dancing",
    "Cooking",
  ])
  const [iAmOptions] = useState(["woman", "man", "couple"])
  const [lookingForOptions] = useState(["women", "men", "couples"])
  const [intoTagsOptions] = useState([
    "Meetups",
    "Power play",
    "Threesomes",
    "Online fun",
    "Hot chat",
    "Photo sharing",
    "Camera chat",
    "Cuckold",
    "Golden showers",
    "Strap-on",
    "Forced bi",
    "Erotic domination",
    "Humiliation",
    "Crossdressing",
    "Worship",
    "Foot fetish",
    "Oral",
    "From behind",
    "Role-play",
    "Toys",
    "Massages",
    "Foreplay",
    "Casual meetups",
    "Fantasy fulfillment",
    "Bizarre",
    "Education",
    "Experiences",
    "Tantra",
  ])
  const [turnOnsOptions] = useState([
    "Sexy ass",
    "Dirty talk",
    "Aggressive",
    "Slow and gentle",
    "In a public place",
    "Pampering",
    "Sexy clothing",
    "Leather/latex clothing",
    "Watching porn",
    "Fit body",
    "Bathing together",
    "Erotic writing",
    "Eye contact",
    "Being pampered",
    "Sexy legs",
    "Teasing",
    "Pushing boundaries",
  ])
  const [maritalStatusOptions] = useState([
    "Single",
    "Married",
    "Divorced",
    "Separated",
    "Widowed",
    "In a relationship",
    "It's complicated",
    "Open relationship",
    "Polyamorous",
  ])
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  // New states for loading
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(null)
  const [userId, setUserId] = useState(null) // Assuming you might want to view other profiles
  const [likeLoading, setLikeLoading] = useState(false)
  const [messageLoading, setMessageLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [photoLoading, setPhotoLoading] = useState({})

  const isOwnProfile = !userId // Determine if it's the logged-in user's profile

  // Initialize profile state from user data.
  useEffect(() => {
    setIsLoading(true)
    if (user) {
      setProfileData({
        nickname: user.nickname || "",
        details: {
          age: user.details?.age || "",
          gender: user.details?.gender || "",
          location: user.details?.location || "",
          bio: user.details?.bio || "",
          interests: user.details?.interests || [],
          // Change back to iAm
          iAm: user.details?.iAm || "",
          lookingFor: user.details?.lookingFor || [],
          intoTags: user.details?.intoTags || [],
          turnOns: user.details?.turnOns || [],
          maritalStatus: user.details?.maritalStatus || "",
        },
      })

      if (user.photos && user.photos.length > 0) {
        const photos = user.photos.map((photo) => ({
          ...photo,
          isPrivate: photo.isPrivate ?? false,
          isProfile: false,
        }))
        if (photos.length > 0) {
          photos[0].isProfile = true
          setProfilePhotoIndex(0)
        }
        setLocalPhotos(photos)
      } else {
        setLocalPhotos([])
        setProfilePhotoIndex(-1)
      }
    }
    setIsLoading(false)
  }, [user])

  // Add a mounted ref to prevent state updates after component unmount
  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Cleanup file input on unmount to prevent lingering file references.
  useEffect(() => {
    return () => {
      if (fileInputRef.current) {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        fileInputRef.current.value = ""
      }
    }
  }, [])

  const [formData, setFormData] = useState({
    nickname: "",
    details: {
      age: "",
      gender: "",
      location: "",
      bio: "",
      interests: [],
    },
  })

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target

    // For checkbox inputs, use the checked property
    if (type === "checkbox") {
      setProfileData({ ...profileData, [name]: checked })
    }
    // For number inputs, ensure valid numbers
    else if (type === "number") {
      // Allow empty string or valid numbers
      if (value === "" || !isNaN(Number.parseInt(value))) {
        if (name.includes("details.")) {
          const fieldName = name.split(".")[1]
          setProfileData({
            ...profileData,
            details: {
              ...profileData.details,
              [fieldName]: value,
            },
          })
        } else {
          setProfileData({ ...profileData, [name]: value })
        }
      }
    }
    // For all other inputs
    else {
      if (name.includes("details.")) {
        const fieldName = name.split(".")[1]
        setProfileData({
          ...profileData,
          details: {
            ...profileData.details,
            [fieldName]: value,
          },
        })
      } else {
        setProfileData({ ...profileData, [name]: value })
      }
    }

    // Clear the error for this field if it exists
    if (errors[name.split(".").pop()]) {
      setErrors((prev) => {
        const newErrors = { ...prev }
        delete newErrors[name.split(".").pop()]
        return newErrors
      })
    }
  }

  const toggleInterest = (interest) => {
    const interests = profileData.details.interests
    if (!interests.includes(interest) && interests.length >= 10) {
      toast.warning("You can select up to 10 interests")
      return
    }
    const updated = interests.includes(interest) ? interests.filter((i) => i !== interest) : [...interests, interest]
    setProfileData((prev) => ({
      ...prev,
      details: { ...prev.details, interests: updated },
    }))
  }

  const handleIAmSelection = (option) => {
    setProfileData((prev) => ({
      ...prev,
      details: { ...prev.details, iAm: prev.details.iAm === option ? "" : option },
    }))
  }

  const toggleLookingFor = (option) => {
    const lookingFor = profileData.details.lookingFor
    let updated

    if (lookingFor.includes(option)) {
      updated = lookingFor.filter((item) => item !== option)
    } else {
      if (lookingFor.length >= 3) {
        toast.warning("You can select up to 3 options")
        return
      }
      updated = [...lookingFor, option]
    }

    setProfileData((prev) => ({
      ...prev,
      details: { ...prev.details, lookingFor: updated },
    }))
  }

  const toggleIntoTag = (tag) => {
    const intoTags = profileData.details.intoTags

    if (!intoTags.includes(tag) && intoTags.length >= 20) {
      toast.warning("You can select up to 20 'I'm into' tags")
      return
    }

    const updated = intoTags.includes(tag) ? intoTags.filter((t) => t !== tag) : [...intoTags, tag]

    setProfileData((prev) => ({
      ...prev,
      details: { ...prev.details, intoTags: updated },
    }))
  }

  const toggleTurnOn = (tag) => {
    const turnOns = profileData.details.turnOns

    if (!turnOns.includes(tag) && turnOns.length >= 20) {
      toast.warning("You can select up to 20 'Turn ons' tags")
      return
    }

    const updated = turnOns.includes(tag) ? turnOns.filter((t) => t !== tag) : [...turnOns, tag]

    setProfileData((prev) => ({
      ...prev,
      details: { ...prev.details, turnOns: updated },
    }))
  }

  const handleMaritalStatusSelection = (status) => {
    setProfileData((prev) => ({
      ...prev,
      details: { ...prev.details, maritalStatus: prev.details.maritalStatus === status ? "" : status },
    }))
  }

  const validateForm = () => {
    const validationErrors = {}
    if (!profileData.nickname.trim()) {
      validationErrors.nickname = "Nickname is required"
    } else if (profileData.nickname.length < 3) {
      validationErrors.nickname = "Nickname must be at least 3 characters"
    } else if (profileData.nickname.length > 50) {
      validationErrors.nickname = "Nickname cannot exceed 50 characters"
    }
    if (!profileData.details.age && profileData.details.age !== 0) {
      validationErrors.age = "Age is required"
    } else if (isNaN(profileData.details.age)) {
      validationErrors.age = "Age must be a number"
    } else if (profileData.details.age < 18) {
      validationErrors.age = "You must be at least 18 years old"
    } else if (profileData.details.age > 120) {
      validationErrors.age = "Please enter a valid age"
    }
    if (!profileData.details.location.trim()) {
      validationErrors.location = "Location is required"
    } else if (profileData.details.location.length < 2) {
      validationErrors.location = "Location must be at least 2 characters"
    }
    if (profileData.details.bio && profileData.details.bio.length > 500) {
      validationErrors.bio = "Bio cannot exceed 500 characters"
    }
    return validationErrors
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const validationErrors = validateForm()
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      const firstErrorElement = document.querySelector(".error-message")
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: "smooth", block: "center" })
      }
      return
    }
    setErrors({})
    setIsSubmitting(true)
    try {
      const submissionData = {
        nickname: profileData.nickname.trim(),
        details: {
          ...profileData.details,
          age: Number(profileData.details.age),
          location: profileData.details.location.trim(),
          bio: profileData.details.bio ? profileData.details.bio.trim() : "",
          interests: Array.isArray(profileData.details.interests) ? profileData.details.interests : [],
          // Change back to iAm
          iAm: profileData.details.iAm || "",
          lookingFor: Array.isArray(profileData.details.lookingFor) ? profileData.details.lookingFor : [],
          intoTags: Array.isArray(profileData.details.intoTags) ? profileData.details.intoTags : [],
          turnOns: Array.isArray(profileData.details.turnOns) ? profileData.details.turnOns : [],
          maritalStatus: profileData.details.maritalStatus || "",
        },
      }
      console.log("Submitting profile data:", submissionData)
      const updatedUser = await updateProfile(submissionData)
      if (updatedUser) {
        toast.success("Profile updated successfully")
        setIsEditing(false)
      } else {
        throw new Error("Failed to update profile")
      }
    } catch (error) {
      console.error("Failed to update profile:", error)
      toast.error(error.message || "Failed to update profile. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Update the handlePhotoUpload function to fix race conditions and memory leaks
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const fileType = file.type.split("/")[0]
    if (fileType !== "image") {
      toast.error("Please upload an image file")
      return
    }
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      toast.error("Image size should be less than 5MB")
      return
    }
    setIsUploading(true)
    setUploadProgress(0)

    // Create a temporary ID for this upload
    const tempId = `temp-${Date.now()}`

    // Add a temporary photo with loading state
    setLocalPhotos((prev) => [
      ...prev,
      {
        _id: tempId,
        url: URL.createObjectURL(file),
        isPrivate: false,
        isProfile: false,
        isLoading: true,
      },
    ])

    try {
      const newPhoto = await uploadPhoto(file, false, (progress) => {
        setUploadProgress(progress)
      })

      if (newPhoto) {
        toast.success("Photo uploaded successfully")

        // Clean up temporary photo before refreshing data
        setLocalPhotos((prev) => prev.filter((photo) => photo._id !== tempId))

        // Refresh user data to get the updated photos
        await refreshUserData()

        // Reset upload progress and file input
        setUploadProgress(0)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      } else {
        throw new Error("Failed to upload photo")
      }
    } catch (error) {
      console.error("Failed to upload photo:", error)
      toast.error(error.message || "Failed to upload photo. Please try again.")

      // Remove the temporary photo on error
      setLocalPhotos((prev) => prev.filter((photo) => photo._id !== tempId))
    } finally {
      setIsUploading(false)
    }
  }
  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleTogglePhotoPrivacy = async (photoId, e) => {
    e?.stopPropagation()
    if (isProcessingPhoto) return

    // Check if this is a temporary photo
    if (photoId.toString().startsWith("temp-")) {
      toast.warning("Please wait for the upload to complete before changing privacy settings")
      return
    }

    const photoIndex = localPhotos.findIndex((p) => p._id === photoId)
    if (photoIndex === -1) return
    const newPrivacyValue = !localPhotos[photoIndex].isPrivate
    setLocalPhotos((prev) =>
      prev.map((photo) => (photo._id === photoId ? { ...photo, isPrivate: newPrivacyValue } : photo)),
    )
    setIsProcessingPhoto(true)
    try {
      const response = await fetch(`/api/users/photos/${photoId}/privacy`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        },
        body: JSON.stringify({ isPrivate: newPrivacyValue }),
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to update photo privacy")
      }
      toast.success(`Photo is now ${newPrivacyValue ? "private" : "public"}`)
      await refreshUserData()
    } catch (error) {
      console.error("Failed to update photo privacy:", error)
      toast.error(error.message || "Failed to update privacy setting")
      setLocalPhotos((prev) =>
        prev.map((photo) => (photo._id === photoId ? { ...photo, isPrivate: !newPrivacyValue } : photo)),
      )
    } finally {
      setIsProcessingPhoto(false)
    }
  }

  const handleSetProfilePhoto = async (photoId) => {
    if (isProcessingPhoto) return

    // Check if this is a temporary photo
    if (photoId.toString().startsWith("temp-")) {
      toast.warning("Please wait for the upload to complete before setting as profile photo")
      return
    }

    const photoIndex = localPhotos.findIndex((p) => p._id === photoId)
    if (photoIndex === -1) return
    if (profilePhotoIndex === photoIndex) return

    setProfilePhotoIndex(photoIndex)
    setLocalPhotos((prev) =>
      prev.map((photo, index) => ({
        ...photo,
        isProfile: index === photoIndex,
      })),
    )
    setIsProcessingPhoto(true)
    try {
      const response = await fetch(`/api/users/photos/${photoId}/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        },
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to set profile photo")
      }
      toast.success("Profile photo updated")
      await refreshUserData()
    } catch (error) {
      console.error("Failed to set profile photo:", error)
      toast.error(error.message || "Failed to set profile photo")
      const oldProfileIndex = localPhotos.findIndex((p) => p.isProfile)
      if (oldProfileIndex !== -1) {
        setProfilePhotoIndex(oldProfileIndex)
        setLocalPhotos((prev) =>
          prev.map((photo, index) => ({
            ...photo,
            isProfile: index === oldProfileIndex,
          })),
        )
      }
    } finally {
      setIsProcessingPhoto(false)
    }
  }

  const handleDeletePhoto = async (photoId, e) => {
    e?.stopPropagation()
    if (isProcessingPhoto) return

    // Check if this is a temporary photo
    if (photoId.toString().startsWith("temp-")) {
      // For temporary photos, just remove them from the local state
      setLocalPhotos((prev) => prev.filter((photo) => photo._id !== photoId))
      return
    }

    if (!window.confirm("Are you sure you want to delete this photo?")) return
    const photoIndex = localPhotos.findIndex((p) => p._id === photoId)
    if (photoIndex === -1) return
    if (localPhotos.length === 1) {
      toast.error("You cannot delete your only photo")
      return
    }
    if (localPhotos[photoIndex].isProfile) {
      toast.error("You cannot delete your profile photo. Please set another photo as profile first.")
      return
    }
    const updatedPhotos = localPhotos.filter((photo) => photo._id !== photoId)
    setLocalPhotos(updatedPhotos)
    if (photoIndex < profilePhotoIndex) {
      setProfilePhotoIndex(profilePhotoIndex - 1)
    }
    setIsProcessingPhoto(true)
    try {
      const response = await fetch(`/api/users/photos/${photoId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem("token")}`,
        },
      })
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to delete photo")
      }
      toast.success("Photo deleted")
      await refreshUserData()
    } catch (error) {
      console.error("Failed to delete photo:", error)
      toast.error(error.message || "Failed to delete photo")
      await refreshUserData()
    } finally {
      setIsProcessingPhoto(false)
    }
  }

  const handleCancelEdit = () => {
    if (user) {
      setProfileData({
        nickname: user.nickname || "",
        details: {
          age: user.details?.age || "",
          gender: user.details?.gender || "",
          location: user.details?.location || "",
          bio: user.details?.bio || "",
          interests: user.details?.interests || [],
          iAm: user.details?.iAm || "",
          lookingFor: user.details?.lookingFor || [],
          intoTags: user.details?.intoTags || [],
          turnOns: user.details?.turnOns || [],
          maritalStatus: user.details?.maritalStatus || "",
        },
      })
    }
    setErrors({})
    setIsEditing(false)
  }

  // Find where profile data is being loaded
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const token = sessionStorage.getItem("token")
        if (!token) {
          setError("Authentication required")
          setLoading(false)
          return
        }

        // Use the correct endpoint based on your API routes
        // If viewing own profile, use the current user endpoint
        const endpoint = userId ? `/api/users/${userId}` : `/api/users`

        const response = await axios.get(endpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        setProfile(response.data)
      } catch (error) {
        console.error("Failed to fetch profile:", error)
        setError("Could not load profile data")
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [userId])

  const handleLike = async () => {
    setLikeLoading(true)
    try {
      // Implement your like/unlike logic here
      // Example: await axios.post(`/api/users/${userId}/like`);
      // Update the profile state accordingly
      setProfile((prevProfile) => ({
        ...prevProfile,
        isLiked: !prevProfile.isLiked,
      }))
    } catch (error) {
      console.error("Failed to like/unlike profile:", error)
      toast.error("Failed to like/unlike profile")
    } finally {
      setLikeLoading(false)
    }
  }

  const handleMessage = async () => {
    setMessageLoading(true)
    try {
      // Implement your message logic here
      // Example: navigate(`/messages/${userId}`);
      navigate("/messages") // Redirect to messages for now
    } catch (error) {
      console.error("Failed to navigate to messages:", error)
      toast.error("Failed to navigate to messages")
    } finally {
      setMessageLoading(false)
    }
  }

  const handleProfilePhotoUpload = () => {
    // Implement your profile photo upload logic here
    console.log("Profile photo upload clicked")
  }

  const handleCoverPhotoUpload = () => {
    // Implement your cover photo upload logic here
    console.log("Cover photo upload clicked")
  }

  // Update the getProfilePhoto function to use the normalizePhotoUrl utility
  const getProfilePhoto = () => {
    if (!user || !user.photos || user.photos.length === 0) {
      return "/placeholder.svg"
    }
    return normalizePhotoUrl(user.photos[0].url)
  }

  // Replace the profile rendering with this
  return (
    <div className="modern-dashboard">
      {/* Header */}
      <header className="modern-header">
        <div className="container d-flex justify-content-between align-items-center">
          <div className="logo" style={{ cursor: "pointer" }} onClick={() => navigate("/dashboard")}>
            Mandarin
          </div>
          <div className="d-none d-md-flex main-tabs">
            <button className="tab-button" onClick={() => navigate("/dashboard")}>
              Dashboard
            </button>
            <button className="tab-button" onClick={() => navigate("/messages")}>
              Messages
            </button>
          </div>
          <div className="header-actions d-flex align-items-center">
            <ThemeToggle />
            {user?.photos?.[0] ? (
              <img
                src={user.photos[0].url || "/placeholder.svg?height=32&width=32"}
                alt={user.nickname}
                className="user-avatar"
                onClick={() => navigate("/profile")}
              />
            ) : (
              <FaUserCircle className="user-avatar" style={{ fontSize: "32px" }} onClick={() => navigate("/profile")} />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-content">
        <div className="container" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          {isLoading ? (
            <div className="text-center py-5">
              <div className="spinner spinner-large"></div>
              <p className="mt-3">Loading your profile...</p>
            </div>
          ) : (
            <>
              {/* Profile Photo Section */}
              <div className="profile-photo-section text-center">
                {localPhotos.length > 0 && profilePhotoIndex >= 0 ? (
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <img
                      src={localPhotos[profilePhotoIndex].url || "/placeholder.svg?height=200&width=200"}
                      alt="Profile"
                      style={{
                        width: "200px",
                        height: "200px",
                        objectFit: "cover",
                        borderRadius: "50%",
                        boxShadow: "0 6px 16px rgba(0, 0, 0, 0.1)",
                        transition: "transform 0.3s ease",
                      }}
                      onLoad={() => {
                        // Clear loading state when image loads
                        if (localPhotos[profilePhotoIndex]?.isLoading) {
                          setLocalPhotos((prev) =>
                            prev.map((photo, idx) =>
                              idx === profilePhotoIndex ? { ...photo, isLoading: false } : photo,
                            ),
                          )
                        }
                      }}
                    />
                    {localPhotos[profilePhotoIndex]?.isLoading && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.7)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <div className="spinner"></div>
                      </div>
                    )}
                    {localPhotos[profilePhotoIndex].isPrivate && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: "100%",
                          borderRadius: "50%",
                          background: "rgba(0,0,0,0.4)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <FaLock style={{ fontSize: "32px", color: "#fff" }} />
                      </div>
                    )}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "0",
                        left: "0",
                        width: "100%",
                        background: "rgba(0,0,0,0.6)",
                        color: "white",
                        padding: "4px",
                        fontSize: "12px",
                      }}
                    >
                      Profile Photo
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      width: "200px",
                      height: "200px",
                      borderRadius: "50%",
                      background: "#f0f0f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto",
                    }}
                  >
                    <FaUserCircle style={{ fontSize: "80px", color: "#ccc" }} />
                  </div>
                )}

                {/* Photo Upload */}
                <div style={{ marginTop: "16px" }}>
                  {isUploading ? (
                    <div className="upload-progress-container" style={{ width: "200px", margin: "0 auto" }}>
                      <div className="progress mb-2" style={{ height: "8px" }}>
                        <div
                          className="progress-bar bg-primary"
                          role="progressbar"
                          style={{ width: `${uploadProgress}%` }}
                          aria-valuenow={uploadProgress}
                          aria-valuemin="0"
                          aria-valuemax="100"
                        ></div>
                      </div>
                      <div className="text-center">Uploading... {uploadProgress}%</div>
                    </div>
                  ) : (
                    <button
                      className="btn btn-outline"
                      onClick={triggerFileInput}
                      disabled={isProcessingPhoto}
                      aria-label="Add photo"
                    >
                      <FaCamera style={{ marginRight: "4px" }} /> Add Photo
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        accept="image/*"
                        style={{ display: "none" }}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Photo Gallery Section - Now with responsive grid */}
              {localPhotos.length > 0 && (
                <div
                  className="photo-gallery"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                    gap: "16px",
                  }}
                >
                  {localPhotos.map((photo) => (
                    <div
                      key={photo._id}
                      className="gallery-item"
                      style={{
                        position: "relative",
                        cursor: photo._id.toString().startsWith("temp-") ? "not-allowed" : "pointer",
                        border: photo.isProfile ? "2px solid var(--primary)" : "2px solid transparent",
                        borderRadius: "8px",
                        overflow: "hidden",
                        transition: "transform 0.3s ease",
                        height: "100px",
                      }}
                      onClick={() => handleSetProfilePhoto(photo._id)}
                    >
                      <img
                        src={photo.url || "/placeholder.svg?height=100&width=100"}
                        alt={`Gallery`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      {photo.isLoading && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            background: "rgba(255,255,255,0.7)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <div className="spinner spinner-small"></div>
                        </div>
                      )}
                      {photo._id.toString().startsWith("temp-") && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            background: "rgba(0,0,0,0.3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            fontSize: "10px",
                            textAlign: "center",
                            padding: "4px",
                          }}
                        >
                          Uploading...
                        </div>
                      )}
                      <div
                        className="photo-controls"
                        style={{
                          position: "absolute",
                          bottom: "0",
                          left: "0",
                          right: "0",
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "4px",
                          background: "rgba(0,0,0,0.5)",
                        }}
                      >
                        <button
                          onClick={(e) => handleTogglePhotoPrivacy(photo._id, e)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "white",
                            cursor: photo._id.toString().startsWith("temp-") ? "not-allowed" : "pointer",
                            padding: "2px",
                          }}
                          title={photo.isPrivate ? "Make public" : "Make private"}
                          disabled={isProcessingPhoto || photo.isLoading || photo._id.toString().startsWith("temp-")}
                          aria-label={photo.isPrivate ? "Make photo public" : "Make photo private"}
                        >
                          {photo.isPrivate ? (
                            <FaLock style={{ fontSize: "14px" }} />
                          ) : (
                            <FaLockOpen style={{ fontSize: "14px" }} />
                          )}
                        </button>
                        {!photo.isProfile && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSetProfilePhoto(photo._id)
                            }}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "white",
                              cursor: photo._id.toString().startsWith("temp-") ? "not-allowed" : "pointer",
                              padding: "2px",
                            }}
                            title="Set as profile photo"
                            disabled={isProcessingPhoto || photo.isLoading || photo._id.toString().startsWith("temp-")}
                            aria-label="Set as profile photo"
                          >
                            <FaStar style={{ fontSize: "14px" }} />
                          </button>
                        )}
                        {!photo.isProfile && (
                          <button
                            onClick={(e) => handleDeletePhoto(photo._id, e)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "white",
                              cursor: "pointer",
                              padding: "2px",
                            }}
                            title="Delete photo"
                            disabled={isProcessingPhoto || photo.isLoading}
                            aria-label="Delete photo"
                          >
                            <FaTrash style={{ fontSize: "14px" }} />
                          </button>
                        )}
                      </div>
                      {photo.isProfile && (
                        <div
                          style={{
                            position: "absolute",
                            top: "0",
                            left: "0",
                            background: "var(--primary)",
                            color: "white",
                            fontSize: "10px",
                            padding: "2px 4px",
                            borderBottomRightRadius: "4px",
                          }}
                        >
                          Profile
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="gallery-item add"
                    onClick={triggerFileInput}
                    disabled={isUploading || isProcessingPhoto}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: "#eaeaea",
                      border: "2px dashed #ccc",
                      borderRadius: "8px",
                      cursor: "pointer",
                      height: "100px",
                    }}
                    aria-label="Add new photo"
                  >
                    <FaCamera style={{ fontSize: "24px", color: "#555" }} />
                  </button>
                </div>
              )}

              {/* Profile Information Section - Now with better responsive layout */}
              <div className="profile-info">
                <div className="profile-header d-flex justify-content-between align-items-center flex-wrap">
                  <h2>My Profile</h2>
                  {!isEditing ? (
                    <button className="btn btn-primary" onClick={() => setIsEditing(true)} aria-label="Edit profile">
                      <FaEdit /> Edit
                    </button>
                  ) : (
                    <div className="d-flex" style={{ gap: "8px" }}>
                      <button
                        className="btn btn-outline"
                        onClick={handleCancelEdit}
                        disabled={isSubmitting}
                        aria-label="Cancel editing"
                      >
                        <FaTimes /> Cancel
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        aria-label="Save profile changes"
                      >
                        {isSubmitting ? (
                          <>
                            <span className="spinner spinner-dark"></span>
                            <span style={{ marginLeft: "8px" }}>Saving...</span>
                          </>
                        ) : (
                          <>
                            <FaCheck /> Save
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <form className="mt-4" onSubmit={handleSubmit}>
                  <div className="info-section">
                    <h3>Basic Information</h3>
                    <div
                      className="info-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                        gap: "16px",
                      }}
                    >
                      <div className="form-group">
                        <label className="form-label" htmlFor="nickname">
                          Nickname
                        </label>
                        <input
                          type="text"
                          id="nickname"
                          name="nickname"
                          className={`form-control ${errors.nickname ? "border-danger" : ""}`}
                          value={profileData.nickname}
                          onChange={handleChange}
                          disabled={!isEditing}
                          maxLength={50}
                          aria-invalid={errors.nickname ? "true" : "false"}
                          aria-describedby={errors.nickname ? "nickname-error" : undefined}
                        />
                        {errors.nickname && (
                          <p id="nickname-error" className="error-message" style={{ color: "red", marginTop: "4px" }}>
                            <FaExclamationTriangle style={{ marginRight: "4px" }} />
                            {errors.nickname}
                          </p>
                        )}
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="details.age">
                          Age
                        </label>
                        <input
                          type="number"
                          id="details.age"
                          name="details.age"
                          className={`form-control ${errors.age ? "border-danger" : ""}`}
                          value={profileData.details.age}
                          onChange={handleChange}
                          disabled={!isEditing}
                          min="18"
                          max="120"
                          aria-invalid={errors.age ? "true" : "false"}
                          aria-describedby={errors.age ? "age-error" : undefined}
                        />
                        {errors.age && (
                          <p id="age-error" className="error-message" style={{ color: "red", marginTop: "4px" }}>
                            <FaExclamationTriangle style={{ marginRight: "4px" }} />
                            {errors.age}
                          </p>
                        )}
                      </div>
                      <div className="form-group">
                        <label className="form-label" htmlFor="details.location">
                          Location
                        </label>
                        <input
                          type="text"
                          id="details.location"
                          name="details.location"
                          className={`form-control ${errors.location ? "border-danger" : ""}`}
                          value={profileData.details.location}
                          onChange={handleChange}
                          disabled={!isEditing}
                          maxLength={100}
                          aria-invalid={errors.location ? "true" : "false"}
                          aria-describedby={errors.location ? "location-error" : undefined}
                        />
                        {errors.location && (
                          <p id="location-error" className="error-message" style={{ color: "red", marginTop: "4px" }}>
                            <FaExclamationTriangle style={{ marginRight: "4px" }} />
                            {errors.location}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="info-section">
                    <h3>About Me</h3>
                    <textarea
                      name="details.bio"
                      rows="4"
                      className={`form-control ${errors.bio ? "border-danger" : ""}`}
                      value={profileData.details.bio || ""}
                      onChange={handleChange}
                      disabled={!isEditing}
                      style={{ resize: "vertical" }}
                      maxLength={500}
                      placeholder={isEditing ? "Tell others about yourself..." : "No bio provided"}
                      aria-invalid={errors.bio ? "true" : "false"}
                      aria-describedby={errors.bio ? "bio-error" : undefined}
                    />
                    {errors.bio && (
                      <p id="bio-error" className="error-message" style={{ color: "red", marginTop: "4px" }}>
                        <FaExclamationTriangle style={{ marginRight: "4px" }} />
                        {errors.bio}
                      </p>
                    )}
                    {isEditing && (
                      <div className="text-muted mt-1" style={{ fontSize: "0.8rem", textAlign: "right" }}>
                        {profileData.details.bio ? profileData.details.bio.length : 0}/500
                      </div>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>Interests</h3>
                    {isEditing && (
                      <div className="text-muted mb-2" style={{ fontSize: "0.8rem" }}>
                        Select up to 10 interests
                      </div>
                    )}
                    <div className="interests-tags" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {availableInterests.map((interest) => {
                        const isSelected = profileData.details.interests.includes(interest)
                        return (
                          <button
                            key={interest}
                            type="button"
                            className={`interest-tag ${isSelected ? "selected" : ""}`}
                            onClick={() => isEditing && toggleInterest(interest)}
                            disabled={!isEditing || (!isSelected && profileData.details.interests.length >= 10)}
                            style={{
                              padding: "4px 12px",
                              borderRadius: "20px",
                              backgroundColor: isSelected ? "var(--primary)" : "var(--light)",
                              color: isSelected ? "#fff" : "var(--text-medium)",
                              border: "none",
                              cursor: isEditing ? "pointer" : "default",
                              transition: "all 0.3s ease",
                            }}
                            aria-pressed={isSelected}
                            aria-label={`Interest: ${interest}`}
                          >
                            {interest}
                            {isSelected && <FaCheck style={{ marginLeft: "4px" }} />}
                          </button>
                        )
                      })}
                    </div>
                    {profileData.details.interests.length === 0 && !isEditing && (
                      <p className="text-muted fst-italic mt-2">No interests selected</p>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>I am a</h3>
                    <div className="d-flex flex-wrap gap-2">
                      {iAmOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`interest-tag ${profileData.details.iAm === option ? "selected" : ""}`}
                          onClick={() => isEditing && handleIAmSelection(option)}
                          disabled={!isEditing}
                          style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            backgroundColor: profileData.details.iAm === option ? "var(--primary)" : "var(--light)",
                            color: profileData.details.iAm === option ? "#fff" : "var(--text-medium)",
                            border: "none",
                            cursor: isEditing ? "pointer" : "default",
                            transition: "all 0.3s ease",
                          }}
                          aria-pressed={profileData.details.iAm === option}
                        >
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                          {profileData.details.iAm === option && <FaCheck style={{ marginLeft: "4px" }} />}
                        </button>
                      ))}
                    </div>
                    {!profileData.details.iAm && !isEditing && (
                      <p className="text-muted fst-italic mt-2">Not specified</p>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>Marital Status</h3>
                    <div className="d-flex flex-wrap gap-2">
                      {maritalStatusOptions.map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={`interest-tag ${profileData.details.maritalStatus === status ? "selected" : ""}`}
                          onClick={() => isEditing && handleMaritalStatusSelection(status)}
                          disabled={!isEditing}
                          style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            backgroundColor:
                              profileData.details.maritalStatus === status ? "var(--primary)" : "var(--light)",
                            color: profileData.details.maritalStatus === status ? "#fff" : "var(--text-medium)",
                            border: "none",
                            cursor: isEditing ? "pointer" : "default",
                            transition: "all 0.3s ease",
                          }}
                          aria-pressed={profileData.details.maritalStatus === status}
                        >
                          {status}
                          {profileData.details.maritalStatus === status && <FaCheck style={{ marginLeft: "4px" }} />}
                        </button>
                      ))}
                    </div>
                    {!profileData.details.maritalStatus && !isEditing && (
                      <p className="text-muted fst-italic mt-2">Not specified</p>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>Looking For</h3>
                    {isEditing && (
                      <div className="text-muted mb-2" style={{ fontSize: "0.8rem" }}>
                        Select up to 3 options
                      </div>
                    )}
                    <div className="d-flex flex-wrap gap-2">
                      {lookingForOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`interest-tag ${profileData.details.lookingFor.includes(option) ? "selected" : ""}`}
                          onClick={() => isEditing && toggleLookingFor(option)}
                          disabled={
                            !isEditing ||
                            (!profileData.details.lookingFor.includes(option) &&
                              profileData.details.lookingFor.length >= 3)
                          }
                          style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            backgroundColor: profileData.details.lookingFor.includes(option)
                              ? "var(--primary)"
                              : "var(--light)",
                            color: profileData.details.lookingFor.includes(option) ? "#fff" : "var(--text-medium)",
                            border: "none",
                            cursor: isEditing ? "pointer" : "default",
                            transition: "all 0.3s ease",
                          }}
                          aria-pressed={profileData.details.lookingFor.includes(option)}
                        >
                          {option.charAt(0).toUpperCase() + option.slice(1)}
                          {profileData.details.lookingFor.includes(option) && <FaCheck style={{ marginLeft: "4px" }} />}
                        </button>
                      ))}
                    </div>
                    {profileData.details.lookingFor.length === 0 && !isEditing && (
                      <p className="text-muted fst-italic mt-2">Not specified</p>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>I'm Into</h3>
                    {isEditing && (
                      <div className="text-muted mb-2" style={{ fontSize: "0.8rem" }}>
                        Select up to 20 tags
                      </div>
                    )}
                    <div className="interests-tags" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {intoTagsOptions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`interest-tag ${profileData.details.intoTags.includes(tag) ? "selected" : ""}`}
                          onClick={() => isEditing && toggleIntoTag(tag)}
                          disabled={
                            !isEditing ||
                            (!profileData.details.intoTags.includes(tag) && profileData.details.intoTags.length >= 20)
                          }
                          style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            backgroundColor: profileData.details.intoTags.includes(tag)
                              ? "var(--primary)"
                              : "var(--light)",
                            color: profileData.details.intoTags.includes(tag) ? "#fff" : "var(--text-medium)",
                            border: "none",
                            cursor: isEditing ? "pointer" : "default",
                            transition: "all 0.3s ease",
                          }}
                          aria-pressed={profileData.details.intoTags.includes(tag)}
                        >
                          {tag}
                          {profileData.details.intoTags.includes(tag) && <FaCheck style={{ marginLeft: "4px" }} />}
                        </button>
                      ))}
                    </div>
                    {profileData.details.intoTags.length === 0 && !isEditing && (
                      <p className="text-muted fst-italic mt-2">No tags selected</p>
                    )}
                  </div>

                  <div className="info-section">
                    <h3>It Turns Me On</h3>
                    {isEditing && (
                      <div className="text-muted mb-2" style={{ fontSize: "0.8rem" }}>
                        Select up to 20 tags
                      </div>
                    )}
                    <div className="interests-tags" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {turnOnsOptions.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className={`interest-tag ${profileData.details.turnOns.includes(tag) ? "selected" : ""}`}
                          onClick={() => isEditing && toggleTurnOn(tag)}
                          disabled={
                            !isEditing ||
                            (!profileData.details.turnOns.includes(tag) && profileData.details.turnOns.length >= 20)
                          }
                          style={{
                            padding: "4px 12px",
                            borderRadius: "20px",
                            backgroundColor: profileData.details.turnOns.includes(tag)
                              ? "var(--primary)"
                              : "var(--light)",
                            color: profileData.details.turnOns.includes(tag) ? "#fff" : "var(--text-medium)",
                            border: "none",
                            cursor: isEditing ? "pointer" : "default",
                            transition: "all 0.3s ease",
                          }}
                          aria-pressed={profileData.details.turnOns.includes(tag)}
                        >
                          {tag}
                          {profileData.details.turnOns.includes(tag) && <FaCheck style={{ marginLeft: "4px" }} />}
                        </button>
                      ))}
                    </div>
                    {profileData.details.turnOns.length === 0 && !isEditing && (
                      <p className="text-muted fst-italic mt-2">No tags selected</p>
                    )}
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default Profile

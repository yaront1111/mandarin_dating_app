"use client"

import { useState, useEffect, useCallback } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import {
  FaUser,
  FaEnvelope,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaMapMarkerAlt,
  FaCheck,
  FaArrowRight,
  FaArrowLeft,
  FaGoogle,
  FaFacebook,
  FaExclamationTriangle,
  FaCalendarAlt,
} from "react-icons/fa"
import { useAuth } from "../context"
import { toast } from "react-toastify"
import "../styles/registration.css"

const Register = () => {
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    nickname: "",
    email: "",
    password: "",
    confirmPassword: "",
    dateOfBirth: "", // Changed from age to dateOfBirth
    location: "",
    interests: [],
    lookingFor: [],
    agreeTerms: false,
    agreePrivacy: false,
    newsletter: false,
    // Add new fields
    iAm: "",
    intoTags: [],
    turnOns: [],
    maritalStatus: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Track if a submission has been attempted to improve validation UX
  const [attemptedSubmit, setAttemptedSubmit] = useState(false)
  const [errors, setErrors] = useState({})
  const [locationSuggestions, setLocationSuggestions] = useState([])

  const { register, error, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

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
    "Reading",
    "Gaming",
    "Photography",
    "Dancing",
    "Cooking",
    "Sports",
  ]

  const relationshipGoals = [
    "Casual Dating",
    "Serious Relationship",
    "Friendship",
    "Something Discreet",
    "Adventure",
    "Just Chatting",
  ]

  // Add these new constants for the additional preference options
  const iAmOptions = ["woman", "man", "couple"]
  const lookingForOptions = ["women", "men", "couples"]

  const intoTagsOptions = [
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
  ]

  const turnOnsOptions = [
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
  ]

  // Add marital status options
  const maritalStatusOptions = [
    "Single",
    "Married",
    "Divorced",
    "Separated",
    "Widowed",
    "In a relationship",
    "It's complicated",
    "Open relationship",
    "Polyamorous",
  ]

  // Common locations in Israel for the datalist
  const commonLocations = [
    "Tel Aviv, Israel",
    "Jerusalem, Israel",
    "Haifa, Israel",
    "Eilat, Israel",
    "Beer Sheva, Israel",
    "Netanya, Israel",
    "Herzliya, Israel",
    "Ashdod, Israel",
    "Ashkelon, Israel",
    "Tiberias, Israel",
    "Ramat Gan, Israel",
    "Rishon LeZion, Israel",
    "Petah Tikva, Israel",
    "Holon, Israel",
    "Bat Yam, Israel",
    "Rehovot, Israel",
    "Kfar Saba, Israel",
    "Raanana, Israel",
    "Nahariya, Israel",
    "Acre, Israel",
  ]

  // Calculate age from date of birth
  const calculateAge = (dob) => {
    if (!dob) return 0
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }

    return age
  }

  // Handle initial state
  useEffect(() => {
    // If user is already authenticated, redirect to dashboard
    if (isAuthenticated) {
      navigate("/dashboard")
    }

    // If there's an email in location state, use it
    if (location.state?.email) {
      setFormData((prev) => ({ ...prev, email: location.state.email }))
    }

    // Clean up form on unmount
    return () => {
      setFormData({
        nickname: "",
        email: "",
        password: "",
        confirmPassword: "",
        dateOfBirth: "",
        location: "",
        interests: [],
        lookingFor: [],
        agreeTerms: false,
        agreePrivacy: false,
        newsletter: false,
        iAm: "",
        intoTags: [],
        turnOns: [],
        maritalStatus: "",
      })
    }
  }, [isAuthenticated, navigate, location.state?.email])

  // Handle auth errors from context
  useEffect(() => {
    if (error) {
      setFormErrors((prev) => ({ ...prev, general: error }))
      setIsSubmitting(false)

      // Scroll to error message
      const errorElement = document.querySelector(".alert-danger")
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    }
  }, [error])

  // More robust validation function
  const validateStep = useCallback(
    (step) => {
      const errors = {}

      if (step === 1) {
        // Email validation with more comprehensive regex
        const emailRegex =
          /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

        // Nickname validation
        if (!formData.nickname.trim()) {
          errors.nickname = "Nickname is required"
        } else if (formData.nickname.length < 3) {
          errors.nickname = "Nickname must be at least 3 characters"
        } else if (formData.nickname.length > 50) {
          errors.nickname = "Nickname cannot exceed 50 characters"
        } else if (!/^[a-zA-Z0-9_]+$/.test(formData.nickname)) {
          errors.nickname = "Nickname can only contain letters, numbers, and underscores"
        }

        // Email validation
        if (!formData.email) {
          errors.email = "Email is required"
        } else if (!emailRegex.test(formData.email.toLowerCase())) {
          errors.email = "Please enter a valid email address"
        }

        // Password validation with more robust requirements to match backend
        if (!formData.password) {
          errors.password = "Password is required"
        } else if (formData.password.length < 8) {
          errors.password = "Password must be at least 8 characters"
        } else if (!/(?=.*[a-z])/.test(formData.password)) {
          errors.password = "Password must include at least one lowercase letter"
        } else if (!/(?=.*[A-Z])/.test(formData.password)) {
          errors.password = "Password must include at least one uppercase letter"
        } else if (!/(?=.*\d)/.test(formData.password)) {
          errors.password = "Password must include at least one number"
        } else if (!/(?=.*[@$!%*?&])/.test(formData.password)) {
          errors.password = "Password must include at least one special character (@$!%*?&)"
        }

        // Password confirmation
        if (formData.password !== formData.confirmPassword) {
          errors.confirmPassword = "Passwords do not match"
        }
      }

      if (step === 2) {
        // Date of Birth validation
        if (!formData.dateOfBirth) {
          errors.dateOfBirth = "Date of birth is required"
        } else {
          const age = calculateAge(formData.dateOfBirth)
          if (age < 18) {
            errors.dateOfBirth = "You must be at least 18 years old"
          } else if (age > 120) {
            errors.dateOfBirth = "Please enter a valid date of birth"
          }
        }

        // I am validation (moved from step 3)
        if (!formData.iAm) {
          errors.iAm = "Please select who you are"
        }

        // Location validation
        if (!formData.location.trim()) {
          errors.location = "Location is required"
        } else if (formData.location.length < 2) {
          errors.location = "Location must be at least 2 characters"
        } else if (formData.location.length > 100) {
          errors.location = "Location cannot exceed 100 characters"
        }
      }

      if (step === 3) {
        // Add validation for marital status
        if (!formData.maritalStatus) {
          errors.maritalStatus = "Please select your marital status"
        }

        // Add validation for lookingFor
        if (formData.lookingFor.length === 0) {
          errors.lookingFor = "Please select what you're looking for"
        } else if (formData.lookingFor.length > 3) {
          errors.lookingFor = "Please select no more than 3 options"
        }

        // Validate the count of intoTags and turnOns
        if (formData.intoTags.length > 20) {
          errors.intoTags = "Please select no more than 20 'I'm into' tags"
        }

        if (formData.turnOns.length > 20) {
          errors.turnOns = "Please select no more than 20 'Turn ons' tags"
        }

        // Interests validation
        if (formData.interests.length === 0) {
          errors.interests = "Please select at least one interest"
        } else if (formData.interests.length > 10) {
          errors.interests = "Please select no more than 10 interests"
        }

        // Agreement validations
        if (!formData.agreeTerms) {
          errors.agreeTerms = "You must agree to the Terms of Service"
        }

        if (!formData.agreePrivacy) {
          errors.agreePrivacy = "You must agree to the Privacy Policy"
        }
      }

      return errors
    },
    [formData],
  )

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target

    // For checkbox inputs, use the checked property
    if (type === "checkbox") {
      setFormData({ ...formData, [name]: checked })
    }
    // For number inputs, ensure valid numbers
    else if (type === "number") {
      if (value === "" || !isNaN(Number.parseInt(value))) {
        setFormData({ ...formData, [name]: value })
      }
    }
    // For all other inputs
    else {
      setFormData({ ...formData, [name]: value })
    }

    // Clear the error for this field if it exists
    if (formErrors[name]) {
      setFormErrors({ ...formErrors, [name]: "" })
    }
  }

  // Handle location input change with suggestions
  const handleLocationChange = (e) => {
    const value = e.target.value
    setFormData({ ...formData, location: value })

    if (formErrors.location) {
      setFormErrors({ ...formErrors, location: "" })
    }

    if (value.length > 1) {
      const filtered = commonLocations.filter((loc) => loc.toLowerCase().includes(value.toLowerCase()))
      setLocationSuggestions(filtered)
    } else {
      setLocationSuggestions([])
    }
  }

  // Validate current step and move to next if valid
  const handleNextStep = () => {
    setAttemptedSubmit(true)
    const errors = validateStep(currentStep)

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)

      const firstErrorElement = document.querySelector(".error-message")
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: "smooth", block: "start" })
      }

      return
    }

    setFormErrors({})
    setCurrentStep(currentStep + 1)
    setAttemptedSubmit(false)

    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Move to previous step
  const handlePrevStep = () => {
    setCurrentStep(currentStep - 1)
    setFormErrors({})
    setAttemptedSubmit(false)

    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Toggle interest selection
  const toggleInterest = (interest) => {
    let updatedInterests

    if (formData.interests.includes(interest)) {
      updatedInterests = formData.interests.filter((i) => i !== interest)
    } else {
      updatedInterests = [...formData.interests, interest]
    }

    setFormData({
      ...formData,
      interests: updatedInterests,
    })

    if (formErrors.interests && updatedInterests.length > 0) {
      setFormErrors({ ...formErrors, interests: "" })
    }
  }

  // Toggle relationship goal selection
  const toggleGoal = (goal) => {
    let updatedGoals

    if (formData.lookingFor.includes(goal)) {
      updatedGoals = formData.lookingFor.filter((g) => g !== goal)
    } else {
      updatedGoals = [...formData.lookingFor, goal]
    }

    setFormData({
      ...formData,
      lookingFor: updatedGoals,
    })

    if (formErrors.lookingFor && updatedGoals.length > 0) {
      setFormErrors({ ...formErrors, lookingFor: "" })
    }
  }

  // Toggle "I am" selection
  const handleIAmSelection = (option) => {
    setFormData({
      ...formData,
      iAm: formData.iAm === option ? "" : option,
    })

    if (formErrors.iAm && option) {
      setFormErrors({ ...formErrors, iAm: "" })
    }
  }

  // Toggle "I'm into" tag selection
  const toggleIntoTag = (tag) => {
    let updatedTags

    if (formData.intoTags.includes(tag)) {
      updatedTags = formData.intoTags.filter((t) => t !== tag)
    } else {
      if (formData.intoTags.length >= 20) {
        toast.warning("You can select up to 20 'I'm into' tags")
        return
      }
      updatedTags = [...formData.intoTags, tag]
    }

    setFormData({
      ...formData,
      intoTags: updatedTags,
    })

    if (formErrors.intoTags && updatedTags.length > 0) {
      setFormErrors({ ...formErrors, intoTags: "" })
    }
  }

  // Toggle "Turn on" tag selection
  const toggleTurnOn = (tag) => {
    let updatedTags

    if (formData.turnOns.includes(tag)) {
      updatedTags = formData.turnOns.filter((t) => t !== tag)
    } else {
      if (formData.turnOns.length >= 20) {
        toast.warning("You can select up to 20 'Turn ons' tags")
        return
      }
      updatedTags = [...formData.turnOns, tag]
    }

    setFormData({
      ...formData,
      turnOns: updatedTags,
    })

    if (formErrors.turnOns && updatedTags.length > 0) {
      setFormErrors({ ...formErrors, turnOns: "" })
    }
  }

  // Handle marital status selection
  const handleMaritalStatusChange = (e) => {
    setFormData({
      ...formData,
      maritalStatus: e.target.value,
    })

    if (formErrors.maritalStatus) {
      setFormErrors({ ...formErrors, maritalStatus: "" })
    }
  }

  const validateForm = useCallback(() => {
    const errors = {}
    // Add your validation logic here if needed
    return errors
  }, [formData])

  // Handle form submission
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
      // Map iAm to proper gender format
      let gender = ""
      if (formData.iAm.toLowerCase() === "woman") {
        gender = "female"
      } else if (formData.iAm.toLowerCase() === "man") {
        gender = "male"
      } else if (formData.iAm.toLowerCase() === "couple") {
        gender = "other" // Using "other" for couples
      }

      // Determine account tier based on gender and couple status
      let accountTier = "FREE"
      const isCouple = formData.iAm.toLowerCase() === "couple"
      if (formData.iAm.toLowerCase() === "woman") {
        accountTier = "FEMALE"
      } else if (isCouple) {
        accountTier = "COUPLE"
      }

      const submissionData = {
        nickname: formData.nickname.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        accountTier,
        isCouple,
        details: {
          age: calculateAge(formData.dateOfBirth),
          gender,
          location: formData.location.trim(),
          bio: "",
          interests: formData.interests,
          iAm: formData.iAm,
          lookingFor: formData.lookingFor,
          intoTags: formData.intoTags,
          turnOns: formData.turnOns,
          maritalStatus: formData.maritalStatus,
          dateOfBirth: formData.dateOfBirth,
        },
      }

      try {
        const success = await register(submissionData)
        if (success) {
          toast.success("Welcome to Mandarin! Your account has been created successfully.")
          navigate("/dashboard")
        }
      } catch (err) {
        if (err.message === "User already exists") {
          setFormErrors({
            email: "This email is already registered. Please log in or use a different email.",
            general: "An account with this email already exists. Would you like to log in instead?",
          })

          // Scroll to the error message
          const errorElement = document.querySelector(".error-message")
          if (errorElement) {
            errorElement.scrollIntoView({ behavior: "smooth", block: "start" })
          }
        } else {
          setFormErrors((prev) => ({
            ...prev,
            general: err.message || "An unexpected error occurred. Please try again.",
          }))
        }
      }
    } catch (err) {
      console.error("Registration error", err)
      setIsSubmitting(false)

      if (!formErrors.general) {
        setFormErrors((prev) => ({
          ...prev,
          general: "An unexpected error occurred. Please try again.",
        }))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Toggle password visibility
  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  // Render progress indicator with three steps
  const renderProgress = () => (
    <div className="registration-progress">
      <div className="progress-steps d-flex justify-content-center align-items-center">
        <div className={`progress-step ${currentStep >= 1 ? "active" : ""}`}>
          <div className="step-circle">{currentStep > 1 ? <FaCheck /> : 1}</div>
          <span className="step-label">Account</span>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${currentStep >= 2 ? "active" : ""}`}>
          <div className="step-circle">{currentStep > 2 ? <FaCheck /> : 2}</div>
          <span className="step-label">Profile</span>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${currentStep >= 3 ? "active" : ""}`}>
          <div className="step-circle">{currentStep > 3 ? <FaCheck /> : 3}</div>
          <span className="step-label">Preferences</span>
        </div>
      </div>
    </div>
  )

  // Render step 1 content (Account Information)
  const renderStep1 = () => (
    <>
      <div className="step-header text-center">
        <h3>Create Your Account</h3>
        <p className="text-light">Enter your basic information</p>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="nickname">
          Nickname
        </label>
        <div className="input-with-icon">
          <FaUser className="field-icon" />
          <input
            type="text"
            id="nickname"
            name="nickname"
            placeholder="Choose a nickname"
            className={`form-control ${formErrors.nickname ? "border-danger" : ""}`}
            value={formData.nickname}
            onChange={handleChange}
            maxLength={50}
            aria-describedby="nickname-help"
          />
        </div>
        {formErrors.nickname ? (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.nickname}
          </p>
        ) : (
          <small id="nickname-help" className="form-text text-muted">
            Your public display name (can contain letters, numbers, and underscores)
          </small>
        )}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="email">
          Email Address
        </label>
        <div className="input-with-icon">
          <FaEnvelope className="field-icon" />
          <input
            type="email"
            id="email"
            name="email"
            placeholder="Enter your email"
            className={`form-control ${formErrors.email ? "border-danger" : ""}`}
            value={formData.email}
            onChange={handleChange}
            aria-describedby="email-help"
          />
        </div>
        {formErrors.email ? (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.email}
          </p>
        ) : (
          <small id="email-help" className="form-text text-muted">
            We'll never share your email with anyone else
          </small>
        )}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="password">
          Password
        </label>
        <div className="input-with-icon">
          <FaLock className="field-icon" />
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            name="password"
            placeholder="Create a password"
            className={`form-control ${formErrors.password ? "border-danger" : ""}`}
            value={formData.password}
            onChange={handleChange}
            aria-describedby="password-help"
          />
          <button
            type="button"
            className="toggle-password"
            onClick={togglePasswordVisibility}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>
        {formErrors.password ? (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.password}
          </p>
        ) : (
          <small id="password-help" className="form-text text-muted">
            Must be at least 8 characters with uppercase, lowercase, number, and special character
          </small>
        )}
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="confirmPassword">
          Confirm Password
        </label>
        <div className="input-with-icon">
          <FaLock className="field-icon" />
          <input
            type={showPassword ? "text" : "password"}
            id="confirmPassword"
            name="confirmPassword"
            placeholder="Confirm password"
            className={`form-control ${formErrors.confirmPassword ? "border-danger" : ""}`}
            value={formData.confirmPassword}
            onChange={handleChange}
          />
        </div>
        {formErrors.confirmPassword && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.confirmPassword}
          </p>
        )}
      </div>
      <div className="form-actions d-flex justify-content-end mt-3">
        <button type="button" className="btn btn-primary" onClick={handleNextStep} disabled={isSubmitting}>
          Continue <FaArrowRight />
        </button>
      </div>
    </>
  )

  // Render step 2 content (Profile Information)
  const renderStep2 = () => (
    <>
      <div className="step-header text-center">
        <h3>Tell Us About Yourself</h3>
        <p className="text-light">Add some basic profile details</p>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="dateOfBirth">
          Date of Birth
        </label>
        <div className="input-with-icon">
          <FaCalendarAlt className="field-icon" />
          <input
            type="date"
            id="dateOfBirth"
            name="dateOfBirth"
            className={`form-control ${formErrors.dateOfBirth ? "border-danger" : ""}`}
            value={formData.dateOfBirth}
            onChange={handleChange}
            max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split("T")[0]}
            aria-describedby="dob-help"
          />
        </div>
        {formErrors.dateOfBirth ? (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.dateOfBirth}
          </p>
        ) : (
          <small id="dob-help" className="form-text text-muted">
            You must be at least 18 years old to use this service
          </small>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">I am a</label>
        <div className="d-flex gap-2 flex-wrap">
          {iAmOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`interest-tag ${formData.iAm === option ? "selected" : ""} ${
                formErrors.iAm && attemptedSubmit ? "error-border" : ""
              }`}
              onClick={() => handleIAmSelection(option)}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
              {formData.iAm === option && <FaCheck className="tag-check" />}
            </button>
          ))}
        </div>
        {formErrors.iAm && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.iAm}
          </p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="location">
          Location
        </label>
        <div className="input-with-icon">
          <FaMapMarkerAlt className="field-icon" />
          <input
            type="text"
            id="location"
            name="location"
            placeholder="City, Country"
            className={`form-control ${formErrors.location ? "border-danger" : ""}`}
            value={formData.location}
            onChange={handleLocationChange}
            maxLength={100}
            aria-describedby="location-help"
            list="location-suggestions"
          />
          <datalist id="location-suggestions">
            {commonLocations.map((loc, index) => (
              <option key={index} value={loc} />
            ))}
          </datalist>
        </div>
        {formErrors.location ? (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.location}
          </p>
        ) : (
          <small id="location-help" className="form-text text-muted">
            Your general location (e.g., Tel Aviv, Israel)
          </small>
        )}
      </div>
      <div className="form-actions d-flex justify-content-between mt-3">
        <button type="button" className="btn btn-outline" onClick={handlePrevStep}>
          <FaArrowLeft /> Back
        </button>
        <button type="button" className="btn btn-primary" onClick={handleNextStep} disabled={isSubmitting}>
          Continue <FaArrowRight />
        </button>
      </div>
    </>
  )

  // Render step 3 content (Preferences)
  const renderStep3 = () => (
    <>
      <div className="step-header text-center">
        <h3>Your Preferences</h3>
        <p className="text-light">Tell us about yourself and what you're looking for</p>
      </div>

      <div className="form-group">
        <label className="form-label">Marital Status</label>
        <select
          className={`form-control ${formErrors.maritalStatus ? "border-danger" : ""}`}
          name="maritalStatus"
          value={formData.maritalStatus}
          onChange={handleMaritalStatusChange}
        >
          <option value="">Select your status</option>
          {maritalStatusOptions.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        {formErrors.maritalStatus && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.maritalStatus}
          </p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Looking For</label>
        <small className="d-block text-muted mb-2">Select up to 3 options</small>
        <div className="d-flex gap-2 flex-wrap">
          {lookingForOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={`interest-tag ${formData.lookingFor.includes(option) ? "selected" : ""} ${
                formErrors.lookingFor && attemptedSubmit ? "error-border" : ""
              }`}
              onClick={() => toggleGoal(option)}
              disabled={!formData.lookingFor.includes(option) && formData.lookingFor.length >= 3}
            >
              {option.charAt(0).toUpperCase() + option.slice(1)}
              {formData.lookingFor.includes(option) && <FaCheck className="tag-check" />}
            </button>
          ))}
        </div>
        {formErrors.lookingFor && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.lookingFor}
          </p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">Interests</label>
        <small className="d-block text-muted mb-2">Select up to 10 interests</small>
        <div className="interests-grid">
          {availableInterests.map((interest) => (
            <button
              key={interest}
              type="button"
              className={`interest-tag ${formData.interests.includes(interest) ? "selected" : ""} ${
                formErrors.interests && attemptedSubmit ? "error-border" : ""
              }`}
              onClick={() => toggleInterest(interest)}
              disabled={!formData.interests.includes(interest) && formData.interests.length >= 10}
            >
              {interest}
              {formData.interests.includes(interest) && <FaCheck className="tag-check" />}
            </button>
          ))}
        </div>
        {formErrors.interests && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.interests}
          </p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">I'm into</label>
        <small className="d-block text-muted mb-2">Select up to 20 tags</small>
        <div className="interests-grid">
          {intoTagsOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`interest-tag ${formData.intoTags.includes(tag) ? "selected" : ""} ${
                formErrors.intoTags && attemptedSubmit ? "error-border" : ""
              }`}
              onClick={() => toggleIntoTag(tag)}
              disabled={!formData.intoTags.includes(tag) && formData.intoTags.length >= 20}
            >
              {tag}
              {formData.intoTags.includes(tag) && <FaCheck className="tag-check" />}
            </button>
          ))}
        </div>
        {formErrors.intoTags && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.intoTags}
          </p>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">It turns me on</label>
        <small className="d-block text-muted mb-2">Select up to 20 tags</small>
        <div className="interests-grid">
          {turnOnsOptions.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`interest-tag ${formData.turnOns.includes(tag) ? "selected" : ""} ${
                formErrors.turnOns && attemptedSubmit ? "error-border" : ""
              }`}
              onClick={() => toggleTurnOn(tag)}
              disabled={!formData.turnOns.includes(tag) && formData.turnOns.length >= 20}
            >
              {tag}
              {formData.turnOns.includes(tag) && <FaCheck className="tag-check" />}
            </button>
          ))}
        </div>
        {formErrors.turnOns && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.turnOns}
          </p>
        )}
      </div>

      <div className="form-group checkbox-group mt-3">
        <label className={`checkbox-label ${formErrors.agreeTerms ? "error" : ""}`}>
          <input type="checkbox" name="agreeTerms" checked={formData.agreeTerms} onChange={handleChange} />
          <span style={{ marginLeft: "8px" }}>
            I agree to the{" "}
            <Link to="/terms" target="_blank" rel="noopener noreferrer">
              Terms of Service
            </Link>
          </span>
        </label>
        {formErrors.agreeTerms && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.agreeTerms}
          </p>
        )}
      </div>
      <div className="form-group checkbox-group">
        <label className={`checkbox-label ${formErrors.agreePrivacy ? "error" : ""}`}>
          <input type="checkbox" name="agreePrivacy" checked={formData.agreePrivacy} onChange={handleChange} />
          <span style={{ marginLeft: "8px" }}>
            I agree to the{" "}
            <Link to="/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </Link>
          </span>
        </label>
        {formErrors.agreePrivacy && (
          <p className="error-message text-danger">
            <FaExclamationTriangle className="me-1" />
            {formErrors.agreePrivacy}
          </p>
        )}
      </div>
      <div className="form-group checkbox-group">
        <label className="checkbox-label">
          <input type="checkbox" name="newsletter" checked={formData.newsletter} onChange={handleChange} />
          <span style={{ marginLeft: "8px" }}>I want to receive news and special offers (optional)</span>
        </label>
      </div>
      <div className="form-actions d-flex justify-content-between mt-3">
        <button type="button" className="btn btn-outline" onClick={handlePrevStep} disabled={isSubmitting}>
          <FaArrowLeft /> Back
        </button>
        <button type="submit" className={`btn btn-primary ${isSubmitting ? "loading" : ""}`} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <span className="spinner spinner-dark"></span>
              <span style={{ marginLeft: "8px" }}>Creating account...</span>
            </>
          ) : (
            <>
              <span>Create Account</span> <FaCheck />
            </>
          )}
        </button>
      </div>
    </>
  )

  // Render appropriate step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return renderStep1()
      case 2:
        return renderStep2()
      case 3:
        return renderStep3()
      default:
        return null
    }
  }

  return (
    <div className="auth-page register-page d-flex">
      <div className="auth-container d-flex flex-column justify-content-center w-100">
        <div className="container" style={{ maxWidth: "600px" }}>
          <div className="card">
            <div className="card-header text-center">
              <Link to="/" className="logo">
                Mandarin
              </Link>
              <h2 className="mb-1">Join Mandarin</h2>
              <p className="text-light">Create your account in a few steps</p>
            </div>
            <div className="card-body">
              {formErrors.general && (
                <div className="alert alert-danger" role="alert">
                  <FaExclamationTriangle className="me-2" />
                  <p className="mb-0">{formErrors.general}</p>
                </div>
              )}
              {renderProgress()}
              <form className="mt-4" onSubmit={handleSubmit} noValidate>
                {renderStepContent()}
              </form>
              {currentStep === 1 && (
                <>
                  <div className="auth-separator text-center mt-4 mb-2">
                    <span>OR SIGN UP WITH</span>
                  </div>
                  <div className="d-flex flex-column gap-2">
                    <button className="btn btn-outline d-flex align-items-center justify-content-center">
                      <FaGoogle style={{ marginRight: "8px" }} />
                      Sign up with Google
                    </button>
                    <button className="btn btn-outline d-flex align-items-center justify-content-center">
                      <FaFacebook style={{ marginRight: "8px" }} />
                      Sign up with Facebook
                    </button>
                  </div>
                </>
              )}
              <div className="auth-footer text-center mt-4">
                <p className="mb-0">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary">
                    Sign In
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register

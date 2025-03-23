

// client/src/pages/Login.js
import { useState, useEffect } from "react"
import { Link, useNavigate, useLocation } from "react-router-dom"
import { FaEnvelope, FaLock, FaEye, FaEyeSlash, FaGoogle, FaFacebook, FaArrowRight } from "react-icons/fa"
import { useAuth } from "../context"

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [formErrors, setFormErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const { login, error, clearError, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from || "/dashboard"

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from)
    }
  }, [isAuthenticated, navigate, from])

  useEffect(() => {
    // Only set email from location state on initial mount
    if (location.state?.email) {
      setFormData((prev) => ({ ...prev, email: location.state.email }))
    }
    // Clear any previous errors when component mounts
    clearError()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array means this only runs once on mount

  useEffect(() => {
    if (error) {
      setFormErrors({ general: error })
      setIsSubmitting(false)
    }
  }, [error])

  const validateForm = () => {
    const errors = {}
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/

    if (!formData.email) {
      errors.email = "Email is required"
    } else if (!emailRegex.test(formData.email)) {
      errors.email = "Invalid email format"
    }
    if (!formData.password) {
      errors.password = "Password is required"
    } else if (formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters"
    }

    return errors
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData({ ...formData, [name]: value })
    if (formErrors[name]) {
      setFormErrors({ ...formErrors, [name]: "" })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }
    setFormErrors({})
    setIsSubmitting(true)

    try {
      await login({ email: formData.email, password: formData.password })
    } catch (err) {
      console.error("Login error", err)
    }
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword)
  }

  return (
    <div className="auth-page login-page d-flex">
      <div className="auth-container d-flex flex-column justify-content-center w-100">
        <div className="container" style={{ maxWidth: "500px" }}>
          <div className="card">
            <div className="card-header text-center">
              <Link to="/" className="logo">
                Mandarin
              </Link>
              <h2 className="mb-1">Welcome Back</h2>
              <p className="text-light">Sign in to continue your journey</p>
            </div>
            <div className="card-body">
              {formErrors.general && (
                <div className="alert alert-danger">
                  <p>{formErrors.general}</p>
                </div>
              )}
              <form onSubmit={handleSubmit}>
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
                      className="form-control"
                      placeholder="Enter your email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={isSubmitting}
                    />
                  </div>
                  {formErrors.email && <p className="error-message">{formErrors.email}</p>}
                </div>

                <div className="form-group">
                  <div className="d-flex justify-content-between">
                    <label className="form-label" htmlFor="password">
                      Password
                    </label>
                    <Link to="/forgot-password" className="text-primary" style={{ fontSize: "0.875rem" }}>
                      Forgot Password?
                    </Link>
                  </div>
                  <div className="input-with-icon">
                    <FaLock className="field-icon" />
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      name="password"
                      className="form-control"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={handleChange}
                      disabled={isSubmitting}
                    />
                    <button type="button" className="toggle-password" onClick={togglePasswordVisibility} tabIndex={-1}>
                      {showPassword ? <FaEyeSlash /> : <FaEye />}
                    </button>
                  </div>
                  {formErrors.password && <p className="error-message">{formErrors.password}</p>}
                </div>

                <div className="form-group d-flex align-items-center">
                  <label className="checkbox-label d-flex align-items-center">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={() => setRememberMe(!rememberMe)}
                      disabled={isSubmitting}
                    />
                    <span style={{ marginLeft: "8px" }}>Remember me</span>
                  </label>
                </div>

                <button
                  type="submit"
                  className={`btn btn-primary w-100 ${isSubmitting ? "loading" : ""}`}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="spinner spinner-dark"></span>
                      <span style={{ marginLeft: "8px" }}>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <FaArrowRight />
                    </>
                  )}
                </button>
              </form>

              <div className="auth-separator text-center mt-4 mb-2">
                <span>OR</span>
              </div>

              <div className="d-flex flex-column gap-2">
                <button className="btn btn-outline d-flex align-items-center justify-content-center">
                  <FaGoogle style={{ marginRight: "8px" }} />
                  Sign in with Google
                </button>
                <button className="btn btn-outline d-flex align-items-center justify-content-center">
                  <FaFacebook style={{ marginRight: "8px" }} />
                  Sign in with Facebook
                </button>
              </div>

              <div className="auth-footer text-center mt-4">
                <p className="mb-0">
                  Don't have an account?{" "}
                  <Link to="/register" className="text-primary">
                    Sign Up
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

export default Login

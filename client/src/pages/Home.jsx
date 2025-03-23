

// client/src/pages/Home.js
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { FaArrowRight } from "react-icons/fa"
import { ThemeToggle } from "../components/theme-toggle.tsx"

const Home = () => {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")

  const handleStartNow = () => {
    navigate("/register")
  }

  const handleEmailSubmit = (e) => {
    e.preventDefault()
    navigate("/register", { state: { email } })
  }

  return (
    <div className="modern-home-page">
      {/* Modern Header (Optional for Landing) */}
      <header className="modern-header">
        <div className="container d-flex justify-content-between align-items-center">
          <div className="logo">Mandarin</div>
          <nav className="d-none d-md-flex main-tabs">
            <Link to="/about" className="tab-button">
              About
            </Link>
            <Link to="/safety" className="tab-button">
              Safety
            </Link>
            <Link to="/support" className="tab-button">
              Support
            </Link>
          </nav>
          <div className="header-actions d-flex align-items-center">
            <ThemeToggle />
            <Link to="/login" className="btn btn-outline btn-sm">
              Login
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm">
              Register
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <h1>Find Your Perfect Connection</h1>
          <p>
            Discover genuine connections in a safe, discreet environment designed for adults seeking meaningful
            encounters.
          </p>
          <div className="hero-actions">
            <form onSubmit={handleEmailSubmit} style={{ display: "flex", gap: "8px" }}>
              <input
                type="email"
                placeholder="Enter your email"
                className="form-control"
                style={{ maxWidth: "250px" }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-primary">
                <span>Get Started</span> <FaArrowRight />
              </button>
            </form>
          </div>
        </div>

        <div className="hero-image">
          <div className="image-collage">
            <div className="collage-image image1" />
            <div className="collage-image image2" />
            <div className="collage-image image3" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="modern-footer">
        <div className="container footer-content">
          <div className="footer-logo">Mandarin</div>
          <div className="footer-links">
            <Link to="/about">About Us</Link>
            <Link to="/safety">Safety</Link>
            <Link to="/support">Support</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
          <div className="footer-social">
            <a href="#" className="social-icon">
              FB
            </a>
            <a href="#" className="social-icon">
              IG
            </a>
            <a href="#" className="social-icon">
              TW
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} Mandarin Dating. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default Home

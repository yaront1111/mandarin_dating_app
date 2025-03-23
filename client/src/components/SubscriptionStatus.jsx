"use client"

import { FaCrown, FaHeart, FaImage, FaInfoCircle } from "react-icons/fa"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../context"

const SubscriptionStatus = ({ compact = false }) => {
  const { user } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  // Determine account status
  const isFree = user.accountTier === "FREE"
  const isPaid = user.accountTier === "PAID"
  const isFemale = user.accountTier === "FEMALE"
  const isCouple = user.accountTier === "COUPLE"

  // Calculate story cooldown if applicable
  let storyCooldown = null
  if (isFree && user.lastStoryCreated) {
    const cooldownPeriod = 72 * 60 * 60 * 1000 // 72 hours in milliseconds
    const timeSinceLastStory = Date.now() - new Date(user.lastStoryCreated).getTime()
    const timeRemaining = cooldownPeriod - timeSinceLastStory

    if (timeRemaining > 0) {
      const hoursRemaining = Math.ceil(timeRemaining / (60 * 60 * 1000))
      storyCooldown = hoursRemaining
    }
  }

  // Use regular CSS class names instead of styled-jsx
  const statusHeaderStyle = {
    padding: "16px",
    background: isFree ? "var(--bg-card)" : "var(--primary)",
    color: isFree ? "var(--text)" : "white",
    borderBottom: "1px solid rgba(0,0,0,0.1)",
  }

  // Compact version for header - just a simple badge
  if (compact) {
    return (
      <div className="subscription-badge">
        {isFree ? (
          <span className="free-badge" onClick={() => navigate("/subscription")}>
            Free
          </span>
        ) : (
          <span
            className="premium-badge"
            title={isPaid ? "Premium Account" : isFemale ? "Female Account" : "Couple Account"}
          >
            <FaCrown className="premium-icon" />
          </span>
        )}

        {/* Regular style tag instead of styled-jsx */}
        <style>
          {`
          /* Subscription badge styles */
          .subscription-badge {
            display: flex;
            align-items: center;
            margin-right: 10px;
          }
          
          .free-badge {
            background: var(--bg-card);
            color: var(--text-muted);
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s;
          }
          
          .free-badge:hover {
            background: var(--bg-hover);
          }
          
          .premium-badge {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .premium-icon {
            color: var(--primary);
            font-size: 18px;
          }
          `}
        </style>
      </div>
    )
  }

  // Full version for dedicated pages
  return (
    <div className="subscription-status-card">
      <div className="status-header" style={statusHeaderStyle}>
        {isFree ? (
          <h3>Free Account</h3>
        ) : (
          <h3>
            <FaCrown className="premium-icon" />
            {isPaid ? "Premium Account" : isFemale ? "Female Account" : "Couple Account"}
          </h3>
        )}
      </div>

      <div className="status-body">
        {isFree ? (
          <>
            <div className="limit-item">
              <FaHeart className="limit-icon" />
              <div className="limit-info">
                <span className="limit-label">Daily Likes</span>
                <span className="limit-value">{user.dailyLikesRemaining} / 3 remaining</span>
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${(user.dailyLikesRemaining / 3) * 100}%` }}></div>
                </div>
              </div>
            </div>

            <div className="limit-item">
              <FaImage className="limit-icon" />
              <div className="limit-info">
                <span className="limit-label">Story Creation</span>
                {storyCooldown ? (
                  <span className="limit-value">Available in {storyCooldown} hours</span>
                ) : (
                  <span className="limit-value">Available now</span>
                )}
                {storyCooldown && (
                  <div className="progress">
                    <div className="progress-bar" style={{ width: `${100 - (storyCooldown / 72) * 100}%` }}></div>
                  </div>
                )}
              </div>
            </div>

            <button className="btn btn-primary upgrade-btn" onClick={() => navigate("/subscription")}>
              <FaCrown className="me-2" /> Upgrade Now
            </button>
          </>
        ) : (
          <div className="premium-features">
            <p>
              <FaInfoCircle className="me-2" />
              You have full access to all premium features:
            </p>
            <ul>
              <li>Unlimited messaging</li>
              <li>Unlimited likes</li>
              <li>Unlimited stories</li>
              <li>Video calls</li>
              <li>Priority in search results</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

export default SubscriptionStatus

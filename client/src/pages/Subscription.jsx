"use client"

import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { FaCheck, FaTimes, FaCrown, FaHeart, FaImage, FaComment, FaUserCircle } from "react-icons/fa"
import { useAuth } from "../context"
import { toast } from "react-toastify"
import { ThemeToggle } from "../components/theme-toggle.tsx"
import subscriptionService from "../services/subscriptionService.jsx"

const Subscription = () => {
  const { user, getCurrentUser } = useAuth() // Add getCurrentUser from auth context
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState("monthly")
  const [loading, setLoading] = useState(false)
  const [subscriptionData, setSubscriptionData] = useState(null)

  // Redirect if user is not logged in
  useEffect(() => {
    if (!user) {
      navigate("/login")
    } else {
      // Fetch subscription data when component mounts
      fetchSubscriptionStatus()
    }
  }, [user, navigate])

  // Fetch subscription status
  const fetchSubscriptionStatus = async () => {
    try {
      const response = await subscriptionService.getSubscriptionStatus()
      if (response.success) {
        setSubscriptionData(response.data)
      }
    } catch (error) {
      console.error("Error fetching subscription status:", error)
      toast.error("Could not load subscription information")
    }
  }

  // Check if user already has premium access
  const hasPremium =
    user?.isPaid ||
    user?.accountTier === "PAID" ||
    user?.accountTier === "FEMALE" ||
    user?.accountTier === "COUPLE" ||
    (subscriptionData &&
      (subscriptionData.isPaid ||
        subscriptionData.accountTier === "PAID" ||
        subscriptionData.accountTier === "FEMALE" ||
        subscriptionData.accountTier === "COUPLE"))

  const handleSubscribe = async (plan) => {
    setLoading(true)
    try {
      // Call the subscription service to upgrade
      const response = await subscriptionService.upgradeSubscription(plan)

      if (response.success) {
        // Refresh user data to reflect the new subscription status
        await getCurrentUser()

        // Redirect to dashboard after successful subscription
        toast.success(`Successfully subscribed to ${plan} plan!`)
        navigate("/dashboard")
      }
    } catch (error) {
      console.error("Subscription error:", error)
      toast.error(error.message || "Failed to process subscription. Please try again.")
    } finally {
      setLoading(false)
    }
  }

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
                src={user.photos[0].url || "/placeholder.svg"}
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
        <div className="container">
          <div className="subscription-page">
            <h1 className="text-center mb-4">
              <FaCrown className="me-2" style={{ color: "var(--primary)" }} />
              Premium Membership
            </h1>

            {hasPremium ? (
              <div className="already-premium">
                <div className="alert alert-success text-center">
                  <h3>You already have premium access!</h3>
                  <p>Enjoy all the premium features of Mandarin.</p>
                  <button className="btn btn-primary mt-3" onClick={() => navigate("/dashboard")}>
                    Return to Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="subscription-intro text-center mb-5">
                  <h2>Unlock All Features</h2>
                  <p className="lead">Upgrade your experience and connect with more people</p>
                </div>

                <div className="plan-toggle mb-5">
                  <div className="d-flex justify-content-center">
                    <div className="toggle-container">
                      <button
                        className={`toggle-btn ${selectedPlan === "monthly" ? "active" : ""}`}
                        onClick={() => setSelectedPlan("monthly")}
                      >
                        Monthly
                      </button>
                      <button
                        className={`toggle-btn ${selectedPlan === "yearly" ? "active" : ""}`}
                        onClick={() => setSelectedPlan("yearly")}
                      >
                        Yearly <span className="save-badge">Save 20%</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pricing-cards">
                  <div className="row justify-content-center">
                    <div className="col-md-6 col-lg-4 mb-4">
                      <div className="pricing-card free">
                        <div className="card-header">
                          <h3>Free</h3>
                          <p className="price">$0</p>
                          <p className="period">forever</p>
                        </div>
                        <div className="card-body">
                          <ul className="feature-list">
                            <li>
                              <FaCheck className="icon-yes" /> View profiles
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> Send winks
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> 3 likes per day
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> 1 story every 72 hours
                            </li>
                            <li>
                              <FaTimes className="icon-no" /> Send messages
                            </li>
                            <li>
                              <FaTimes className="icon-no" /> Unlimited likes
                            </li>
                            <li>
                              <FaTimes className="icon-no" /> Unlimited stories
                            </li>
                          </ul>
                          <button className="btn btn-outline w-100" disabled>
                            Current Plan
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="col-md-6 col-lg-4 mb-4">
                      <div className="pricing-card premium">
                        <div className="popular-badge">Most Popular</div>
                        <div className="card-header">
                          <h3>Premium</h3>
                          <p className="price">${selectedPlan === "monthly" ? "14.99" : "11.99"}</p>
                          <p className="period">per {selectedPlan === "monthly" ? "month" : "month, billed yearly"}</p>
                        </div>
                        <div className="card-body">
                          <ul className="feature-list">
                            <li>
                              <FaCheck className="icon-yes" /> View profiles
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> Send winks
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> <strong>Unlimited likes</strong>{" "}
                              <FaHeart className="feature-icon" />
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> <strong>Unlimited stories</strong>{" "}
                              <FaImage className="feature-icon" />
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> <strong>Send messages</strong>{" "}
                              <FaComment className="feature-icon" />
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> Video calls
                            </li>
                            <li>
                              <FaCheck className="icon-yes" /> Priority in search results
                            </li>
                          </ul>
                          <button
                            className="btn btn-primary w-100"
                            onClick={() => handleSubscribe(selectedPlan)}
                            disabled={loading}
                          >
                            {loading ? (
                              <>
                                <span className="spinner spinner-dark"></span>
                                <span style={{ marginLeft: "8px" }}>Processing...</span>
                              </>
                            ) : (
                              `Subscribe ${selectedPlan === "monthly" ? "$14.99/month" : "$143.88/year"}`
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {/* CSS styles as regular style tag instead of styled-jsx */}
      <style>
        {`
        .subscription-page {
          padding: 40px 0;
        }
        
        .pricing-cards {
          margin-top: 30px;
        }
        
        .pricing-card {
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 5px 15px rgba(0,0,0,0.1);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          height: 100%;
          display: flex;
          flex-direction: column;
          position: relative;
        }
        
        .pricing-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.15);
        }
        
        .pricing-card.premium {
          border: 2px solid var(--primary);
        }
        
        .popular-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          background: var(--primary);
          color: white;
          padding: 5px 10px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: bold;
        }
        
        .card-header {
          background: var(--bg-card);
          padding: 25px 20px;
          text-align: center;
          border-bottom: 1px solid rgba(0,0,0,0.1);
        }
        
        .card-header h3 {
          margin-bottom: 15px;
          font-weight: bold;
        }
        
        .price {
          font-size: 36px;
          font-weight: bold;
          margin-bottom: 0;
          color: var(--primary);
        }
        
        .period {
          opacity: 0.7;
          font-size: 14px;
        }
        
        .card-body {
          padding: 25px 20px;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
        }
        
        .feature-list {
          list-style: none;
          padding: 0;
          margin-bottom: 25px;
          flex-grow: 1;
        }
        
        .feature-list li {
          padding: 10px 0;
          display: flex;
          align-items: center;
        }
        
        .icon-yes {
          color: var(--success);
          margin-right: 10px;
        }
        
        .icon-no {
          color: var(--danger);
          margin-right: 10px;
        }
        
        .feature-icon {
          margin-left: 5px;
          color: var(--primary);
        }
        
        .toggle-container {
          display: inline-flex;
          background: var(--bg-card);
          border-radius: 30px;
          padding: 5px;
          margin-bottom: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .toggle-btn {
          padding: 10px 20px;
          border: none;
          background: none;
          border-radius: 25px;
          cursor: pointer;
          position: relative;
          transition: all 0.3s ease;
        }
        
        .toggle-btn.active {
          background: var(--primary);
          color: white;
        }
        
        .save-badge {
          position: absolute;
          top: -10px;
          right: -10px;
          background: var(--success);
          color: white;
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 10px;
        }
        
        .already-premium {
          max-width: 600px;
          margin: 0 auto;
        }
        `}
      </style>
    </div>
  )
}

export default Subscription

import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context';
import { FaExclamationTriangle } from 'react-icons/fa';

/**
 * A wrapper component that protects routes requiring authentication.
 * Redirects to login if user is not authenticated.
 * Shows loading and error states appropriately.
 */
const PrivateRoute = ({ children }) => {
  const { user, isAuthenticated, loading, error } = useAuth();
  const location = useLocation();
  const [showError, setShowError] = useState(false);

  // Show error message for 3 seconds before redirecting
  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => {
        setShowError(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // If still loading auth state, show loading spinner
  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p className="loading-text">Loading...</p>
      </div>
    );
  }

  // If there's an auth error, show error message
  if (showError) {
    return (
      <div className="auth-error">
        <div className="auth-error-content">
          <FaExclamationTriangle className="auth-error-icon" />
          <h3>Authentication Error</h3>
          <p>{error || "Authentication failed"}</p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login with return path
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // If authenticated, render the protected route content
  return children;
};

export default PrivateRoute;

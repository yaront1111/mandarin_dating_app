import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorStack: '' };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      errorMessage: error.message || 'An unknown error occurred'
    };
  }

  componentDidCatch(error, errorInfo) {
    // Extract the message and stack separately
    const errorMessage = error.message || 'An unknown error occurred';
    const errorStack = error.stack || errorInfo.componentStack || '';

    // Log the error to an error reporting service
    console.error('ErrorBoundary caught an error', errorMessage, errorStack);

    this.setState({
      errorMessage,
      errorStack
    });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="error-boundary">
          <h1>Something went wrong</h1>
          <p>We're sorry, but an error occurred. Please try refreshing the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Refresh Page
          </button>
          {import.meta.env.MODE !== 'production' && (
            <details style={{ marginTop: '20px', whiteSpace: 'pre-wrap' }}>
              <summary>Developer Details</summary>
              <p>{this.state.errorMessage}</p>
              <p>Component Stack:</p>
              <pre>{this.state.errorStack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

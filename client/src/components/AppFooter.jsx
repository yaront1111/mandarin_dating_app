// src/components/AppFooter.jsx
import React, { useEffect } from "react";
import "../styles/AppFooter.css" // Optional: import your footer styles

const AppFooter = () => {
  useEffect(() => {
    // Insert Google Analytics script dynamically
    const gaScript = document.createElement("script");
    gaScript.src = "https://www.googletagmanager.com/gtag/js?id=UA-XXXXXXXXX-X";
    gaScript.async = true;
    document.body.appendChild(gaScript);

    // Initialize GA (or GA4) after the script is loaded
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    gtag("js", new Date());
    gtag("config", "UA-XXXXXXXXX-X"); // Replace with your tracking ID

    // Insert any additional third-party tool scripts here
    // Example: Facebook Pixel, Hotjar, etc.
    // const otherScript = document.createElement("script");
    // otherScript.src = "https://example.com/other-tool.js";
    // otherScript.async = true;
    // document.body.appendChild(otherScript);

    // Cleanup on unmount
    return () => {
      document.body.removeChild(gaScript);
      // Remove other scripts if necessary
    };
  }, []);

  return (
    <footer className="app-footer">
      <div className="container">
        <p>&copy; {new Date().getFullYear()} Your Company. All rights reserved.</p>
        <nav>
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/terms-of-service">Terms of Service</a>
          <a href="/contact">Contact Us</a>
        </nav>
      </div>
    </footer>
  );
};

export default AppFooter;

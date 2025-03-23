

import { createContext, useContext, useState, useEffect } from "react"

const ThemeContext = createContext()

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Check if theme is stored in localStorage
    const savedTheme = localStorage.getItem("theme")

    // If theme is saved, use it
    if (savedTheme) {
      return savedTheme
    }

    // If user prefers dark mode, use dark theme
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark"
    }

    // Default to light theme
    return "light"
  })

  // Apply theme class to document
  useEffect(() => {
    const root = window.document.documentElement

    // Remove all theme classes
    root.classList.remove("light", "dark")

    // Add current theme class
    root.classList.add(theme)

    // Save theme to localStorage
    localStorage.setItem("theme", theme)
  }, [theme])

  // Toggle between light and dark themes
  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"))
  }

  // Set theme to a specific value
  const setThemeValue = (value) => {
    if (["light", "dark", "system"].includes(value)) {
      setTheme(value)
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: setThemeValue }}>{children}</ThemeContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}

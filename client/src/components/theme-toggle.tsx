

import { useEffect, useState } from "react"
import { FaMoon, FaSun } from "react-icons/fa"
import { useTheme } from "../context/ThemeContext"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Only show the toggle after component has mounted to avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <FaSun /> : <FaMoon />}
    </button>
  )
}

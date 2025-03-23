// Add this utility function to normalize photo URLs consistently across the app
export const normalizePhotoUrl = (url) => {
  if (!url) return "/placeholder.svg"

  // If it's already a full URL, return it
  if (url.startsWith("http")) return url

  // If it's a path that starts with /uploads/ but doesn't include /photos
  if (url.startsWith("/uploads/")) {
    return url
  }

  // For server-side photo paths to match client expectations
  if (url.includes("/images/") || url.includes("/photos/")) {
    // Ensure it starts with /uploads/ if it doesn't already
    return url.startsWith("/uploads") ? url : `/uploads${url.startsWith("/") ? "" : "/"}${url}`
  }

  return url
}

// Export other existing utilities

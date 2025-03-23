// client/src/components/index.js
// Import all components and re-export them for easier imports throughout the app

// Layout Components
import { Navbar, Alert, PrivateRoute as LayoutPrivateRoute } from "./LayoutComponents"

// User Components
import { UserCard, UserPhotoGallery, UserPhotoViewer, UserList, UserFilter } from "./UserComponents"

// Chat Components
// Fixing the imports for Chat components
import EmbeddedChat from "./EmbeddedChat"

// We'll skip importing Spinner if it doesn't exist as a direct file

// Stories Components
import StoriesCarousel from "./Stories/StoriesCarousel"
import StoriesViewer from "./Stories/StoriesViewer"
import StoryCreator from "./Stories/StoryCreator"
import StoryThumbnail from "./Stories/StoryThumbnail"

// Error Boundary
import ErrorBoundary from "./ErrorBoundary"

// Import from PrivateRoute.jsx which is our main implementation
import PrivateRoute from "./PrivateRoute.jsx"

// Theme Toggle
import { ThemeToggle } from "./theme-toggle.tsx"

// User Profile Modal
import UserProfileModal from "./UserProfileModal"

export {
  // Layout Components
  Navbar,
  Alert,
  LayoutPrivateRoute,
  // User Components
  UserCard,
  UserPhotoGallery,
  UserPhotoViewer,
  UserList,
  UserFilter,
  // Chat Components
  EmbeddedChat,
  // Stories Components
  StoriesCarousel,
  StoriesViewer,
  StoryCreator,
  StoryThumbnail,
  // Error Boundary
  ErrorBoundary,
  // Auth Components
  PrivateRoute,
  // Theme Toggle
  ThemeToggle,
  // User Profile Modal
  UserProfileModal,
}

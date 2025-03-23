import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { ToastContainer } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import "./styles/base.css"
import "./styles/components.css"
import "./styles/pages.css"
import "./styles/utilities.css"
import "./styles/settings.css"
import "./styles/notifications.css"

import {
  AuthProvider,
  UserProvider,
  ChatProvider,
  StoriesProvider,
  ThemeProvider,
  NotificationProvider,
} from "./context"
import ErrorBoundary from "./components/ErrorBoundary.jsx"
import PrivateRoute from "./components/PrivateRoute.jsx"
import Login from "./pages/Login"
import Register from "./pages/Register"
import Dashboard from "./pages/Dashboard"
import UserProfile from "./pages/UserProfile"
import Profile from "./pages/Profile"
import Settings from "./pages/Settings.jsx"
import NotFound from "./pages/NotFound"
import Home from "./pages/Home"
import Messages from "./pages/Messages.jsx"
import Subscription from "./pages/Subscription" // Import the Subscription component

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <ThemeProvider>
          <AuthProvider>
            <UserProvider>
              <ChatProvider>
                <StoriesProvider>
                  <NotificationProvider>
                    <div className="app">
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route
                          path="/dashboard"
                          element={
                            <PrivateRoute>
                              <Dashboard />
                            </PrivateRoute>
                          }
                        />
                        <Route
                          path="/user/:id"
                          element={
                            <PrivateRoute>
                              <UserProfile />
                            </PrivateRoute>
                          }
                        />
                        <Route
                          path="/profile"
                          element={
                            <PrivateRoute>
                              <Profile />
                            </PrivateRoute>
                          }
                        />
                        <Route
                          path="/Messages"
                          element={
                            <PrivateRoute>
                              <Messages />
                            </PrivateRoute>
                          }
                        />
                        <Route
                          path="/settings"
                          element={
                            <PrivateRoute>
                              <Settings />
                            </PrivateRoute>
                          }
                        />
                        {/* Add the Subscription route */}
                        <Route
                          path="/subscription"
                          element={
                            <PrivateRoute>
                              <Subscription />
                            </PrivateRoute>
                          }
                        />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                      <ToastContainer
                        position="top-right"
                        autoClose={3000}
                        hideProgressBar={false}
                        closeOnClick
                        pauseOnHover
                        limit={5} /* Limit the number of toasts shown at once */
                        theme="colored" /* Use colored theme for better visibility */
                      />
                    </div>
                  </NotificationProvider>
                </StoriesProvider>
              </ChatProvider>
            </UserProvider>
          </AuthProvider>
        </ThemeProvider>
      </Router>
    </ErrorBoundary>
  )
}

export default App

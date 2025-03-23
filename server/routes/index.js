import express from "express"
import authRoutes from "./authRoutes.js"
import userRoutes from "./userRoutes.js"
import messageRoutes from "./messageRoutes.js"
import storyRoutes from "./storyRoutes.js"
import notificationRoutes from "./notificationRoutes.js"
import avatarRoutes from "./avatarRoutes.js"
import subscriptionRoutes from "./subscriptionRoutes.js"

const router = express.Router()

// Health check route
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
    version: process.env.API_VERSION || "1.0.0",
  })
})

// Mount routes
router.use("/auth", authRoutes)
router.use("/users", userRoutes)
router.use("/messages", messageRoutes)
router.use("/stories", storyRoutes)
router.use("/notifications", notificationRoutes)
router.use("/avatars", avatarRoutes)
router.use("/subscription", subscriptionRoutes)

export default router

import express from "express"
import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import { User } from "../models/index.js"
import config from "../config.js"
import logger from "../logger.js"

const router = express.Router()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * @route   GET /api/avatar/:userId
 * @desc    Get user avatar by user ID
 * @access  Public
 */
router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params

    // First check if user exists and has photos
    const user = await User.findById(userId).select("photos")

    if (user && user.photos && user.photos.length > 0) {
      // Get the first photo (profile photo)
      const profilePhoto = user.photos[0]

      // If the photo URL is a full path (starts with http), redirect to it
      if (profilePhoto.url.startsWith("http")) {
        return res.redirect(profilePhoto.url)
      }

      // Otherwise, it's a local path - extract the filename
      const filename = profilePhoto.url.split("/").pop()
      const filePath = path.join(config.FILE_UPLOAD_PATH, filename)

      // Check if file exists
      if (fs.existsSync(filePath)) {
        // Set cache headers
        res.setHeader("Cache-Control", "public, max-age=86400") // 1 day
        res.setHeader("Expires", new Date(Date.now() + 86400000).toUTCString())

        return res.sendFile(filePath)
      }
    }

    // If we get here, try the legacy path format
    const legacyFilePath = path.join(config.FILE_UPLOAD_PATH, `user-${userId}.jpg`)

    if (fs.existsSync(legacyFilePath)) {
      // Set cache headers
      res.setHeader("Cache-Control", "public, max-age=86400") // 1 day
      res.setHeader("Expires", new Date(Date.now() + 86400000).toUTCString())

      return res.sendFile(legacyFilePath)
    }

    // If no avatar found, send default avatar
    const defaultAvatarPath = path.join(__dirname, "..", "public", "default-avatar.png")

    if (fs.existsSync(defaultAvatarPath)) {
      return res.sendFile(defaultAvatarPath)
    }

    // If even the default avatar doesn't exist, send 404
    res.status(404).json({ success: false, error: "Avatar not found" })
  } catch (err) {
    logger.error(`Error fetching avatar: ${err.message}`)
    res.status(500).json({ success: false, error: "Server error" })
  }
})

export default router

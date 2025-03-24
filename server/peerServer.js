import { ExpressPeerServer } from "peer"

/**
 * Initialize PeerJS server
 * @param {Object} server - HTTP server instance
 */
const initializePeerServer = (server) => {
  try {
    const peerServer = ExpressPeerServer(server, {
      debug: true,
      path: "/peerjs",
      port: process.env.PEER_PORT || 9000,
      proxied: true,
      allow_discovery: true,
      key: "peerjs",
    })

    // Add PeerJS server routes to the Express app
    server._events.request._router.use("/peerjs", peerServer)

    // Add a health check endpoint
    server._events.request._router.get("/peer-health", (req, res) => {
      res.json({ status: "ok", message: "PeerJS server is running" })
    })

    // Log PeerJS server events
    peerServer.on("connection", (client) => {

    })

    peerServer.on("disconnect", (client) => {

    })

    peerServer.on("error", (error) => {
    })
    return peerServer
  } catch (error) {
    throw error
  }
}

export default initializePeerServer

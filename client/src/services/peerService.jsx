"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Peer } from "peerjs"

// Simple console logger that can be safely removed
const log = (level, ...args) => {
  if (process.env.NODE_ENV !== "production") {
    console[level]("[PeerService]", ...args)
  }
}

const usePeerService = () => {
  const [peer, setPeer] = useState(null)
  const [myPeerId, setMyPeerId] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [error, setError] = useState(null)
  const peerConnectionsRef = useRef(new Map())
  const mediaConnectionsRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const isDestroyedRef = useRef(false)
  const reconnectTimeoutRef = useRef(null)
  const peerInstanceRef = useRef(null)

  // Initialize PeerJS connection
  const initializePeer = useCallback(async (userId) => {
    try {
      // Clear any existing reconnect timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      setConnectionStatus("connecting")
      setError(null)

      // Clean up any existing peer connection
      if (peerInstanceRef.current) {
        log("info", "Destroying existing peer before creating a new one")
        try {
          peerInstanceRef.current.destroy()
        } catch (err) {
          log("error", "Error destroying existing peer:", err)
        }
        peerInstanceRef.current = null
      }

      // Reset the destroyed flag
      isDestroyedRef.current = false

      // Generate a unique ID for this peer instance
      const uniqueId = `${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`
      log("info", `Creating new peer with ID: ${uniqueId}`)

      // Create a new Peer instance with ICE servers for NAT traversal
      const newPeer = new Peer(uniqueId, {
        host: window.location.hostname,
        port: 9000, // Use a fixed port for simplicity
        path: "/peerjs",
        secure: window.location.protocol === "https:",
        debug: 2, // Set to 2 for more verbose debugging
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
          ],
        },
      })

      // Store the peer instance in the ref
      peerInstanceRef.current = newPeer

      // Set up event listeners
      newPeer.on("open", (id) => {
        log("info", `PeerJS connection established with ID: ${id}`)
        setMyPeerId(id)
        setConnectionStatus("connected")
      })

      newPeer.on("error", (err) => {
        log("error", `PeerJS error: ${err.type}`, err)
        setError(err.message)
        setConnectionStatus("error")

        // Attempt to reconnect if the server is unavailable
        if (err.type === "server-error" || err.type === "network") {
          handleReconnect(userId)
        }
      })

      newPeer.on("connection", (conn) => {
        log("info", `Incoming data connection from: ${conn.peer}`)
        handleConnection(conn)
      })

      newPeer.on("call", (call) => {
        log("info", `Incoming call from: ${call.peer}`)
        mediaConnectionsRef.current.set(call.peer, call)
      })

      newPeer.on("close", () => {
        log("info", "PeerJS connection closed")
        setConnectionStatus("disconnected")
        isDestroyedRef.current = true
      })

      newPeer.on("disconnected", () => {
        log("info", "PeerJS disconnected")
        setConnectionStatus("disconnected")

        // Only attempt to reconnect if the peer hasn't been destroyed
        if (!isDestroyedRef.current) {
          handleReconnect(userId)
        }
      })

      setPeer(newPeer)

      return newPeer
    } catch (err) {
      log("error", "Failed to initialize PeerJS:", err)
      setError(err.message)
      setConnectionStatus("error")
      throw err
    }
  }, [])

  // Handle reconnection logic
  const handleReconnect = useCallback(
    (userId) => {
      // Clear any existing reconnect timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      log("info", "Scheduling reconnection attempt...")

      // Set a timeout to avoid rapid reconnection attempts
      reconnectTimeoutRef.current = setTimeout(() => {
        log("info", "Attempting to reconnect PeerJS...")

        // Always create a new peer instance on reconnect to avoid issues
        initializePeer(userId)
      }, 5000) // Longer timeout to give server more time
    },
    [initializePeer],
  )

  // Handle incoming data connections
  const handleConnection = (conn) => {
    peerConnectionsRef.current.set(conn.peer, conn)

    conn.on("data", (data) => {
      log("info", `Data received from ${conn.peer}:`, data)
      // Handle incoming data
    })

    conn.on("close", () => {
      log("info", `Connection with ${conn.peer} closed`)
      peerConnectionsRef.current.delete(conn.peer)
    })

    conn.on("error", (err) => {
      log("error", `Connection error with ${conn.peer}:`, err)
    })
  }

  // Get user media (camera and microphone)
  const getUserMedia = useCallback(async (options = { video: true, audio: true }) => {
    try {
      log("info", "Requesting user media with options:", options)

      // Stop any existing stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }

      // Get new stream
      const stream = await navigator.mediaDevices.getUserMedia(options)
      localStreamRef.current = stream
      log("info", "User media obtained successfully")

      return stream
    } catch (err) {
      log("error", "Failed to get user media:", err)
      setError(`Media error: ${err.message}`)
      throw err
    }
  }, [])

  // Make a call to another peer
  const callPeer = useCallback(
    async (remotePeerId, options = { video: true, audio: true }) => {
      try {
        if (!peerInstanceRef.current) {
          throw new Error("PeerJS not initialized")
        }

        log("info", `Calling peer: ${remotePeerId}`)

        // Get local media stream
        const localStream = await getUserMedia(options)

        // Call the remote peer
        const call = peerInstanceRef.current.call(remotePeerId, localStream, {
          metadata: {
            caller: myPeerId,
            options,
          },
        })

        if (!call) {
          throw new Error("Failed to establish call")
        }

        mediaConnectionsRef.current.set(remotePeerId, call)

        // Set up call event handlers
        call.on("stream", (remoteStream) => {
          log("info", `Received stream from ${remotePeerId}`)
          // The remoteStream will be handled by the component
          return remoteStream
        })

        call.on("close", () => {
          log("info", `Call with ${remotePeerId} closed`)
          mediaConnectionsRef.current.delete(remotePeerId)
        })

        call.on("error", (err) => {
          log("error", `Call error with ${remotePeerId}:`, err)
          mediaConnectionsRef.current.delete(remotePeerId)
        })

        return { call, localStream }
      } catch (err) {
        log("error", `Failed to call peer ${remotePeerId}:`, err)
        setError(`Call error: ${err.message}`)
        throw err
      }
    },
    [myPeerId, getUserMedia],
  )

  // Answer an incoming call
  const answerCall = useCallback(
    async (callerId, options = { video: true, audio: true }) => {
      try {
        if (!peerInstanceRef.current) {
          throw new Error("PeerJS not initialized")
        }

        log("info", `Answering call from: ${callerId}`)

        // Get the call object
        const call = mediaConnectionsRef.current.get(callerId)

        if (!call) {
          throw new Error(`No incoming call from ${callerId}`)
        }

        // Get local media stream
        const localStream = await getUserMedia(options)

        // Answer the call
        call.answer(localStream)

        // Set up call event handlers
        call.on("stream", (remoteStream) => {
          log("info", `Received stream from ${callerId}`)
          // The remoteStream will be handled by the component
          return remoteStream
        })

        call.on("close", () => {
          log("info", `Call with ${callerId} closed`)
          mediaConnectionsRef.current.delete(callerId)
        })

        call.on("error", (err) => {
          log("error", `Call error with ${callerId}:`, err)
          mediaConnectionsRef.current.delete(callerId)
        })

        return { call, localStream }
      } catch (err) {
        log("error", `Failed to answer call from ${callerId}:`, err)
        setError(`Answer error: ${err.message}`)
        throw err
      }
    },
    [getUserMedia],
  )

  // End a call
  const endCall = useCallback((remotePeerId) => {
    try {
      log("info", `Ending call with: ${remotePeerId}`)

      // Get the call object
      const call = mediaConnectionsRef.current.get(remotePeerId)

      if (call) {
        call.close()
        mediaConnectionsRef.current.delete(remotePeerId)
      }

      // Stop local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = null
      }

      log("info", `Call with ${remotePeerId} ended`)
    } catch (err) {
      log("error", `Failed to end call with ${remotePeerId}:`, err)
      setError(`End call error: ${err.message}`)
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Clear any reconnect timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      if (peerInstanceRef.current) {
        isDestroyedRef.current = true
        try {
          peerInstanceRef.current.destroy()
        } catch (err) {
          log("error", "Error destroying peer on cleanup:", err)
        }
        peerInstanceRef.current = null
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }

      peerConnectionsRef.current.clear()
      mediaConnectionsRef.current.clear()
    }
  }, [])

  return {
    peer: peerInstanceRef.current,
    myPeerId,
    connectionStatus,
    error,
    initializePeer,
    getUserMedia,
    callPeer,
    answerCall,
    endCall,
    localStream: localStreamRef.current,
  }
}

export default usePeerService

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Peer } from "peerjs"

// Consistent logger that works across environments
const log = (level, ...args) => {
  if (process.env.NODE_ENV !== "production" || level === "error") {
    console[level]("[PeerService]", ...args)
  }
}

/**
 * Custom hook for WebRTC peer-to-peer connections
 * Manages video/audio streams and peer connections
 */
const usePeerService = () => {
  const [myPeerId, setMyPeerId] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [error, setError] = useState(null)
  
  // Using refs for values that shouldn't trigger re-renders
  const peerRef = useRef(null)
  const peerConnectionsRef = useRef(new Map())
  const mediaConnectionsRef = useRef(new Map())
  const localStreamRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const isDestroyedRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  
  /**
   * Clean up resources
   */
  const cleanupResources = useCallback(() => {
    // Clean up any media streams
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    
    // Close media connections
    mediaConnectionsRef.current.forEach(conn => {
      try {
        conn.close()
      } catch (err) {
        log("warn", "Error closing media connection", err)
      }
    })
    mediaConnectionsRef.current.clear()
    
    // Close data connections
    peerConnectionsRef.current.forEach(conn => {
      try {
        conn.close()
      } catch (err) {
        log("warn", "Error closing peer connection", err)
      }
    })
    peerConnectionsRef.current.clear()
    
    // Clear any pending timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])
  
  /**
   * Initialize the PeerJS connection
   * @param {string} userId - User identifier to use for the peer ID
   * @returns {Promise<Peer>} - The initialized peer object
   */
  const initializePeer = useCallback(async (userId) => {
    try {
      // Clean up any existing resources
      cleanupResources()
      
      // Clear any existing reconnect timeouts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      setConnectionStatus("connecting")
      setError(null)
      reconnectAttemptsRef.current = 0

      // Clean up any existing peer
      if (peerRef.current) {
        log("info", "Destroying existing peer before creating a new one")
        try {
          peerRef.current.destroy()
        } catch (err) {
          log("error", "Error destroying existing peer:", err)
        }
        peerRef.current = null
      }

      // Reset flags
      isDestroyedRef.current = false

      // Generate a unique ID for this peer instance
      const uniqueId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      log("info", `Creating new peer with ID: ${uniqueId}`)

      // Determine if we're in production or development mode
      const isProd = process.env.NODE_ENV === "production"
      const useSecure = window.location.protocol === "https:" || isProd
      
      // Get the host from the window location
      const host = window.location.hostname
      
      // PeerJS configuration optimized for different environments
      const peerConfig = {
        host: host,
        port: useSecure ? 443 : 9000, // Use 443 for production HTTPS, 9000 for dev
        path: "/peerjs",
        secure: useSecure,
        debug: isProd ? 0 : 2, // More verbose in dev
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun2.l.google.com:19302" },
            // Fallback STUN servers from other providers
            { urls: "stun:stun.stunprotocol.org:3478" },
            { urls: "stun:stun.ekiga.net:3478" },
          ],
          iceCandidatePoolSize: 10,
        },
      }

      log("info", "PeerJS configuration:", peerConfig)
      
      // Create a new Peer instance with the config
      const newPeer = new Peer(uniqueId, peerConfig)
      
      // Store the peer instance
      peerRef.current = newPeer

      // Return a promise that resolves when the peer is connected
      return new Promise((resolve, reject) => {
        // Set timeout for initial connection
        const connectionTimeout = setTimeout(() => {
          if (connectionStatus !== "connected") {
            setError("Failed to connect to signaling server")
            setConnectionStatus("error")
            reject(new Error("Connection timeout"))
          }
        }, 15000) // 15 second timeout
        
        // Set up event listeners
        newPeer.on("open", (id) => {
          log("info", `PeerJS connection established with ID: ${id}`)
          setMyPeerId(id)
          setConnectionStatus("connected")
          clearTimeout(connectionTimeout)
          resolve(newPeer)
        })

        newPeer.on("error", (err) => {
          log("error", `PeerJS error: ${err.type}`, err)
          setError(err.message)
          
          if (connectionStatus === "connecting") {
            setConnectionStatus("error")
            clearTimeout(connectionTimeout)
            reject(err)
          } else {
            setConnectionStatus("error")
          }

          // Attempt to reconnect for certain error types
          if (!isDestroyedRef.current && ["network", "server-error", "disconnected"].includes(err.type)) {
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
          
          // Emit a custom event that components can listen for
          window.dispatchEvent(new CustomEvent("peerIncomingCall", {
            detail: { call, peerId: call.peer }
          }))
        })

        newPeer.on("close", () => {
          log("info", "PeerJS connection closed")
          setConnectionStatus("disconnected")
          isDestroyedRef.current = true
        })

        newPeer.on("disconnected", () => {
          log("info", "PeerJS disconnected")
          setConnectionStatus("disconnected")

          // Only attempt to reconnect if not destroyed
          if (!isDestroyedRef.current) {
            handleReconnect(userId)
          }
        })
      })
    } catch (err) {
      log("error", "Failed to initialize PeerJS:", err)
      setError(err.message)
      setConnectionStatus("error")
      throw err
    }
  }, [cleanupResources])

  /**
   * Handle reconnection logic
   * @param {string} userId - User ID for reconnection
   */
  const handleReconnect = useCallback((userId) => {
    // Increment reconnect attempts
    reconnectAttemptsRef.current++
    
    // Don't reconnect too many times
    if (reconnectAttemptsRef.current > 5) {
      log("error", "Maximum reconnection attempts reached")
      setConnectionStatus("error")
      setError("Failed to reconnect after multiple attempts")
      return
    }
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    // Calculate backoff delay (1s, 2s, 4s, 8s, 16s)
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 16000)
    
    log("info", `Scheduling reconnection attempt in ${delay}ms (attempt ${reconnectAttemptsRef.current})`)

    // Set a timeout to avoid rapid reconnection attempts
    reconnectTimeoutRef.current = setTimeout(() => {
      log("info", "Attempting to reconnect PeerJS...")

      // Always create a new peer instance on reconnect
      initializePeer(userId).catch(err => {
        log("error", "Reconnection attempt failed:", err)
      })
    }, delay)
  }, [initializePeer])

  /**
   * Handle incoming data connections
   * @param {DataConnection} conn - The data connection
   */
  const handleConnection = (conn) => {
    // Store the connection
    peerConnectionsRef.current.set(conn.peer, conn)

    // Set up event handlers for the connection
    conn.on("data", (data) => {
      log("info", `Data received from ${conn.peer}:`, data)
      // Process incoming data if needed
    })

    conn.on("close", () => {
      log("info", `Connection with ${conn.peer} closed`)
      peerConnectionsRef.current.delete(conn.peer)
    })

    conn.on("error", (err) => {
      log("error", `Connection error with ${conn.peer}:`, err)
    })
  }

  /**
   * Get user media (camera and microphone)
   * @param {Object} options - Media constraints
   * @returns {Promise<MediaStream>} - User media stream
   */
  const getUserMedia = useCallback(async (options = { video: true, audio: true }) => {
    try {
      log("info", "Requesting user media with options:", options)

      // Stop any existing stream to avoid duplicate camera/mic usage
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }

      // Request permission and get stream
      const stream = await navigator.mediaDevices.getUserMedia(options)
      localStreamRef.current = stream
      log("info", "User media obtained successfully")

      return stream
    } catch (err) {
      // Handle common getUserMedia errors with user-friendly messages
      let errorMessage = "Failed to access camera/microphone"
      
      if (err.name === "NotAllowedError") {
        errorMessage = "Camera/microphone access denied. Please check your browser permissions."
      } else if (err.name === "NotFoundError") {
        errorMessage = "No camera or microphone found. Please check your device connections."
      } else if (err.name === "NotReadableError") {
        errorMessage = "Camera or microphone is already in use by another application."
      } else if (err.name === "OverconstrainedError") {
        errorMessage = "Camera constraints cannot be satisfied. Try different video settings."
      }
      
      log("error", `${errorMessage} (${err.name}):`, err)
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [])

  /**
   * Call another peer
   * @param {string} remotePeerId - The ID of the peer to call
   * @param {Object} options - Media options
   * @returns {Promise<Object>} - Call and local stream
   */
  const callPeer = useCallback(async (remotePeerId, options = { video: true, audio: true }) => {
    try {
      if (!peerRef.current) {
        throw new Error("PeerJS not initialized")
      }

      log("info", `Calling peer: ${remotePeerId}`)

      // Get local media stream if we don't already have one
      if (!localStreamRef.current) {
        localStreamRef.current = await getUserMedia(options)
      }

      // Create a call to the remote peer
      const call = peerRef.current.call(remotePeerId, localStreamRef.current, {
        metadata: {
          caller: myPeerId,
          options,
          timestamp: Date.now(),
        },
      })

      if (!call) {
        throw new Error("Failed to establish call")
      }

      // Store the media connection
      mediaConnectionsRef.current.set(remotePeerId, call)

      // Return a promise that resolves when the remote stream is received
      return new Promise((resolve, reject) => {
        // Set up a timeout for connection
        const callTimeout = setTimeout(() => {
          reject(new Error("Call connection timeout - no answer received"))
        }, 30000) // 30 second timeout
        
        // Set up call event handlers
        call.on("stream", (remoteStream) => {
          log("info", `Received stream from ${remotePeerId}`)
          clearTimeout(callTimeout)
          
          // Emit event for components to react to
          window.dispatchEvent(new CustomEvent("peerStreamReceived", {
            detail: { peerId: remotePeerId, stream: remoteStream }
          }))
          
          resolve({ call, localStream: localStreamRef.current })
        })

        call.on("close", () => {
          log("info", `Call with ${remotePeerId} closed`)
          mediaConnectionsRef.current.delete(remotePeerId)
          clearTimeout(callTimeout)
          
          // Emit close event
          window.dispatchEvent(new CustomEvent("peerCallClosed", {
            detail: { peerId: remotePeerId }
          }))
        })

        call.on("error", (err) => {
          log("error", `Call error with ${remotePeerId}:`, err)
          mediaConnectionsRef.current.delete(remotePeerId)
          clearTimeout(callTimeout)
          reject(err)
        })
      })
    } catch (err) {
      log("error", `Failed to call peer ${remotePeerId}:`, err)
      setError(`Call error: ${err.message}`)
      throw err
    }
  }, [myPeerId, getUserMedia])

  /**
   * Answer an incoming call
   * @param {string} callerId - ID of the caller
   * @param {Object} options - Media options
   * @returns {Promise<Object>} - Call and local stream
   */
  const answerCall = useCallback(async (callerId, options = { video: true, audio: true }) => {
    try {
      if (!peerRef.current) {
        throw new Error("PeerJS not initialized")
      }

      log("info", `Answering call from: ${callerId}`)

      // Get the call object
      const call = mediaConnectionsRef.current.get(callerId)

      if (!call) {
        throw new Error(`No incoming call from ${callerId}`)
      }

      // Get local media stream
      if (!localStreamRef.current) {
        localStreamRef.current = await getUserMedia(options)
      }

      // Answer the call
      log("info", "Answering call with local stream")
      call.answer(localStreamRef.current)

      // Return a promise that resolves when the remote stream is received
      return new Promise((resolve, reject) => {
        // Set up call event handlers
        call.on("stream", (remoteStream) => {
          log("info", `Received stream from ${callerId}`)
          
          // Emit event
          window.dispatchEvent(new CustomEvent("peerStreamReceived", {
            detail: { peerId: callerId, stream: remoteStream }
          }))
          
          resolve({ call, localStream: localStreamRef.current })
        })

        call.on("close", () => {
          log("info", `Call with ${callerId} closed`)
          mediaConnectionsRef.current.delete(callerId)
          
          // Emit close event
          window.dispatchEvent(new CustomEvent("peerCallClosed", {
            detail: { peerId: callerId }
          }))
        })

        call.on("error", (err) => {
          log("error", `Call error with ${callerId}:`, err)
          mediaConnectionsRef.current.delete(callerId)
          reject(err)
        })
        
        // Set up a timeout
        setTimeout(() => {
          if (!call.open) {
            reject(new Error("Call answer timeout - no stream received"))
          }
        }, 30000) // 30 second timeout
      })
    } catch (err) {
      log("error", `Failed to answer call from ${callerId}:`, err)
      setError(`Answer error: ${err.message}`)
      throw err
    }
  }, [getUserMedia])

  /**
   * End a call with a remote peer
   * @param {string} remotePeerId - ID of the remote peer
   */
  const endCall = useCallback((remotePeerId) => {
    try {
      log("info", `Ending call with: ${remotePeerId}`)

      // Get the call object
      const call = mediaConnectionsRef.current.get(remotePeerId)

      if (call) {
        call.close()
        mediaConnectionsRef.current.delete(remotePeerId)
      }

      // Emit event
      window.dispatchEvent(new CustomEvent("peerCallEnded", {
        detail: { peerId: remotePeerId }
      }))

      log("info", `Call with ${remotePeerId} ended`)
    } catch (err) {
      log("error", `Failed to end call with ${remotePeerId}:`, err)
      setError(`End call error: ${err.message}`)
    }
  }, [])

  /**
   * Stop all media tracks and release camera/microphone
   */
  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop()
      })
      localStreamRef.current = null
      log("info", "Stopped all local media tracks")
    }
  }, [])

  /**
   * Destroy the peer connection entirely
   */
  const destroyPeer = useCallback(() => {
    isDestroyedRef.current = true
    
    // Stop media
    stopLocalStream()
    
    // Close all connections
    if (peerRef.current) {
      try {
        peerRef.current.destroy()
        peerRef.current = null
        setMyPeerId(null)
        setConnectionStatus("disconnected")
        log("info", "Peer connection destroyed")
      } catch (err) {
        log("error", "Error destroying peer:", err)
      }
    }
    
    // Clean up collections
    peerConnectionsRef.current.clear()
    mediaConnectionsRef.current.clear()
    
    // Clear timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [stopLocalStream])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      log("info", "Component unmounting, cleaning up peer resources")
      destroyPeer()
    }
  }, [destroyPeer])

  // Return the hook API
  return {
    peer: peerRef.current,
    myPeerId,
    connectionStatus,
    error,
    initializePeer,
    getUserMedia,
    callPeer,
    answerCall,
    endCall,
    stopLocalStream,
    destroyPeer,
    localStream: localStreamRef.current,
  }
}

export default usePeerService

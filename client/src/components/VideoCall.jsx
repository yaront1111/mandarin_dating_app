"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize, Minimize } from "lucide-react"
import usePeerService from "../services/peerService"
import { toast } from "react-toastify"

// Logger for development and debugging
const log = (level, ...args) => {
  if (process.env.NODE_ENV !== "production" || level === "error") {
    console[level]("[VideoCall]", ...args)
  }
}

/**
 * VideoCall Component
 * Handles WebRTC video calls between users
 */
const VideoCall = ({
  isActive,
  callData,
  onEndCall,
  userId,
  recipientId,
  isIncoming = false,
  onAccept,
  onReject
}) => {
  // Component state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState("connecting")
  const [callTimer, setCallTimer] = useState(0)
  const [callStartTime, setCallStartTime] = useState(null)
  const [remotePeerConnected, setRemotePeerConnected] = useState(false)

  // Refs
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const callTimerRef = useRef(null)
  const callTimeoutRef = useRef(null)

  // Initialize Peer service
  const {
    initializePeer,
    callPeer,
    answerCall,
    endCall: endPeerCall,
    getUserMedia,
    myPeerId,
    connectionStatus: peerConnectionStatus,
    error: peerError,
    localStream,
    stopLocalStream
  } = usePeerService()

  // ---- Effect: Initialize peer connection when component becomes active ----
  useEffect(() => {
    let isMounted = true

    const setupPeer = async () => {
      if (!isActive || !userId) return

      try {
        log("info", "Initializing peer connection")

        // Generate a unique session ID with the userId
        const uniqueSessionId = `user_${userId}_${Date.now()}`

        // Initialize the peer connection
        await initializePeer(uniqueSessionId)

        log("info", "Peer initialized with ID:", myPeerId)

        // Set up media when peer is connected
        if (isMounted) {
          setupMediaStreams()
        }
      } catch (err) {
        log("error", "Failed to initialize peer:", err)

        if (isMounted) {
          setConnectionStatus("error")
          toast.error("Failed to establish video connection")
        }
      }
    }

    // Set up immediately if active
    if (isActive) {
      setupPeer()
    }

    // Cleanup function
    return () => {
      isMounted = false
      clearCallTimers()
    }
  }, [isActive, userId, initializePeer, myPeerId])

  // Set up media streams (camera and microphone)
  const setupMediaStreams = useCallback(async () => {
    if (!isActive) return

    try {
      log("info", "Setting up media streams")

      // Get user's camera and microphone
      const stream = await getUserMedia({ video: true, audio: true })

      // Set local video stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        log("info", "Local video stream set successfully")
      }

      // If this is an incoming call that we've accepted or an outgoing call
      if (isIncoming || !isIncoming) {
        setConnectionStatus("connecting")
      }
    } catch (err) {
      log("error", "Failed to get user media:", err)
      setConnectionStatus("error")
      toast.error("Could not access camera or microphone")
    }
  }, [isActive, getUserMedia, isIncoming])

  // ---- Effect: Handle call state changes ----
  useEffect(() => {
    let isMounted = true

    // Handle incoming call that was accepted
    const handleAcceptedIncomingCall = async () => {
      if (!callData || !callData.callerPeerId || !myPeerId) return

      log("info", `Answering call from peer: ${callData.callerPeerId}`)

      try {
        setConnectionStatus("connecting")

        // Make the peer connection
        const { call } = await callPeer(callData.callerPeerId)

        // Set call timeout
        setCallTimeout()

        // Successful connection
        if (isMounted) {
          setConnectionStatus("connected")
          setRemotePeerConnected(true)
          startCallTimer()
        }
      } catch (err) {
        log("error", "Error connecting to caller:", err)

        if (isMounted) {
          setConnectionStatus("error")
          toast.error("Failed to connect to caller")
        }
      }
    }

    // Handle outgoing call that was answered
    const handleAnsweredOutgoingCall = async () => {
      if (!callData || !callData.respondentPeerId || !myPeerId) return

      log("info", `Connecting to call respondent: ${callData.respondentPeerId}`)

      try {
        setConnectionStatus("connecting")

        // Make the peer connection
        const { call } = await callPeer(callData.respondentPeerId)

        // Set call timeout
        setCallTimeout()

        // Successful connection
        if (isMounted) {
          setConnectionStatus("connected")
          setRemotePeerConnected(true)
          startCallTimer()
        }
      } catch (err) {
        log("error", "Error connecting to call respondent:", err)

        if (isMounted) {
          setConnectionStatus("error")
          toast.error("Failed to connect to recipient")
        }
      }
    }

    // Execute appropriate logic based on call state
    if (isActive && myPeerId) {
      if (isIncoming && callData?.accepted) {
        handleAcceptedIncomingCall()
      } else if (!isIncoming && callData?.respondentPeerId) {
        handleAnsweredOutgoingCall()
      }
    }

    // Cleanup function
    return () => {
      isMounted = false
    }
  }, [isActive, callData, isIncoming, myPeerId, callPeer])

  // ---- Handle remote stream from peer ----
  useEffect(() => {
    const handleRemoteStream = (event) => {
      const { peerId, stream } = event.detail

      // Check if this stream is for our call
      const expectedPeerId = isIncoming ? callData?.callerPeerId : callData?.respondentPeerId

      if (expectedPeerId === peerId && remoteVideoRef.current) {
        log("info", `Received remote stream from ${peerId}`)
        remoteVideoRef.current.srcObject = stream
        setRemotePeerConnected(true)
        setConnectionStatus("connected")
        startCallTimer()
      }
    }

    // Listen for the peer stream event
    window.addEventListener("peerStreamReceived", handleRemoteStream)

    return () => {
      window.removeEventListener("peerStreamReceived", handleRemoteStream)
    }
  }, [callData, isIncoming])

  // ---- Handle call closed or ended by peer ----
  useEffect(() => {
    const handleCallClosed = (event) => {
      const { peerId } = event.detail

      // Check if this is our call
      const expectedPeerId = isIncoming ? callData?.callerPeerId : callData?.respondentPeerId

      if (expectedPeerId === peerId) {
        log("info", `Call with ${peerId} was closed by peer`)
        handleEndCall()
      }
    }

    // Listen for the call closed event
    window.addEventListener("peerCallClosed", handleCallClosed)
    window.addEventListener("peerCallEnded", handleCallClosed)

    return () => {
      window.removeEventListener("peerCallClosed", handleCallClosed)
      window.removeEventListener("peerCallEnded", handleCallClosed)
    }
  }, [callData, isIncoming])

  // Set a timeout for the call connection
  const setCallTimeout = () => {
    // Clear any existing timeout
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current)
    }

    // Set new timeout
    callTimeoutRef.current = setTimeout(() => {
      if (connectionStatus !== "connected") {
        log("error", "Call connection timed out")
        setConnectionStatus("error")
        toast.error("Call connection timed out")
        handleEndCall()
      }
    }, 30000) // 30 second timeout
  }

  // Clear all timers
  const clearCallTimers = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }

    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = null
    }
  }

  // Start the call timer
  const startCallTimer = () => {
    // Don't start multiple timers
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
    }

    // Record the start time
    setCallStartTime(Date.now())

    // Update the timer every second
    callTimerRef.current = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - callStartTime) / 1000)
      setCallTimer(elapsedSeconds)
    }, 1000)
  }

  // Format the call timer for display
  const formatCallTime = (seconds) => {
    if (!seconds) return "00:00"

    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  // Toggle mute state
  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks()
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  // Toggle video state
  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks()
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsVideoEnabled(!isVideoEnabled)
    }
  }

  // Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  // Handle ending the call
  const handleEndCall = () => {
    log("info", "Ending call")

    // Clear timers
    clearCallTimers()

    // End peer connection
    const targetPeerId = isIncoming ? callData?.callerPeerId : callData?.respondentPeerId
    if (targetPeerId) {
      try {
        endPeerCall(targetPeerId)
      } catch (err) {
        log("error", "Error ending peer call:", err)
      }
    }

    // Stop local media streams
    stopLocalStream()

    // Notify parent component
    if (onEndCall) {
      onEndCall()
    }
  }

  // Handle accepting the call
  const handleAcceptCall = () => {
    log("info", "Accepting call")
    if (onAccept) {
      onAccept()
    }
  }

  // Handle rejecting the call
  const handleRejectCall = () => {
    log("info", "Rejecting call")
    if (onReject) {
      onReject()
    }
  }

  // ---- Render incoming call UI (before accepting) ----
  if (isIncoming && !callData?.accepted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
          <div className="text-center text-white">
            <h3 className="text-xl font-semibold mb-4">
              Incoming Call from {callData?.callerName || "Unknown"}
            </h3>
            <div className="flex justify-center space-x-4 mt-6">
              <button
                onClick={handleRejectCall}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full p-4"
              >
                <PhoneOff size={24} />
              </button>
              <button
                onClick={handleAcceptCall}
                className="bg-green-500 hover:bg-green-600 text-white rounded-full p-4"
              >
                <Video size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---- Render main call UI ----
  return isActive ? (
    <div
      className={`${isFullscreen ? "fixed inset-0 z-50" : "relative w-full h-full"} 
                 bg-black flex flex-col overflow-hidden rounded-lg`}
      style={{ minHeight: "400px" }}
    >
      {/* Status bar */}
      <div className="absolute top-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 flex justify-between items-center z-10">
        <div className="flex items-center">
          {connectionStatus === "connecting" && (
            <span className="flex items-center">
              <span className="animate-pulse mr-2">●</span> Connecting...
            </span>
          )}
          {connectionStatus === "connected" && formatCallTime(callTimer)}
          {connectionStatus === "error" && (
            <span className="text-red-500">Connection Error</span>
          )}
        </div>
        <button onClick={toggleFullscreen} className="text-white">
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>

      {/* Remote video (full size) */}
      <div className="flex-1 bg-gray-900 relative">
        {connectionStatus === "connected" && remotePeerConnected ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            {connectionStatus === "connecting" && (
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                <div className="text-xl">Connecting...</div>
              </div>
            )}
            {connectionStatus === "error" && (
              <div className="text-center text-red-500">
                <div className="text-xl mb-2">Connection Error</div>
                <div className="text-sm">Please check your internet connection and try again</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Local video (picture-in-picture) */}
      <div className="absolute bottom-20 right-4 w-1/4 aspect-video rounded-lg overflow-hidden border-2 border-white shadow-lg">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      </div>

      {/* Call controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 p-4 flex justify-center space-x-6">
        <button
          onClick={toggleMute}
          className={`rounded-full p-3 ${isMuted ? "bg-red-500" : "bg-gray-700"} transition-colors`}
        >
          {isMuted ? <MicOff size={24} className="text-white" /> : <Mic size={24} className="text-white" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`rounded-full p-3 ${!isVideoEnabled ? "bg-red-500" : "bg-gray-700"} transition-colors`}
        >
          {!isVideoEnabled ? (
            <VideoOff size={24} className="text-white" />
          ) : (
            <Video size={24} className="text-white" />
          )}
        </button>

        <button
          onClick={handleEndCall}
          className="bg-red-500 hover:bg-red-600 rounded-full p-3 transition-colors"
        >
          <PhoneOff size={24} className="text-white" />
        </button>
      </div>
    </div>
  ) : null
}

export default VideoCall

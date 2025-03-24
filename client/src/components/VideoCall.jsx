"use client"

import { useState, useEffect, useRef } from "react"
import { Mic, MicOff, Video, VideoOff, PhoneOff, Maximize, Minimize } from "lucide-react"
import usePeerService from "../services/peerService"

// Simple console logger that can be safely removed
const log = (level, ...args) => {
  if (process.env.NODE_ENV !== "production") {
    console[level]("[VideoCall]", ...args)
  }
}

const VideoCall = ({ isActive, callData, onEndCall, userId, isIncoming = false, onAccept, onReject }) => {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState("connecting")
  const [callTimer, setCallTimer] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const callTimerRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const callAttemptTimeoutRef = useRef(null)

  const {
    initializePeer,
    callPeer,
    answerCall,
    endCall,
    getUserMedia,
    myPeerId,
    connectionStatus: peerConnectionStatus,
    error: peerError,
  } = usePeerService()

  // Initialize PeerJS when component mounts
  useEffect(() => {
    if (isActive && !isInitialized) {
      log("info", "Initializing PeerJS for video call")

      // Generate a unique ID for this session
      const uniqueSessionId = `${userId}-${Date.now()}`

      initializePeer(uniqueSessionId)
        .then(() => {
          log("info", "PeerJS initialized successfully")
          setIsInitialized(true)
        })
        .catch((err) => {
          log("error", "Failed to initialize PeerJS:", err)
          setConnectionStatus("error")
        })
    }

    return () => {
      // Clean up when component unmounts
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current)
      }
      if (callAttemptTimeoutRef.current) {
        clearTimeout(callAttemptTimeoutRef.current)
      }
    }
  }, [isActive, userId, initializePeer, isInitialized])

  // Handle call initiation or answering
  useEffect(() => {
    const setupCall = async () => {
      try {
        if (!isActive || !myPeerId || !isInitialized) return

        log("info", "Setting up call with data:", callData)

        // Get local media stream
        const localStream = await getUserMedia({ video: true, audio: true })
        localStreamRef.current = localStream

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream
        }

        // If this is an outgoing call and we have the recipient's peer ID
        if (!isIncoming && callData?.recipientId && callData?.callerPeerId === myPeerId) {
          log("info", `Initiating outgoing call to ${callData.recipientId}`)
          setConnectionStatus("calling")

          // Wait for the recipient to answer with their peer ID
          // The actual call will be made when we receive the callAnswered event with their peer ID
        }
        // If this is an incoming call that we've accepted
        else if (isIncoming && callData?.caller && callData?.callerPeerId && callData?.accepted) {
          log("info", `Answering call from ${callData.caller} with peer ID ${callData.callerPeerId}`)
          setConnectionStatus("connecting")

          // Make the peer connection
          const { call } = await callPeer(callData.callerPeerId)

          call.on("stream", (remoteStream) => {
            log("info", "Received remote stream")
            remoteStreamRef.current = remoteStream

            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream
            }

            setConnectionStatus("connected")
            startCallTimer()
          })
        }
      } catch (err) {
        log("error", "Error setting up call:", err)
        setConnectionStatus("error")
      }
    }

    if (isInitialized) {
      setupCall()
    }
  }, [isActive, callData, isIncoming, myPeerId, getUserMedia, callPeer, answerCall, isInitialized])

  // Handle incoming call answer
  useEffect(() => {
    if (callData?.respondentPeerId && callData?.accepted && !isIncoming && isInitialized) {
      log("info", `Call answered by ${callData.recipient} with peer ID ${callData.respondentPeerId}`)

      const connectToPeer = async () => {
        try {
          setConnectionStatus("connecting")

          // Make the peer connection
          const { call } = await callPeer(callData.respondentPeerId)

          call.on("stream", (remoteStream) => {
            log("info", "Received remote stream")
            remoteStreamRef.current = remoteStream

            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream
            }

            setConnectionStatus("connected")
            startCallTimer()
          })

          // Set a timeout to handle call failure
          callAttemptTimeoutRef.current = setTimeout(() => {
            if (connectionStatus !== "connected") {
              log("error", "Call connection timed out")
              setConnectionStatus("error")
            }
          }, 30000) // 30 second timeout
        } catch (err) {
          log("error", "Error connecting to peer:", err)
          setConnectionStatus("error")
        }
      }

      connectToPeer()
    }
  }, [callData?.respondentPeerId, callData?.accepted, isIncoming, callPeer, isInitialized, connectionStatus])

  // Start call timer
  const startCallTimer = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
    }

    const startTime = Date.now()
    callTimerRef.current = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      setCallTimer(elapsedSeconds)
    }, 1000)
  }

  // Format call timer
  const formatCallTime = (seconds) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks()
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks()
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

  // Handle call end
  const handleEndCall = () => {
    log("info", "Ending call")

    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
    }

    if (callAttemptTimeoutRef.current) {
      clearTimeout(callAttemptTimeoutRef.current)
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
    }

    if (callData?.caller && callData?.recipient) {
      const otherUserId = userId === callData.caller ? callData.recipient : callData.caller
      endCall(otherUserId)
    }

    onEndCall()
  }

  // Handle call accept
  const handleAcceptCall = () => {
    log("info", "Accepting call")
    onAccept()
  }

  // Handle call reject
  const handleRejectCall = () => {
    log("info", "Rejecting call")
    onReject()
  }

  // Render incoming call UI
  if (isIncoming && !callData?.accepted) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-4">Incoming Call from {callData?.callerName || "Unknown"}</h3>
            <div className="flex justify-center space-x-4 mt-6">
              <button onClick={handleRejectCall} className="bg-red-500 hover:bg-red-600 text-white rounded-full p-4">
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

  // Render main call UI
  return isActive ? (
    <div
      className={`${isFullscreen ? "fixed inset-0 z-50" : "relative w-full h-full"} 
                 bg-black flex flex-col overflow-hidden rounded-lg`}
      style={{ minHeight: "400px" }} // Add minimum height to ensure visibility
    >
      {/* Status bar */}
      <div className="absolute top-0 left-0 right-0 bg-black bg-opacity-50 text-white p-2 flex justify-between items-center z-10">
        <div>
          {connectionStatus === "connecting" && "Connecting..."}
          {connectionStatus === "calling" && "Calling..."}
          {connectionStatus === "connected" && formatCallTime(callTimer)}
          {connectionStatus === "error" && "Connection Error"}
        </div>
        <button onClick={toggleFullscreen} className="text-white">
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
      </div>

      {/* Remote video (full size) */}
      <div className="flex-1 bg-gray-900 relative">
        {connectionStatus === "connected" ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-xl">
              {connectionStatus === "connecting" && "Connecting..."}
              {connectionStatus === "calling" && "Calling..."}
              {connectionStatus === "error" && "Connection Error"}
            </div>
          </div>
        )}
      </div>

      {/* Local video (picture-in-picture) */}
      <div className="absolute bottom-20 right-4 w-1/4 aspect-video rounded-lg overflow-hidden border-2 border-white shadow-lg">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </div>

      {/* Call controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 p-4 flex justify-center space-x-6">
        <button onClick={toggleMute} className={`rounded-full p-3 ${isMuted ? "bg-red-500" : "bg-gray-700"}`}>
          {isMuted ? <MicOff size={24} className="text-white" /> : <Mic size={24} className="text-white" />}
        </button>
        <button onClick={toggleVideo} className={`rounded-full p-3 ${!isVideoEnabled ? "bg-red-500" : "bg-gray-700"}`}>
          {!isVideoEnabled ? <VideoOff size={24} className="text-white" /> : <Video size={24} className="text-white" />}
        </button>
        <button onClick={handleEndCall} className="bg-red-500 hover:bg-red-600 rounded-full p-3">
          <PhoneOff size={24} className="text-white" />
        </button>
      </div>
    </div>
  ) : null
}

export default VideoCall

'use client'

import { useEffect, useRef, useState } from 'react'

interface YouTubePlayerEvent {
  data: number
}

interface YouTubePlayerConfig {
  height: string
  width: string
  videoId: string
  playerVars: {
    modestbranding?: number
    controls?: number
    rel?: number
    iv_load_policy?: number
    playsinline?: number
    enablejsapi?: number
    origin?: string
    showinfo?: number
    fs?: number
    autoplay?: number
    mute?: number
    [key: string]: number | string | undefined
  }
  events?: {
    onReady?: (event: YouTubePlayerEvent) => void
    onStateChange?: (event: YouTubePlayerEvent) => void
    onError?: (event: YouTubePlayerEvent) => void
  }
}

interface YouTubePlayerInstance {
  destroy: () => void
}

declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, config: YouTubePlayerConfig) => YouTubePlayerInstance
      PlayerState: {
        ENDED: number
        PLAYING: number
        PAUSED: number
        BUFFERING: number
        CUED: number
      }
    }
    onYouTubeIframeAPIReady: () => void
  }
}

interface YouTubePlayerProps {
  videoId: string
  onEnd?: () => void
  onPlay?: () => void
  onPause?: () => void
  onError?: (error: YouTubePlayerEvent) => void
}

export function YouTubePlayer({ 
  videoId, 
  onEnd, 
  onPlay, 
  onPause, 
  onError
}: YouTubePlayerProps) {
  const playerRef = useRef<YouTubePlayerInstance | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPlayerReady, setIsPlayerReady] = useState(false)
  const [isYouTubeAPIReady, setIsYouTubeAPIReady] = useState(false)
  const [playerId] = useState(() => `youtube-player-${Math.random().toString(36).substr(2, 9)}`)

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      const firstScriptTag = document.getElementsByTagName('script')[0]
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)

      window.onYouTubeIframeAPIReady = () => {
        setIsYouTubeAPIReady(true)
      }
    } else {
      setIsYouTubeAPIReady(true)
    }
  }, [])

  useEffect(() => {
    if (!isYouTubeAPIReady || !containerRef.current || !videoId) return

    // Destroy existing player if it exists
    if (playerRef.current) {
      playerRef.current.destroy()
    }

    // Create new player with distraction-minimizing parameters
    playerRef.current = new window.YT.Player(playerId, {
      height: '100%',
      width: '100%',
      videoId: videoId,
      playerVars: {
        modestbranding: 1, // Reduces YouTube branding
        controls: 1, // Shows player controls (required)
        rel: 0, // Limits related videos to same channel
        iv_load_policy: 3, // Disables video annotations
        playsinline: 1, // Plays inline on mobile
        enablejsapi: 1, // Enables JavaScript API
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        showinfo: 0, // Hides video title and uploader info
        fs: 1, // Allows fullscreen
        autoplay: 0, // No autoplay
        mute: 0, // Not muted
      },
      events: {
        onReady: () => {
          setIsPlayerReady(true)
        },
        onStateChange: (event: YouTubePlayerEvent) => {
          switch (event.data) {
            case window.YT.PlayerState.ENDED:
              onEnd?.()
              break
            case window.YT.PlayerState.PLAYING:
              onPlay?.()
              break
            case window.YT.PlayerState.PAUSED:
              onPause?.()
              break
          }
        },
        onError: (event: YouTubePlayerEvent) => {
          console.error('YouTube player error:', event)
          onError?.(event)
        },
      },
    })

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy()
      }
    }
  }, [videoId, isYouTubeAPIReady, onEnd, onPlay, onPause, onError, playerId])

  return (
    <div className="relative w-full h-0 pb-[56.25%] bg-black">
      <div
        id={playerId}
        ref={containerRef}
        className="absolute top-0 left-0 w-full h-full"
      />
      {!isPlayerReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
            <p>Loading video...</p>
          </div>
        </div>
      )}
    </div>
  )
}

'use client';

import { useEffect, useRef, useState } from 'react';

interface YouTubePlayerEvent {
  data: number;
}

interface YouTubePlayerConfig {
  height: string;
  width: string;
  videoId: string;
  playerVars: {
    modestbranding?: number;
    controls?: number;
    rel?: number;
    iv_load_policy?: number;
    playsinline?: number;
    enablejsapi?: number;
    origin?: string;
    showinfo?: number;
    fs?: number;
    autoplay?: number;
    mute?: number;
    [key: string]: number | string | undefined;
  };
  events?: {
    onReady?: (event: YouTubePlayerEvent) => void;
    onStateChange?: (event: YouTubePlayerEvent) => void;
    onError?: (event: YouTubePlayerEvent) => void;
  };
}

interface YouTubePlayerInstance {
  destroy: () => void;
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
}

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: YouTubePlayerConfig
      ) => YouTubePlayerInstance;
      PlayerState: {
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerProps {
  videoId: string;
  onEnd?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (error: YouTubePlayerEvent) => void;
}

export function YouTubePlayer({
  videoId,
  onEnd,
  onPlay,
  onPause,
  onError,
}: YouTubePlayerProps) {
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isYouTubeAPIReady, setIsYouTubeAPIReady] = useState(false);
  const [playerId] = useState(
    () => `youtube-player-${Math.random().toString(36).substr(2, 9)}`
  );

  // State to track playback position and state
  const [currentTime, setCurrentTime] = useState(0);
  const [lastVideoId, setLastVideoId] = useState('');
  const [shouldRestorePosition, setShouldRestorePosition] = useState(false);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setIsYouTubeAPIReady(true);
      };
    } else {
      setIsYouTubeAPIReady(true);
    }
  }, []);

  // Handle tab visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden - save current state
        if (playerRef.current && isPlayerReady) {
          try {
            const currentTime = playerRef.current.getCurrentTime();
            setCurrentTime(currentTime);
            setShouldRestorePosition(true);
          } catch (error) {
            console.log('Error saving player state:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlayerReady]);

  // Restore position when player is ready and we need to restore
  useEffect(() => {
    if (
      isPlayerReady &&
      shouldRestorePosition &&
      currentTime > 0 &&
      playerRef.current
    ) {
      setTimeout(() => {
        try {
          playerRef.current?.seekTo(currentTime, true);
          setShouldRestorePosition(false);
        } catch (error) {
          console.log('Error restoring player state:', error);
        }
      }, 500); // Longer delay to ensure player is fully ready
    }
  }, [isPlayerReady, shouldRestorePosition, currentTime]);

  useEffect(() => {
    if (!isYouTubeAPIReady || !containerRef.current || !videoId) return;

    // Reset state when video changes
    if (lastVideoId !== videoId) {
      setCurrentTime(0);
      setShouldRestorePosition(false);
      setLastVideoId(videoId);
    }

    // Only create new player if video ID changes or no player exists
    if (!playerRef.current || lastVideoId !== videoId) {
      // Destroy existing player if it exists
      if (playerRef.current) {
        playerRef.current.destroy();
      }

      // Create new player with distraction-minimizing parameters
      playerRef.current = new window.YT.Player(playerId, {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          modestbranding: 1,
          controls: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          enablejsapi: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
          showinfo: 0,
          fs: 1,
          autoplay: 0,
          mute: 0,
        },
        events: {
          onReady: (event) => {
            setIsPlayerReady(true);
            console.log('YouTube player ready');
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              onEnd?.();
            } else if (event.data === window.YT.PlayerState.PLAYING) {
              onPlay?.();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              onPause?.();
            }
          },
          onError: (event) => {
            console.error('YouTube player error:', event);
            onError?.(event);
          },
        },
      });
    }
  }, [
    isYouTubeAPIReady,
    videoId,
    playerId,
    onEnd,
    onPlay,
    onPause,
    onError,
    lastVideoId,
  ]);

  return (
    <div className="relative w-full h-0 pb-[56.25%] bg-black">
      <div
        ref={containerRef}
        id={playerId}
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
  );
}

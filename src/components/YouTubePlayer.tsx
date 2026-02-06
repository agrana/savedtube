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
  getDuration: () => number;
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

export interface TimeInterval {
  startTime: number;
  endTime: number;
}

interface YouTubePlayerProps {
  videoId: string;
  intervals?: TimeInterval[];
  loopEnabled?: boolean;
  onEnd?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onError?: (error: YouTubePlayerEvent) => void;
  autoPlay?: boolean;
  onIntervalChange?: (intervalIndex: number) => void;
  onCurrentTimeUpdate?: (currentTime: number) => void;
  seekToSeconds?: number | null;
  seekToToken?: number;
  onSeekComplete?: () => void;
}

export function YouTubePlayer({
  videoId,
  intervals = [],
  loopEnabled = false,
  onEnd,
  onPlay,
  onPause,
  onError,
  autoPlay = false,
  onIntervalChange,
  onCurrentTimeUpdate,
  seekToSeconds = null,
  seekToToken,
  onSeekComplete,
}: YouTubePlayerProps) {
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isYouTubeAPIReady, setIsYouTubeAPIReady] = useState(false);
  const [playerId] = useState(
    () => `youtube-player-${Math.random().toString(36).substr(2, 9)}`
  );

  // State to track video changes
  const [lastVideoId, setLastVideoId] = useState('');

  // Interval playback state
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState(0);
  const intervalCheckRef = useRef<NodeJS.Timeout | null>(null);

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

  // Note: Removed tab visibility handling to prevent audio glitches
  // YouTube player handles tab switching naturally without interference

  useEffect(() => {
    if (!isYouTubeAPIReady || !containerRef.current || !videoId) return;

    // Reset state when video changes
    if (lastVideoId !== videoId) {
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
          autoplay: autoPlay ? 1 : 0,
          mute: 0,
        },
        events: {
          onReady: () => {
            setIsPlayerReady(true);
            console.log('YouTube player ready');
            if (autoPlay) {
              playerRef.current?.playVideo();
            }
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
    autoPlay,
  ]);

  useEffect(() => {
    if (!isPlayerReady || !playerRef.current) return;
    if (seekToSeconds === null || typeof seekToSeconds === 'undefined') return;

    playerRef.current.seekTo(seekToSeconds, true);
    playerRef.current.playVideo();
    onSeekComplete?.();
  }, [isPlayerReady, seekToSeconds, seekToToken, onSeekComplete]);

  // Interval playback monitoring
  useEffect(() => {
    if (!isPlayerReady || !playerRef.current || intervals.length === 0) {
      // Clear monitoring if no intervals
      if (intervalCheckRef.current) {
        clearInterval(intervalCheckRef.current);
        intervalCheckRef.current = null;
      }
      return;
    }

    // Sort intervals by start time
    const sortedIntervals = [...intervals].sort(
      (a, b) => a.startTime - b.startTime
    );

    // Set up monitoring interval
    intervalCheckRef.current = setInterval(() => {
      if (!playerRef.current) return;

      try {
        const currentTime = playerRef.current.getCurrentTime();
        const playerState = playerRef.current.getPlayerState();

        // Only monitor when playing
        if (playerState !== window.YT.PlayerState.PLAYING) return;

        // Update current time for parent component
        onCurrentTimeUpdate?.(currentTime);

        // Find which interval we should be in
        let targetIntervalIndex = -1;
        let shouldSeek = false;
        let seekTarget = 0;

        for (let i = 0; i < sortedIntervals.length; i++) {
          const interval = sortedIntervals[i];

          if (
            currentTime >= interval.startTime &&
            currentTime < interval.endTime
          ) {
            // We're in a valid interval
            targetIntervalIndex = i;
            break;
          } else if (currentTime < interval.startTime) {
            // We're before this interval, seek to its start
            targetIntervalIndex = i;
            shouldSeek = true;
            seekTarget = interval.startTime;
            break;
          }
        }

        // If we're past all intervals
        if (
          targetIntervalIndex === -1 &&
          currentTime >= sortedIntervals[sortedIntervals.length - 1].endTime
        ) {
          if (loopEnabled) {
            // Loop back to first interval
            playerRef.current.seekTo(sortedIntervals[0].startTime, true);
            setCurrentIntervalIndex(0);
            onIntervalChange?.(0);
          } else {
            // Pause at the end
            playerRef.current.pauseVideo();
          }
          return;
        }

        // If we're between intervals or before the first one
        if (shouldSeek && targetIntervalIndex !== -1) {
          playerRef.current.seekTo(seekTarget, true);
          setCurrentIntervalIndex(targetIntervalIndex);
          onIntervalChange?.(targetIntervalIndex);
        } else if (
          targetIntervalIndex !== -1 &&
          targetIntervalIndex !== currentIntervalIndex
        ) {
          setCurrentIntervalIndex(targetIntervalIndex);
          onIntervalChange?.(targetIntervalIndex);
        }
      } catch (error) {
        console.error('Error in interval monitoring:', error);
      }
    }, 200); // Check every 200ms

    return () => {
      if (intervalCheckRef.current) {
        clearInterval(intervalCheckRef.current);
        intervalCheckRef.current = null;
      }
    };
  }, [
    isPlayerReady,
    intervals,
    loopEnabled,
    currentIntervalIndex,
    onIntervalChange,
    onCurrentTimeUpdate,
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

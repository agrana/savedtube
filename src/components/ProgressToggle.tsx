'use client';

import { useState } from 'react';
import { updateVideoProgress } from '@/lib/actions';

interface ProgressToggleProps {
  videoId: string;
  playlistId: string;
  initiallyWatched: boolean;
}

export default function ProgressToggle({
  videoId,
  playlistId,
  initiallyWatched,
}: ProgressToggleProps) {
  const [watched, setWatched] = useState(initiallyWatched);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggle = async () => {
    setIsUpdating(true);
    try {
      await updateVideoProgress(playlistId, videoId, !watched);
      setWatched(!watched);
    } catch (error) {
      console.error('Error updating progress:', error);
      // Revert the UI state on error
      setWatched(watched);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isUpdating}
      className={`p-2 rounded-full transition-colors ${
        watched
          ? 'bg-green-100 text-green-600 hover:bg-green-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={watched ? 'Mark as unwatched' : 'Mark as watched'}
    >
      {watched ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}
    </button>
  );
}

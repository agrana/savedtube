'use client';

import { useState } from 'react';
import { VideoInterval } from '../types/intervals';

interface IntervalManagerProps {
  videoId: string;
  intervals: VideoInterval[];
  loopEnabled: boolean;
  videoDuration?: number;
  currentTime?: number;
  onAddInterval: (startTime: number, endTime: number) => Promise<void>;
  onDeleteInterval: (intervalId: string) => Promise<void>;
  onRenameInterval: (intervalId: string, name: string) => Promise<void>;
  onToggleLoop: (enabled: boolean) => void;
  onImportFromYouTube?: (overwrite: boolean) => Promise<void>;
  isImporting?: boolean;
  importError?: string | null;
  importMessage?: string | null;
  activeIntervalId?: string | null;
  onSelectInterval?: (interval: VideoInterval) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function IntervalManager({
  videoId,
  intervals,
  loopEnabled,
  videoDuration,
  currentTime = 0,
  onAddInterval,
  onDeleteInterval,
  onRenameInterval,
  onToggleLoop,
  onImportFromYouTube,
  isImporting = false,
  importError,
  importMessage,
  activeIntervalId,
  onSelectInterval,
  isOpen,
  onClose,
}: IntervalManagerProps) {
  const [startMinutes, setStartMinutes] = useState('');
  const [startSeconds, setStartSeconds] = useState('');
  const [endMinutes, setEndMinutes] = useState('');
  const [endSeconds, setEndSeconds] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [renamingIntervalId, setRenamingIntervalId] = useState<string | null>(
    null
  );
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const parseTimeToSeconds = (minutes: string, seconds: string): number => {
    const mins = parseInt(minutes || '0', 10);
    const secs = parseInt(seconds || '0', 10);
    return mins * 60 + secs;
  };

  const handleUseCurrentTime = (type: 'start' | 'end') => {
    const minutes = Math.floor(currentTime / 60);
    const seconds = Math.floor(currentTime % 60);

    if (type === 'start') {
      setStartMinutes(minutes.toString());
      setStartSeconds(seconds.toString());
    } else {
      setEndMinutes(minutes.toString());
      setEndSeconds(seconds.toString());
    }
  };

  const handleAddInterval = async () => {
    setError(null);

    const startTime = parseTimeToSeconds(startMinutes, startSeconds);
    const endTime = parseTimeToSeconds(endMinutes, endSeconds);

    // Validation
    if (startTime < 0 || endTime < 0) {
      setError('Times cannot be negative');
      return;
    }

    if (startTime >= endTime) {
      setError('Start time must be before end time');
      return;
    }

    if (videoDuration && endTime > videoDuration) {
      setError(
        `End time cannot exceed video duration (${formatTime(videoDuration)})`
      );
      return;
    }

    setIsAdding(true);
    try {
      await onAddInterval(startTime, endTime);
      // Clear form
      setStartMinutes('');
      setStartSeconds('');
      setEndMinutes('');
      setEndSeconds('');
    } catch (err) {
      setError('Failed to add interval');
      console.error(err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (intervalId: string) => {
    try {
      await onDeleteInterval(intervalId);
    } catch (err) {
      console.error('Failed to delete interval:', err);
    }
  };

  const getIntervalDisplayName = (interval: VideoInterval, index: number) =>
    interval.name?.trim() || `interval_${index + 1}`;

  const beginRename = (interval: VideoInterval, index: number) => {
    setRenamingIntervalId(interval.id);
    setRenameValue(getIntervalDisplayName(interval, index));
    setError(null);
  };

  const cancelRename = () => {
    setRenamingIntervalId(null);
    setRenameValue('');
  };

  const saveRename = async (intervalId: string) => {
    setIsRenaming(true);
    setError(null);
    try {
      await onRenameInterval(intervalId, renameValue);
      cancelRename();
    } catch (err) {
      setError('Failed to rename interval');
      console.error(err);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleImport = async () => {
    if (!onImportFromYouTube) return;

    let overwrite = false;
    if (intervals.length > 0) {
      const confirmed = window.confirm(
        'Replace existing intervals with YouTube chapters? This will delete your current intervals.'
      );
      if (!confirmed) return;
      overwrite = true;
    }

    await onImportFromYouTube(overwrite);
  };

  const totalWatchTime = intervals.reduce(
    (sum, interval) => sum + (interval.endTime - interval.startTime),
    0
  );

  const sortedIntervals = [...intervals].sort(
    (a, b) => a.startTime - b.startTime
  );

  return (
    <>
      {/* Side Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-gray-900 text-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <h2 className="text-xl font-semibold">Time Intervals</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-full transition-colors"
              aria-label="Close panel"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Loop Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
              <div>
                <h3 className="font-medium">Loop Intervals</h3>
                <p className="text-sm text-gray-400">
                  Repeat intervals continuously
                </p>
              </div>
              <button
                onClick={() => onToggleLoop(!loopEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  loopEnabled ? 'bg-blue-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    loopEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Import from YouTube */}
            {onImportFromYouTube && (
              <div className="p-4 bg-gray-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Import from YouTube</h3>
                    <p className="text-sm text-gray-400">
                      Use chapter timestamps from the video description
                    </p>
                  </div>
                  <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                  >
                    {isImporting ? 'Importing...' : 'Import'}
                  </button>
                </div>
                {importError && (
                  <div className="p-3 bg-red-900 bg-opacity-30 border border-red-500 rounded text-sm text-red-200">
                    {importError}
                  </div>
                )}
                {importMessage && (
                  <div className="p-3 bg-green-900 bg-opacity-30 border border-green-500 rounded text-sm text-green-200">
                    {importMessage}
                  </div>
                )}
              </div>
            )}

            {/* Intervals List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Your Intervals</h3>
                {intervals.length > 0 && (
                  <span className="text-sm text-gray-400">
                    Total: {formatTime(totalWatchTime)}
                  </span>
                )}
              </div>

              {intervals.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p className="mb-2">No intervals yet</p>
                  <p className="text-sm">Add your first interval below</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedIntervals.map((interval, index) => (
                    <div
                      key={interval.id}
                      onClick={() => onSelectInterval?.(interval)}
                      onKeyDown={(event) => {
                        if (!onSelectInterval) return;
                        if (renamingIntervalId === interval.id) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectInterval(interval);
                        }
                      }}
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                        interval.id === activeIntervalId
                          ? 'bg-blue-700'
                          : 'bg-gray-800 hover:bg-gray-750'
                      } ${onSelectInterval ? 'cursor-pointer' : ''}`}
                      role={onSelectInterval ? 'button' : undefined}
                      tabIndex={onSelectInterval ? 0 : undefined}
                    >
                      <div className="flex min-w-0 flex-1 items-center space-x-3">
                        <span className="text-sm text-gray-400">
                          #{index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          {renamingIntervalId === interval.id ? (
                            <div
                              className="mb-2 flex items-center gap-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={renameValue}
                                onChange={(event) =>
                                  setRenameValue(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    saveRename(interval.id);
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    cancelRename();
                                  }
                                }}
                                maxLength={100}
                                className="min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                                aria-label="Interval name"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => saveRename(interval.id)}
                                disabled={isRenaming}
                                className="rounded bg-blue-600 px-2 py-1 text-xs font-medium hover:bg-blue-700 disabled:bg-gray-600"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelRename}
                                disabled={isRenaming}
                                className="rounded bg-gray-700 px-2 py-1 text-xs font-medium hover:bg-gray-600 disabled:bg-gray-600"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="mb-1 flex items-center gap-2">
                              <div className="truncate text-sm font-medium">
                                {getIntervalDisplayName(interval, index)}
                              </div>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginRename(interval, index);
                                }}
                                className="rounded px-2 py-0.5 text-xs text-blue-300 hover:bg-blue-600 hover:bg-opacity-20"
                                aria-label={`Rename ${getIntervalDisplayName(
                                  interval,
                                  index
                                )}`}
                              >
                                Rename
                              </button>
                            </div>
                          )}
                          <div className="font-mono text-sm">
                            {formatTime(interval.startTime)} →{' '}
                            {formatTime(interval.endTime)}
                          </div>
                          <div className="text-xs text-gray-400">
                            Duration:{' '}
                            {formatTime(interval.endTime - interval.startTime)}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(interval.id);
                        }}
                        className="p-2 hover:bg-red-600 hover:bg-opacity-20 rounded transition-colors"
                        aria-label="Delete interval"
                      >
                        <svg
                          className="w-5 h-5 text-red-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Interval Form */}
            <div className="border-t border-gray-700 pt-6">
              <h3 className="font-medium mb-4">Add New Interval</h3>

              {error && (
                <div className="mb-4 p-3 bg-red-900 bg-opacity-30 border border-red-500 rounded text-sm text-red-200">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                {/* Start Time */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">Start Time</label>
                    <button
                      onClick={() => handleUseCurrentTime('start')}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Use current time ({formatTime(currentTime)})
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="MM"
                      value={startMinutes}
                      onChange={(e) => setStartMinutes(e.target.value)}
                      className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-gray-400">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="SS"
                      value={startSeconds}
                      onChange={(e) => setStartSeconds(e.target.value)}
                      className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* End Time */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">End Time</label>
                    <button
                      onClick={() => handleUseCurrentTime('end')}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Use current time ({formatTime(currentTime)})
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="MM"
                      value={endMinutes}
                      onChange={(e) => setEndMinutes(e.target.value)}
                      className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-gray-400">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      placeholder="SS"
                      value={endSeconds}
                      onChange={(e) => setEndSeconds(e.target.value)}
                      className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Add Button */}
                <button
                  onClick={handleAddInterval}
                  disabled={isAdding}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                >
                  {isAdding ? 'Adding...' : 'Add Interval'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

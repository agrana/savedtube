'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useSession, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import Logo from '@/components/Logo';

interface Playlist {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
    channelTitle: string;
  };
  contentDetails: {
    itemCount: number;
  };
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [hiddenPlaylistIds, setHiddenPlaylistIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (status !== 'loading') {
      setIsLoading(false);

      // Check for token refresh errors
      if ((session as any)?.error === 'RefreshAccessTokenError') {
        setError('Your session has expired. Please sign in again.');
      }
    }
  }, [status, session]);

  // Fetch playlists and hidden playlists when session is available
  useEffect(() => {
    if ((session as any)?.accessToken) {
      fetchPlaylists();
      fetchHiddenPlaylists();
    }
  }, [session]);

  const fetchPlaylists = async (query = '') => {
    setIsLoadingPlaylists(true);
    try {
      const params = new URLSearchParams();
      if (query) {
        params.append('q', query);
      }

      const response = await fetch(`/api/playlists?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch playlists');
      }

      const data = await response.json();
      setPlaylists(data.playlists || []);
    } catch (error) {
      console.error('Error fetching playlists:', error);
      setError('Failed to load playlists');
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  const fetchHiddenPlaylists = async () => {
    try {
      const response = await fetch('/api/hidden-playlists');
      if (!response.ok) {
        throw new Error('Failed to fetch hidden playlists');
      }

      const data = await response.json();
      setHiddenPlaylistIds(data.hiddenPlaylistIds || []);
    } catch (error) {
      console.error('Error fetching hidden playlists:', error);
    }
  };

  const togglePlaylistVisibility = async (
    playlistId: string,
    currentlyHidden: boolean
  ) => {
    try {
      const response = await fetch('/api/hidden-playlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlistId,
          hidden: !currentlyHidden,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update playlist visibility');
      }

      // Update local state
      if (currentlyHidden) {
        setHiddenPlaylistIds((prev) => prev.filter((id) => id !== playlistId));
      } else {
        setHiddenPlaylistIds((prev) => [...prev, playlistId]);
      }
    } catch (error) {
      console.error('Error updating playlist visibility:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPlaylists(searchQuery);
  };

  // Filter playlists based on visibility preference
  const visiblePlaylists = playlists.filter((playlist) =>
    showHidden
      ? hiddenPlaylistIds.includes(playlist.id)
      : !hiddenPlaylistIds.includes(playlist.id)
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Access Denied
          </h1>
          <p className="text-gray-600">
            Please sign in to access the dashboard.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-900 mb-4">Error</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Logo size="md" variant="dark" className="mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">
                SavedTube Dashboard
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                {session.user?.image && (
                  <Image
                    className="h-8 w-8 rounded-full"
                    src={session.user.image}
                    alt={session.user.name || 'User'}
                    width={32}
                    height={32}
                  />
                )}
                <span className="text-sm font-medium text-gray-700">
                  {session.user?.name}
                </span>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Search and Visibility Controls */}
          <div className="mb-6 space-y-4">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search playlists..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="submit"
                disabled={isLoadingPlaylists}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isLoadingPlaylists ? 'Searching...' : 'Search'}
              </button>
            </form>

            {/* Visibility Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowHidden(false)}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    !showHidden
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Visible Playlists (
                  {
                    playlists.filter((p) => !hiddenPlaylistIds.includes(p.id))
                      .length
                  }
                  )
                </button>
                <button
                  onClick={() => setShowHidden(true)}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    showHidden
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Hidden Playlists ({hiddenPlaylistIds.length})
                </button>
              </div>
            </div>
          </div>

          {/* Playlists Grid */}
          {isLoadingPlaylists ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : visiblePlaylists.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visiblePlaylists.map((playlist) => {
                const isHidden = hiddenPlaylistIds.includes(playlist.id);
                return (
                  <div
                    key={playlist.id}
                    className={`bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden ${
                      isHidden ? 'opacity-75' : ''
                    }`}
                  >
                    <Link href={`/p/${playlist.id}`}>
                      <div className="aspect-video relative">
                        <Image
                          src={playlist.snippet.thumbnails.medium.url}
                          alt={playlist.snippet.title}
                          fill
                          className="object-cover"
                        />
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-gray-900 line-clamp-2 mb-2">
                          {playlist.snippet.title}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          {playlist.snippet.channelTitle}
                        </p>
                        <p className="text-sm text-gray-500">
                          {playlist.contentDetails.itemCount} videos
                        </p>
                      </div>
                    </Link>

                    {/* Hide/Show Toggle Button */}
                    <div className="px-4 pb-4">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          togglePlaylistVisibility(playlist.id, isHidden);
                        }}
                        className={`w-full px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          isHidden
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                        title={isHidden ? 'Show playlist' : 'Hide playlist'}
                      >
                        {isHidden ? 'Show Playlist' : 'Hide Playlist'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {showHidden ? 'No hidden playlists' : 'No playlists found'}
              </h3>
              <p className="text-gray-600">
                {searchQuery
                  ? 'Try a different search term.'
                  : showHidden
                    ? "You haven't hidden any playlists yet."
                    : "You don't have any playlists yet."}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

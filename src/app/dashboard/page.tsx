'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useSession, signOut } from 'next-auth/react'
import { useEffect, useState } from 'react'
import Image from 'next/image'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (status !== 'loading') {
      setIsLoading(false)
      
      // Check for token refresh errors
      if ((session as any)?.error === 'RefreshAccessTokenError') {
        setError('Your session has expired. Please sign in again.')
      }
    }
  }, [status, session])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please sign in to access the dashboard.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-900 mb-4">Authentication Error</h1>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Sign in again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">SavedTube Dashboard</h1>
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* User Profile Card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  User Profile
                </h3>
                <div className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="mt-1 text-sm text-gray-900">{session.user?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="mt-1 text-sm text-gray-900">{session.user?.email}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">User ID</dt>
                    <dd className="mt-1 text-sm text-gray-900 font-mono">{(session.user as any)?.id}</dd>
                  </div>
                </div>
              </div>
            </div>

            {/* Authentication Status */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  Authentication Status
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">Authenticated</p>
                      <p className="text-sm text-gray-500">Google OAuth with YouTube scope</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="h-2 w-2 bg-blue-400 rounded-full"></div>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">YouTube Access</p>
                      <p className="text-sm text-gray-500">Read-only access to playlists</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="mt-8 bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                Next Steps
              </h3>
              <div className="space-y-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-6 w-6 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-blue-600 text-xs font-medium">1</span>
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Sync YouTube Playlists</p>
                    <p className="text-sm text-gray-500">Fetch and store your saved playlists from YouTube</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-6 w-6 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 text-xs font-medium">2</span>
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Build Player Interface</p>
                    <p className="text-sm text-gray-500">Create distraction-free video player</p>
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="h-6 w-6 bg-gray-100 rounded-full flex items-center justify-center">
                      <span className="text-gray-600 text-xs font-medium">3</span>
                    </div>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-gray-900">Add AI Tagging</p>
                    <p className="text-sm text-gray-500">Automatically categorize and search videos</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

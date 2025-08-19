/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    console.log('Playlists API called')
    
    // Get user session with access token
    const session = await getServerSession(authOptions)
    console.log('Session retrieved:', { hasSession: !!session, hasAccessToken: !!session?.accessToken })
    
    if (!session?.accessToken) {
      console.error('No session or access token found:', { session: !!session, hasAccessToken: !!session?.accessToken })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get search query if provided
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const pageToken = searchParams.get('pageToken') || ''

    // Build YouTube API URL
    const baseUrl = 'https://www.googleapis.com/youtube/v3/playlists'
    const params = new URLSearchParams({
      part: 'id,snippet,contentDetails',
      mine: 'true',
      maxResults: '50', // YouTube API max
    })

    if (query) {
      params.append('q', query)
    }

    if (pageToken) {
      params.append('pageToken', pageToken)
    }

    const url = `${baseUrl}?${params.toString()}`

    // Fetch playlists from YouTube API
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('YouTube API error:', { status: response.status, error })
      return NextResponse.json(
        { error: 'Failed to fetch playlists from YouTube API' },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      playlists: data.items || [],
      nextPageToken: data.nextPageToken,
      pageInfo: data.pageInfo,
    })

  } catch (error) {
    console.error('Error fetching playlists:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

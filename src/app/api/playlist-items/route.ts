/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const getServerSession = (NextAuth as any).getServerSession as (opts: any) => Promise<any>

export async function GET(request: NextRequest) {
  try {
    // Get user session with access token
    const session = await getServerSession(authOptions)
    
    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get playlist ID from query params
    const { searchParams } = new URL(request.url)
    const playlistId = searchParams.get('playlistId')
    const pageToken = searchParams.get('pageToken') || ''

    if (!playlistId) {
      return NextResponse.json(
        { error: 'Playlist ID is required' },
        { status: 400 }
      )
    }

    // Build YouTube API URL
    const baseUrl = 'https://www.googleapis.com/youtube/v3/playlistItems'
    const params = new URLSearchParams({
      part: 'id,snippet,contentDetails',
      playlistId: playlistId,
      maxResults: '50', // YouTube API max
    })

    if (pageToken) {
      params.append('pageToken', pageToken)
    }

    const url = `${baseUrl}?${params.toString()}`

    // Fetch playlist items from YouTube API
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('YouTube API error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch playlist items' },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      items: data.items || [],
      nextPageToken: data.nextPageToken,
      pageInfo: data.pageInfo,
    })

  } catch (error) {
    console.error('Error fetching playlist items:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

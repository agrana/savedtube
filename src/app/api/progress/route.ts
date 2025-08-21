/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const playlistId = searchParams.get('playlistId')

    if (!playlistId) {
      return NextResponse.json(
        { error: 'Playlist ID is required' },
        { status: 400 }
      )
    }

    // Get progress for the playlist
    const { data, error } = await supabase
      .from('playlist_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('playlist_id', playlistId)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch progress' },
        { status: 500 }
      )
    }

    return NextResponse.json({ progress: data || [] })

  } catch (error) {
    console.error('Error fetching progress:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { playlistId, videoId, watched } = body

    if (!playlistId || !videoId || typeof watched !== 'boolean') {
      return NextResponse.json(
        { error: 'playlistId, videoId, and watched are required' },
        { status: 400 }
      )
    }

    // Upsert progress record
    const { data, error } = await supabase
      .from('playlist_progress')
      .upsert({
        user_id: session.user.id,
        playlist_id: playlistId,
        video_id: videoId,
        watched: watched,
        watched_at: watched ? new Date().toISOString() : null,
      }, {
        onConflict: 'user_id,playlist_id,video_id'
      })
      .select()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to save progress' },
        { status: 500 }
      )
    }

    return NextResponse.json({ progress: data[0] })

  } catch (error) {
    console.error('Error saving progress:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

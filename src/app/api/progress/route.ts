import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import { validateInput, progressSchema } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const playlistId = searchParams.get('playlistId');

    // Validate input
    const validation = validateInput(
      progressSchema.pick({ playlistId: true }),
      { playlistId }
    );
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const validatedPlaylistId = (
      validation as { success: true; data: { playlistId: string } }
    ).data.playlistId;

    // Create server-side Supabase client with service role key
    const supabase = createServerSupabaseClient();

    // Get progress for the playlist with RLS policies
    const { data, error } = await supabase
      .from('playlist_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('playlist_id', validatedPlaylistId);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch progress' },
        { status: 500 }
      );
    }

    return NextResponse.json({ progress: data || [] });
  } catch (error) {
    console.error('Error fetching progress:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      console.log('POST /api/progress: No session or user ID');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const validation = validateInput(progressSchema, body);
    if (!validation.success) {
      console.log('POST /api/progress: Validation failed:', validation.error);
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { playlistId, videoId, watched } = (
      validation as {
        success: true;
        data: { playlistId: string; videoId: string; watched: boolean };
      }
    ).data;

    console.log('POST /api/progress:', {
      userId: session.user.id,
      playlistId,
      videoId,
      watched,
    });

    // Create server-side Supabase client with service role key
    const supabase = createServerSupabaseClient();

    // Upsert progress record with RLS policies
    const { data, error } = await supabase
      .from('playlist_progress')
      .upsert(
        {
          user_id: session.user.id,
          playlist_id: playlistId,
          video_id: videoId,
          watched: watched,
          watched_at: watched ? new Date().toISOString() : null,
        },
        {
          onConflict: 'user_id,playlist_id,video_id',
        }
      )
      .select();

    if (error) {
      console.error('POST /api/progress: Supabase error:', error);
      console.error('POST /api/progress: Error details:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json(
        { error: 'Failed to save progress' },
        { status: 500 }
      );
    }

    console.log('POST /api/progress: Success, data:', data);
    return NextResponse.json({ progress: data[0] });
  } catch (error) {
    console.error('POST /api/progress: Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

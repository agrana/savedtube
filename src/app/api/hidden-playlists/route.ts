import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create server-side Supabase client with service role key
    const supabase = createServerSupabaseClient();

    // Get all hidden playlists for the user
    const { data, error } = await supabase
      .from('hidden_playlists')
      .select('playlist_id')
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Error fetching hidden playlists:', error);
      return NextResponse.json(
        { error: 'Failed to fetch hidden playlists' },
        { status: 500 }
      );
    }

    const hiddenPlaylistIds = data?.map((item) => item.playlist_id) || [];
    return NextResponse.json({ hiddenPlaylistIds });
  } catch (error) {
    console.error('Error in hidden playlists GET:', error);
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { playlistId, hidden } = body;

    if (!playlistId || typeof hidden !== 'boolean') {
      return NextResponse.json(
        { error: 'playlistId and hidden are required' },
        { status: 400 }
      );
    }

    // Create server-side Supabase client with service role key
    const supabase = createServerSupabaseClient();

    if (hidden) {
      // Hide playlist
      const { error } = await supabase.from('hidden_playlists').insert({
        user_id: session.user.id,
        playlist_id: playlistId,
      });

      if (error) {
        console.error('Error hiding playlist:', error);
        return NextResponse.json(
          { error: 'Failed to hide playlist' },
          { status: 500 }
        );
      }
    } else {
      // Show playlist (delete from hidden_playlists)
      const { error } = await supabase
        .from('hidden_playlists')
        .delete()
        .eq('user_id', session.user.id)
        .eq('playlist_id', playlistId);

      if (error) {
        console.error('Error showing playlist:', error);
        return NextResponse.json(
          { error: 'Failed to show playlist' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in hidden playlists POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

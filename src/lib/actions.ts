'use server';

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  validateInput,
  progressSchema,
  hiddenPlaylistSchema,
} from '@/lib/validation';
import { securityLogger } from '@/lib/security-logger';
import { revalidatePath } from 'next/cache';

// Server Action: Update video progress
export async function updateVideoProgress(
  playlistId: string,
  videoId: string,
  watched: boolean
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      securityLogger.logAuthFailure(
        'unknown',
        'No session in server action',
        undefined,
        undefined
      );
      throw new Error('Unauthorized');
    }

    // Validate input
    const validation = validateInput(progressSchema, {
      playlistId,
      videoId,
      watched,
    });
    if (!validation.success) {
      securityLogger.logValidationFailure(
        session.user.id,
        { playlistId, videoId, watched },
        validation.error
      );
      throw new Error(validation.error);
    }

    const {
      playlistId: validatedPlaylistId,
      videoId: validatedVideoId,
      watched: validatedWatched,
    } = (
      validation as {
        success: true;
        data: { playlistId: string; videoId: string; watched: boolean };
      }
    ).data;

    // Create server-side Supabase client
    const supabase = createServerSupabaseClient();

    // Update progress with RLS policies
    const { data, error } = await supabase
      .from('playlist_progress')
      .upsert(
        {
          user_id: session.user.id,
          playlist_id: validatedPlaylistId,
          video_id: validatedVideoId,
          watched: validatedWatched,
          watched_at: validatedWatched ? new Date().toISOString() : null,
        },
        {
          onConflict: 'user_id,playlist_id,video_id',
        }
      )
      .select();

    if (error) {
      securityLogger.logSuspiciousActivity(
        session.user.id,
        `Database error: ${error.message}`
      );
      throw new Error('Failed to save progress');
    }

    // Log successful data access
    securityLogger.logDataAccess(
      session.user.id,
      'playlist_progress',
      'update'
    );

    // Revalidate the playlist page to show updated progress
    revalidatePath(`/p/${validatedPlaylistId}`);

    return { success: true, progress: data[0] };
  } catch (error) {
    console.error('Server action error:', error);
    throw error;
  }
}

// Server Action: Toggle playlist visibility
export async function togglePlaylistVisibility(
  playlistId: string,
  hidden: boolean
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      securityLogger.logAuthFailure(
        'unknown',
        'No session in server action',
        undefined,
        undefined
      );
      throw new Error('Unauthorized');
    }

    // Validate input
    const validation = validateInput(hiddenPlaylistSchema, {
      playlistId,
      hidden,
    });
    if (!validation.success) {
      securityLogger.logValidationFailure(
        session.user.id,
        { playlistId, hidden },
        validation.error
      );
      throw new Error(validation.error);
    }

    const { playlistId: validatedPlaylistId, hidden: validatedHidden } = (
      validation as {
        success: true;
        data: { playlistId: string; hidden: boolean };
      }
    ).data;

    // Create server-side Supabase client
    const supabase = createServerSupabaseClient();

    if (validatedHidden) {
      // Hide playlist
      const { error } = await supabase.from('hidden_playlists').insert({
        user_id: session.user.id,
        playlist_id: validatedPlaylistId,
      });

      if (error) {
        securityLogger.logSuspiciousActivity(
          session.user.id,
          `Database error: ${error.message}`
        );
        throw new Error('Failed to hide playlist');
      }
    } else {
      // Show playlist (delete from hidden_playlists)
      const { error } = await supabase
        .from('hidden_playlists')
        .delete()
        .eq('user_id', session.user.id)
        .eq('playlist_id', validatedPlaylistId);

      if (error) {
        securityLogger.logSuspiciousActivity(
          session.user.id,
          `Database error: ${error.message}`
        );
        throw new Error('Failed to show playlist');
      }
    }

    // Log successful data access
    securityLogger.logDataAccess(
      session.user.id,
      'hidden_playlists',
      validatedHidden ? 'insert' : 'delete'
    );

    // Revalidate the dashboard to show updated playlist visibility
    revalidatePath('/dashboard');

    return { success: true };
  } catch (error) {
    console.error('Server action error:', error);
    throw error;
  }
}

// Server Action: Get user progress (for server components)
export async function getUserProgress(playlistId: string) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error('Unauthorized');
    }

    // Validate input
    const validation = validateInput(
      progressSchema.pick({ playlistId: true }),
      { playlistId }
    );
    if (!validation.success) {
      throw new Error(validation.error);
    }

    const validatedPlaylistId = (
      validation as { success: true; data: { playlistId: string } }
    ).data.playlistId;

    // Create server-side Supabase client
    const supabase = createServerSupabaseClient();

    // Get progress with RLS policies
    const { data, error } = await supabase
      .from('playlist_progress')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('playlist_id', validatedPlaylistId);

    if (error) {
      securityLogger.logSuspiciousActivity(
        session.user.id,
        `Database error: ${error.message}`
      );
      throw new Error('Failed to fetch progress');
    }

    // Log successful data access
    securityLogger.logDataAccess(
      session.user.id,
      'playlist_progress',
      'select'
    );

    return data || [];
  } catch (error) {
    console.error('Server action error:', error);
    throw error;
  }
}

// Server Action: Get hidden playlists (for server components)
export async function getHiddenPlaylists() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error('Unauthorized');
    }

    // Create server-side Supabase client
    const supabase = createServerSupabaseClient();

    // Get hidden playlists with RLS policies
    const { data, error } = await supabase
      .from('hidden_playlists')
      .select('playlist_id')
      .eq('user_id', session.user.id);

    if (error) {
      securityLogger.logSuspiciousActivity(
        session.user.id,
        `Database error: ${error.message}`
      );
      throw new Error('Failed to fetch hidden playlists');
    }

    // Log successful data access
    securityLogger.logDataAccess(session.user.id, 'hidden_playlists', 'select');

    return data?.map((item) => item.playlist_id) || [];
  } catch (error) {
    console.error('Server action error:', error);
    throw error;
  }
}

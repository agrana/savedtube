import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { securityLogger } from '@/lib/security-logger';

// Server-side YouTube API functions
export async function getServerPlaylists(query = '', pageToken = '') {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    throw new Error('Unauthorized - No access token');
  }

  try {
    // Build YouTube API URL
    const baseUrl = 'https://www.googleapis.com/youtube/v3/playlists';
    const params = new URLSearchParams({
      part: 'id,snippet,contentDetails',
      mine: 'true',
      maxResults: '50',
    });

    if (query) {
      params.append('q', query);
    }

    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    const url = `${baseUrl}?${params.toString()}`;

    // Fetch playlists from YouTube API
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      securityLogger.logSuspiciousActivity(
        session.user.id,
        `YouTube API error: ${response.status} - ${error}`
      );
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    // Log successful data access
    securityLogger.logDataAccess(session.user.id, 'youtube_playlists', 'fetch');

    return {
      playlists: data.items || [],
      nextPageToken: data.nextPageToken,
      pageInfo: data.pageInfo,
    };
  } catch (error) {
    console.error('Error fetching playlists:', error);
    throw error;
  }
}

export async function getServerPlaylistItems(
  playlistId: string,
  pageToken = ''
) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    throw new Error('Unauthorized - No access token');
  }

  try {
    // Build YouTube API URL
    const baseUrl = 'https://www.googleapis.com/youtube/v3/playlistItems';
    const params = new URLSearchParams({
      part: 'id,snippet,contentDetails',
      playlistId: playlistId,
      maxResults: '50',
    });

    if (pageToken) {
      params.append('pageToken', pageToken);
    }

    const url = `${baseUrl}?${params.toString()}`;

    // Fetch playlist items from YouTube API
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      securityLogger.logSuspiciousActivity(
        session.user.id,
        `YouTube API error: ${response.status} - ${error}`
      );
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    // Log successful data access
    securityLogger.logDataAccess(
      session.user.id,
      'youtube_playlist_items',
      'fetch'
    );

    return {
      items: data.items || [],
      nextPageToken: data.nextPageToken,
      pageInfo: data.pageInfo,
    };
  } catch (error) {
    console.error('Error fetching playlist items:', error);
    throw error;
  }
}

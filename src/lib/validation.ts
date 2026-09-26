import { z } from 'zod';

// YouTube video ID validation (11 characters, alphanumeric, hyphens, underscores)
const youtubeVideoIdRegex = /^[a-zA-Z0-9_-]{11}$/;

// YouTube playlist ID validation (starts with PL, followed by alphanumeric)
const youtubePlaylistIdRegex = /^PL[a-zA-Z0-9_-]+$/;

export const progressSchema = z.object({
  playlistId: z
    .string()
    .regex(youtubePlaylistIdRegex, 'Invalid playlist ID format')
    .min(1, 'Playlist ID is required'),
  videoId: z
    .string()
    .regex(youtubeVideoIdRegex, 'Invalid video ID format')
    .min(1, 'Video ID is required'),
  watched: z.boolean(),
});

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.replace('/', '').trim();
      return youtubeVideoIdRegex.test(id) ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        const id = parsed.searchParams.get('v') || '';
        return youtubeVideoIdRegex.test(id) ? id : null;
      }

      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/')[2] || '';
        return youtubeVideoIdRegex.test(id) ? id : null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message || 'Validation failed',
      };
    }
    return { success: false, error: 'Unknown validation error' };
  }
}

import { z } from 'zod';

// YouTube video ID validation (11 characters, alphanumeric, hyphens, underscores)
const youtubeVideoIdRegex = /^[a-zA-Z0-9_-]{11}$/;

// YouTube playlist ID validation (starts with PL, followed by alphanumeric)
const youtubePlaylistIdRegex = /^PL[a-zA-Z0-9_-]+$/;

// Validation schemas
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

export const hiddenPlaylistSchema = z.object({
  playlistId: z
    .string()
    .regex(youtubePlaylistIdRegex, 'Invalid playlist ID format')
    .min(1, 'Playlist ID is required'),
  hidden: z.boolean(),
});

export const playlistQuerySchema = z.object({
  q: z.string().optional(),
  pageToken: z.string().optional(),
});

export const progressQuerySchema = z.object({
  playlistId: z
    .string()
    .regex(youtubePlaylistIdRegex, 'Invalid playlist ID format')
    .min(1, 'Playlist ID is required'),
});

// Sanitization functions
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, ''); // Remove potential HTML tags
}

export function validateYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]{11}/,
    /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]{11}/,
    /^https?:\/\/(www\.)?youtube\.com\/playlist\?list=PL[a-zA-Z0-9_-]+/,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

// Type-safe validation wrapper
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

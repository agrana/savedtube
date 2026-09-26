import 'server-only';

import type { ResearchCandidate } from './path-research-schema';
import { YOUTUBE_VIDEO_ID_REGEX } from './path-research-schema';

export type YouTubeSearchParams = {
  accessToken: string;
  query: string;
  maxResults: number;
  timeoutMs: number;
  signal?: AbortSignal;
};

export type YouTubeVideoDetailsParams = {
  accessToken: string;
  videoIds: string[];
  timeoutMs: number;
  signal?: AbortSignal;
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    description?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
};

type YouTubeVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    description?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
  };
  contentDetails?: { duration?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
};

export type YouTubeClient = {
  searchEmbeddableVideos: (
    params: YouTubeSearchParams
  ) => Promise<
    | { ok: true; videoIds: string[] }
    | { ok: false; code: string; message: string; status?: number }
  >;
  fetchVideoDetails: (
    params: YouTubeVideoDetailsParams
  ) => Promise<
    | { ok: true; candidates: ResearchCandidate[] }
    | { ok: false; code: string; message: string; status?: number }
  >;
};

function withTimeoutSignal(
  timeoutMs: number,
  outer?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  if (outer) {
    if (outer.aborted) {
      controller.abort();
    } else {
      outer.addEventListener('abort', onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (outer) {
        outer.removeEventListener('abort', onAbort);
      }
    },
  };
}

/** Parse ISO-8601 duration (PT#H#M#S) used by YouTube contentDetails.duration. */
export function parseYouTubeDurationSeconds(
  isoDuration: string | undefined
): number | null {
  if (!isoDuration) {
    return null;
  }
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(isoDuration);
  if (!match) {
    return null;
  }
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

function excerptDescription(description: string | undefined): string {
  if (!description) {
    return '';
  }
  // Treat descriptions as untrusted evidence text only — never as instructions.
  return description.replace(/\s+/g, ' ').trim().slice(0, 500);
}

export function createYouTubeDataClient(): YouTubeClient {
  return {
    async searchEmbeddableVideos(params) {
      const { signal, cleanup } = withTimeoutSignal(
        params.timeoutMs,
        params.signal
      );
      try {
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('type', 'video');
        url.searchParams.set('videoEmbeddable', 'true');
        url.searchParams.set('maxResults', String(params.maxResults));
        url.searchParams.set('q', params.query);
        // No automatic pagination — one bounded page per stage query.

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            Accept: 'application/json',
          },
          signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('YouTube search error:', response.status, errorText);
          return {
            ok: false,
            code:
              response.status === 403
                ? 'youtube_quota'
                : 'youtube_search_failed',
            message:
              response.status === 403
                ? 'YouTube search quota exceeded. Try again later.'
                : 'YouTube search failed',
            status: response.status,
          };
        }

        const data = (await response.json()) as { items?: YouTubeSearchItem[] };
        const videoIds = (data.items || [])
          .map((item) => item.id?.videoId)
          .filter(
            (id): id is string =>
              typeof id === 'string' && YOUTUBE_VIDEO_ID_REGEX.test(id)
          );

        return { ok: true, videoIds };
      } catch (error) {
        if (params.signal?.aborted || (error as Error)?.name === 'AbortError') {
          return {
            ok: false,
            code: 'youtube_timeout',
            message: 'YouTube search timed out',
          };
        }
        console.error('YouTube search exception:', error);
        return {
          ok: false,
          code: 'youtube_search_failed',
          message: 'YouTube search failed',
        };
      } finally {
        cleanup();
      }
    },

    async fetchVideoDetails(params) {
      const uniqueIds = [
        ...new Set(
          params.videoIds.filter((id) => YOUTUBE_VIDEO_ID_REGEX.test(id))
        ),
      ];
      if (uniqueIds.length === 0) {
        return { ok: true, candidates: [] };
      }

      const { signal, cleanup } = withTimeoutSignal(
        params.timeoutMs,
        params.signal
      );
      try {
        const candidates: ResearchCandidate[] = [];

        for (let i = 0; i < uniqueIds.length; i += 50) {
          const batch = uniqueIds.slice(i, i + 50);
          const url = new URL('https://www.googleapis.com/youtube/v3/videos');
          url.searchParams.set('part', 'id,snippet,contentDetails,status');
          url.searchParams.set('id', batch.join(','));

          const response = await fetch(url.toString(), {
            headers: {
              Authorization: `Bearer ${params.accessToken}`,
              Accept: 'application/json',
            },
            signal,
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('YouTube videos error:', response.status, errorText);
            return {
              ok: false,
              code:
                response.status === 403
                  ? 'youtube_quota'
                  : 'youtube_details_failed',
              message:
                response.status === 403
                  ? 'YouTube quota exceeded. Try again later.'
                  : 'Failed to fetch YouTube video details',
              status: response.status,
            };
          }

          const data = (await response.json()) as {
            items?: YouTubeVideoItem[];
          };
          for (const item of data.items || []) {
            const id = item.id;
            if (!id || !YOUTUBE_VIDEO_ID_REGEX.test(id)) {
              continue;
            }
            if (item.status?.embeddable === false) {
              continue;
            }
            if (
              item.status?.privacyStatus &&
              item.status.privacyStatus !== 'public' &&
              item.status.privacyStatus !== 'unlisted'
            ) {
              continue;
            }

            const title = item.snippet?.title?.trim();
            const channelTitle = item.snippet?.channelTitle?.trim();
            if (!title || !channelTitle) {
              continue;
            }

            candidates.push({
              youtubeVideoId: id,
              title: title.slice(0, 300),
              channelTitle: channelTitle.slice(0, 200),
              durationSeconds: parseYouTubeDurationSeconds(
                item.contentDetails?.duration
              ),
              thumbnailUrl:
                item.snippet?.thumbnails?.medium?.url ||
                item.snippet?.thumbnails?.default?.url ||
                null,
              descriptionExcerpt: excerptDescription(item.snippet?.description),
            });
          }
        }

        return { ok: true, candidates };
      } catch (error) {
        if (params.signal?.aborted || (error as Error)?.name === 'AbortError') {
          return {
            ok: false,
            code: 'youtube_timeout',
            message: 'YouTube details timed out',
          };
        }
        console.error('YouTube details exception:', error);
        return {
          ok: false,
          code: 'youtube_details_failed',
          message: 'Failed to fetch YouTube video details',
        };
      } finally {
        cleanup();
      }
    },
  };
}

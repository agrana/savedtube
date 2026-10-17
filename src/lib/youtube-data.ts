import 'server-only';

import type { ResearchCandidate } from './path-research-schema';
import { YOUTUBE_VIDEO_ID_REGEX } from './path-research-schema';
import {
  classifyYouTubeHttpError,
  classifyYouTubeTransportError,
  parseRetryAfterMs,
  parseYouTubeUpstreamErrorBody,
  youtubeErrorLogFields,
  type YouTubeOperation,
} from './youtube-data-errors';

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

export type YouTubeDataClientOptions = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Max attempts including the first try. Bounded; default 3. */
  maxAttempts?: number;
  /** Base backoff for transient retries (doubles each attempt). Default 200ms. */
  backoffBaseMs?: number;
  /** Cap for Retry-After / backoff waits. Default 2000ms. */
  maxRetryAfterMs?: number;
};

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 200;
const DEFAULT_MAX_RETRY_AFTER_MS = 2000;

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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchYouTubeJson(args: {
  operation: YouTubeOperation;
  url: URL;
  accessToken: string;
  timeoutMs: number;
  signal?: AbortSignal;
  fetchImpl: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  maxAttempts: number;
  backoffBaseMs: number;
  maxRetryAfterMs: number;
}): Promise<
  | { ok: true; data: unknown }
  | { ok: false; code: string; message: string; status?: number }
> {
  const deadline = Date.now() + args.timeoutMs;
  let lastFailure: {
    code: string;
    message: string;
    status?: number;
  } | null = null;

  for (let attempt = 1; attempt <= args.maxAttempts; attempt++) {
    if (args.signal?.aborted || Date.now() >= deadline) {
      return {
        ok: false,
        code: 'youtube_timeout',
        message:
          args.operation === 'search'
            ? 'YouTube search timed out'
            : 'YouTube details timed out',
      };
    }

    const remainingMs = Math.max(1, deadline - Date.now());
    const { signal, cleanup } = withTimeoutSignal(remainingMs, args.signal);

    try {
      const response = await args.fetchImpl(args.url.toString(), {
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
          Accept: 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        // Read body only to extract allowlisted reason; discard raw text.
        const bodyText = await response.text();
        const parsed = parseYouTubeUpstreamErrorBody(response.status, bodyText);
        const classified = classifyYouTubeHttpError({
          operation: args.operation,
          httpStatus: parsed.httpStatus,
          reason: parsed.reason,
        });

        console.error(
          'YouTube API error',
          youtubeErrorLogFields({
            operation: args.operation,
            status: classified.status,
            reason: classified.reason,
            code: classified.code,
            attempt,
            retryable: classified.retryable,
          })
        );

        lastFailure = {
          code: classified.code,
          message: classified.message,
          status: classified.status,
        };

        const canRetry =
          classified.retryable &&
          attempt < args.maxAttempts &&
          !args.signal?.aborted;

        if (!canRetry) {
          return { ok: false, ...lastFailure };
        }

        const retryAfterMs = parseRetryAfterMs(
          response.headers.get('retry-after'),
          args.backoffBaseMs * 2 ** (attempt - 1),
          args.maxRetryAfterMs
        );
        const waitMs = Math.min(
          retryAfterMs,
          Math.max(0, deadline - Date.now())
        );
        if (waitMs > 0) {
          await args.sleep(waitMs);
        }
        continue;
      }

      const data: unknown = await response.json();
      return { ok: true, data };
    } catch (error) {
      const classified = classifyYouTubeTransportError({
        operation: args.operation,
        error,
        outerAborted: Boolean(args.signal?.aborted),
      });

      console.error(
        'YouTube API transport error',
        youtubeErrorLogFields({
          operation: args.operation,
          status: classified.status,
          reason: classified.reason,
          code: classified.code,
          attempt,
          retryable: classified.retryable,
        })
      );

      lastFailure = {
        code: classified.code,
        message: classified.message,
        status: classified.status,
      };

      const canRetry =
        classified.retryable &&
        attempt < args.maxAttempts &&
        !args.signal?.aborted &&
        Date.now() < deadline;

      if (!canRetry) {
        return { ok: false, ...lastFailure };
      }

      const waitMs = Math.min(
        args.backoffBaseMs * 2 ** (attempt - 1),
        args.maxRetryAfterMs,
        Math.max(0, deadline - Date.now())
      );
      if (waitMs > 0) {
        await args.sleep(waitMs);
      }
    } finally {
      cleanup();
    }
  }

  return {
    ok: false,
    code: lastFailure?.code || 'youtube_search_failed',
    message: lastFailure?.message || 'YouTube search failed',
    status: lastFailure?.status,
  };
}

export function createYouTubeDataClient(
  options: YouTubeDataClientOptions = {}
): YouTubeClient {
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = Math.max(
    1,
    Math.min(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, 5)
  );
  const backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS;

  return {
    async searchEmbeddableVideos(params) {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('type', 'video');
      url.searchParams.set('videoEmbeddable', 'true');
      url.searchParams.set('maxResults', String(params.maxResults));
      url.searchParams.set('q', params.query);
      // No automatic pagination — one bounded page per stage query.

      const result = await fetchYouTubeJson({
        operation: 'search',
        url,
        accessToken: params.accessToken,
        timeoutMs: params.timeoutMs,
        signal: params.signal,
        fetchImpl,
        sleep,
        maxAttempts,
        backoffBaseMs,
        maxRetryAfterMs,
      });

      if (!result.ok) {
        return result;
      }

      const data = result.data as { items?: YouTubeSearchItem[] };
      const videoIds = (data.items || [])
        .map((item) => item.id?.videoId)
        .filter(
          (id): id is string =>
            typeof id === 'string' && YOUTUBE_VIDEO_ID_REGEX.test(id)
        );

      return { ok: true, videoIds };
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

      const candidates: ResearchCandidate[] = [];

      for (let i = 0; i < uniqueIds.length; i += 50) {
        const batch = uniqueIds.slice(i, i + 50);
        const url = new URL('https://www.googleapis.com/youtube/v3/videos');
        url.searchParams.set('part', 'id,snippet,contentDetails,status');
        url.searchParams.set('id', batch.join(','));

        const result = await fetchYouTubeJson({
          operation: 'videos',
          url,
          accessToken: params.accessToken,
          timeoutMs: params.timeoutMs,
          signal: params.signal,
          fetchImpl,
          sleep,
          maxAttempts,
          backoffBaseMs,
          maxRetryAfterMs,
        });

        if (!result.ok) {
          return result;
        }

        const data = result.data as { items?: YouTubeVideoItem[] };
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
    },
  };
}

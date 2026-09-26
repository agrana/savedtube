import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';
import {
  INTERVAL_SUGGESTIONS_PROMPT_VERSION,
  INTERVAL_SUGGESTIONS_SCHEMA_VERSION,
  type IntervalSuggestionDeps,
  type IntervalSuggestionSettings,
} from './interval-suggestions';
import { createOpenAiCompatibleIntervalSuggestionProvider } from './llm-provider';
import { parseIsoDurationToSeconds } from './youtube-chapters';

function toSuggestionSettings(): IntervalSuggestionSettings {
  const settings = config.research;
  return {
    enabled: settings.enabled,
    requestDeadlineMs: Math.min(settings.requestDeadlineMs, 90_000),
    providerTimeoutMs: settings.providerTimeoutMs,
    youtubeTimeoutMs: settings.youtubeTimeoutMs,
    modelProvider: settings.modelProvider,
    modelName: settings.modelName,
    userDailyBudget: settings.userDailyBudget,
    projectDailyBudget: settings.projectDailyBudget,
    promptVersion: INTERVAL_SUGGESTIONS_PROMPT_VERSION,
    schemaVersion: INTERVAL_SUGGESTIONS_SCHEMA_VERSION,
  };
}

async function fetchVideoDescription(args: {
  accessToken: string;
  youtubeVideoId: string;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<
  | {
      ok: true;
      description: string;
      durationSeconds: number | null;
    }
  | { ok: false; code: string; message: string; status?: number }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs);
  const onAbort = () => controller.abort();
  if (args.signal) {
    if (args.signal.aborted) {
      controller.abort();
    } else {
      args.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('id', args.youtubeVideoId);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        code:
          response.status === 401
            ? 'youtube_unauthorized'
            : 'youtube_details_failed',
        message: 'Failed to fetch YouTube video details',
        status: response.status,
      };
    }

    const data = (await response.json()) as {
      items?: Array<{
        snippet?: { description?: string };
        contentDetails?: { duration?: string };
      }>;
    };
    const video = data.items?.[0];
    if (!video) {
      return {
        ok: false,
        code: 'video_not_found',
        message: 'Video not found',
        status: 404,
      };
    }

    return {
      ok: true,
      description: video.snippet?.description || '',
      durationSeconds: parseIsoDurationToSeconds(
        video.contentDetails?.duration
      ),
    };
  } catch (error) {
    if (args.signal?.aborted || (error as Error)?.name === 'AbortError') {
      return {
        ok: false,
        code: 'youtube_timeout',
        message: 'YouTube request timed out',
      };
    }
    console.error('fetchVideoDescription exception:', error);
    return {
      ok: false,
      code: 'youtube_details_failed',
      message: 'Failed to fetch YouTube video details',
    };
  } finally {
    clearTimeout(timer);
    if (args.signal) {
      args.signal.removeEventListener('abort', onAbort);
    }
  }
}

export function createDefaultIntervalSuggestionDeps(
  db: Pick<SupabaseClient, 'from' | 'rpc'>
): IntervalSuggestionDeps {
  const settings = config.research;
  if (!settings.modelApiKey) {
    throw new Error('RESEARCH_MODEL_API_KEY is not configured');
  }

  return {
    db,
    llm: createOpenAiCompatibleIntervalSuggestionProvider({
      provider: settings.modelProvider,
      model: settings.modelName,
      apiKey: settings.modelApiKey,
      baseUrl: settings.modelBaseUrl,
    }),
    fetchDescription: fetchVideoDescription,
    researchConfig: toSuggestionSettings(),
  };
}

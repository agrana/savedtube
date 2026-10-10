import 'server-only';

import { config } from './config';
import { createOpenAiCompatiblePathDisplayCleanupProvider } from './llm-provider';
import {
  PATH_DISPLAY_CLEANUP_TIMEOUT_MS,
  resolvePathDisplayMetadata,
  type PathDisplayCleanupResult,
} from './path-display-cleanup';

/**
 * Create-time display cleanup using the configured research model credentials.
 * Missing or failing providers fall back without blocking path creation.
 */
export async function resolveConfiguredPathDisplayMetadata(input: {
  goal: string;
  background: string | null;
  title?: string | null;
  signal?: AbortSignal;
}): Promise<PathDisplayCleanupResult> {
  const settings = config.research;
  const llm = settings.modelApiKey
    ? createOpenAiCompatiblePathDisplayCleanupProvider({
        provider: settings.modelProvider,
        model: settings.modelName,
        apiKey: settings.modelApiKey,
        baseUrl: settings.modelBaseUrl,
      })
    : null;

  return resolvePathDisplayMetadata({
    goal: input.goal,
    background: input.background,
    title: input.title,
    llm,
    timeoutMs: Math.min(
      PATH_DISPLAY_CLEANUP_TIMEOUT_MS,
      settings.providerTimeoutMs
    ),
    signal: input.signal,
  });
}

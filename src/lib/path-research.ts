import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { config, getResearchModelNotConfiguredError } from './config';
import { createOpenAiCompatibleResearchProvider } from './llm-provider';
import {
  type ResearchDeps,
  type ResearchSettings,
} from './path-research-service';
import { createYouTubeDataClient } from './youtube-data';

export {
  assertJobMayPersist,
  buildPersistedRevision,
  claimResearchJob,
  executeResearchPipeline,
  getOwnedPathJob,
  loadOwnedPathDetail,
  runPathResearch,
  type ResearchDeps,
  type ResearchLlmProvider,
  type ResearchRunResult,
  type ResearchSettings,
  type YouTubeClient,
} from './path-research-service';

function toResearchSettings(): ResearchSettings {
  const settings = config.research;
  return {
    enabled: settings.enabled,
    maxDurationSeconds: settings.maxDurationSeconds,
    requestDeadlineMs: settings.requestDeadlineMs,
    providerTimeoutMs: settings.providerTimeoutMs,
    youtubeTimeoutMs: settings.youtubeTimeoutMs,
    modelProvider: settings.modelProvider,
    modelName: settings.modelName,
    userDailyBudget: settings.userDailyBudget,
    projectDailyBudget: settings.projectDailyBudget,
    candidatesPerStage: settings.candidatesPerStage,
    maxStages: settings.maxStages,
    maxVideosPerStage: settings.maxVideosPerStage,
    promptVersion: settings.promptVersion,
    schemaVersion: settings.schemaVersion,
  };
}

export function createDefaultResearchDeps(
  db: Pick<SupabaseClient, 'from' | 'rpc'>
): ResearchDeps {
  const settings = config.research;
  if (!settings.modelApiKey) {
    throw getResearchModelNotConfiguredError();
  }

  return {
    db,
    youtube: createYouTubeDataClient(),
    llm: createOpenAiCompatibleResearchProvider({
      provider: settings.modelProvider,
      model: settings.modelName,
      apiKey: settings.modelApiKey,
      baseUrl: settings.modelBaseUrl,
    }),
    researchConfig: toResearchSettings(),
  };
}

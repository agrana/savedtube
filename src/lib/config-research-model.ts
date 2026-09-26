/**
 * Pure research-model configuration resolver.
 * Takes an env bag so it is unit-testable without binding to process environment.
 * Never reads browser-exposed public keys.
 */

export const RESEARCH_MODEL_DEFAULT_PROVIDER = 'openai';
export const RESEARCH_MODEL_DEFAULT_NAME = 'gpt-4o-mini';
export const RESEARCH_MODEL_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export type ResearchModelEnv = {
  RESEARCH_MODEL_PROVIDER?: string | null | undefined;
  RESEARCH_MODEL_NAME?: string | null | undefined;
  RESEARCH_MODEL_API_KEY?: string | null | undefined;
  RESEARCH_MODEL_BASE_URL?: string | null | undefined;
  OPENAI_API_KEY?: string | null | undefined;
  OPENAI_BASE_URL?: string | null | undefined;
};

export type ResearchModelApiKeySource =
  | 'RESEARCH_MODEL_API_KEY'
  | 'OPENAI_API_KEY'
  | null;

export type ResearchModelBaseUrlSource =
  | 'RESEARCH_MODEL_BASE_URL'
  | 'OPENAI_BASE_URL'
  | 'default';

export type ResolvedResearchModelConfig = {
  modelProvider: string;
  modelName: string;
  modelApiKey: string | null;
  modelBaseUrl: string;
  apiKeySource: ResearchModelApiKeySource;
  baseUrlSource: ResearchModelBaseUrlSource;
  /** Env var names that could supply a key for the active provider but were absent. */
  missingApiKeyVariables: string[];
};

function readTrimmed(
  env: ResearchModelEnv,
  name: keyof ResearchModelEnv
): string | null {
  const value = env[name];
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve research model provider, name, API key, and base URL.
 *
 * Precedence:
 * - RESEARCH_MODEL_API_KEY is preferred over OPENAI_API_KEY
 * - OPENAI_API_KEY is only used when provider is openai
 * - RESEARCH_MODEL_BASE_URL is preferred over OPENAI_BASE_URL
 * - OPENAI_BASE_URL is only used when provider is openai and RESEARCH_MODEL_BASE_URL is absent
 * - RESEARCH_MODEL_PROVIDER / RESEARCH_MODEL_NAME / RESEARCH_MODEL_BASE_URL remain explicit overrides
 */
export function resolveResearchModelConfig(
  env: ResearchModelEnv
): ResolvedResearchModelConfig {
  const modelProvider =
    readTrimmed(env, 'RESEARCH_MODEL_PROVIDER') ||
    RESEARCH_MODEL_DEFAULT_PROVIDER;
  const modelName =
    readTrimmed(env, 'RESEARCH_MODEL_NAME') || RESEARCH_MODEL_DEFAULT_NAME;

  const explicitApiKey = readTrimmed(env, 'RESEARCH_MODEL_API_KEY');
  const openaiApiKey = readTrimmed(env, 'OPENAI_API_KEY');
  const isOpenAiProvider = modelProvider === 'openai';

  let modelApiKey: string | null = null;
  let apiKeySource: ResearchModelApiKeySource = null;

  if (explicitApiKey) {
    modelApiKey = explicitApiKey;
    apiKeySource = 'RESEARCH_MODEL_API_KEY';
  } else if (isOpenAiProvider && openaiApiKey) {
    modelApiKey = openaiApiKey;
    apiKeySource = 'OPENAI_API_KEY';
  }

  const missingApiKeyVariables: string[] = [];
  if (!modelApiKey) {
    missingApiKeyVariables.push('RESEARCH_MODEL_API_KEY');
    if (isOpenAiProvider) {
      missingApiKeyVariables.push('OPENAI_API_KEY');
    }
  }

  const explicitBaseUrl = readTrimmed(env, 'RESEARCH_MODEL_BASE_URL');
  const openaiBaseUrl = readTrimmed(env, 'OPENAI_BASE_URL');

  let modelBaseUrl = RESEARCH_MODEL_DEFAULT_BASE_URL;
  let baseUrlSource: ResearchModelBaseUrlSource = 'default';

  if (explicitBaseUrl) {
    modelBaseUrl = explicitBaseUrl;
    baseUrlSource = 'RESEARCH_MODEL_BASE_URL';
  } else if (isOpenAiProvider && openaiBaseUrl) {
    modelBaseUrl = openaiBaseUrl;
    baseUrlSource = 'OPENAI_BASE_URL';
  }

  return {
    modelProvider,
    modelName,
    modelApiKey,
    modelBaseUrl,
    apiKeySource,
    baseUrlSource,
    missingApiKeyVariables,
  };
}

/**
 * Actionable error text for missing research model configuration.
 * Names only — never includes secret values.
 */
export function researchModelNotConfiguredMessage(
  config: Pick<ResolvedResearchModelConfig, 'missingApiKeyVariables'>
): string {
  const names = config.missingApiKeyVariables;
  if (names.length === 0) {
    return 'Research model is not configured. Research cannot run.';
  }
  if (names.length === 1) {
    return `Research model is not configured: missing ${names[0]}. Research cannot run.`;
  }
  const last = names[names.length - 1];
  const head = names.slice(0, -1).join(', ');
  return `Research model is not configured: missing ${head} or ${last}. Research cannot run.`;
}

import 'server-only';

/**
 * Server-only environment configuration with validation.
 * Browser-safe modules must never import this file — it includes secrets
 * such as SUPABASE_SERVICE_ROLE_KEY and OAuth client secrets.
 */

import {
  RESEARCH_DEFAULT_CANDIDATES_PER_STAGE,
  RESEARCH_DEFAULT_MAX_DURATION_SECONDS,
  RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET,
  RESEARCH_DEFAULT_PROVIDER_TIMEOUT_MS,
  RESEARCH_DEFAULT_REQUEST_DEADLINE_MS,
  RESEARCH_DEFAULT_USER_DAILY_BUDGET,
  RESEARCH_DEFAULT_YOUTUBE_TIMEOUT_MS,
  RESEARCH_MAX_STAGES,
  RESEARCH_MAX_VIDEOS_PER_STAGE,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_SCHEMA_VERSION,
} from './config-research-defaults';

export {
  RESEARCH_DEFAULT_CANDIDATES_PER_STAGE,
  RESEARCH_DEFAULT_MAX_DURATION_SECONDS,
  RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET,
  RESEARCH_DEFAULT_PROVIDER_TIMEOUT_MS,
  RESEARCH_DEFAULT_REQUEST_DEADLINE_MS,
  RESEARCH_DEFAULT_USER_DAILY_BUDGET,
  RESEARCH_DEFAULT_YOUTUBE_TIMEOUT_MS,
  RESEARCH_MAX_STAGES,
  RESEARCH_MAX_VIDEOS_PER_STAGE,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_SCHEMA_VERSION,
} from './config-research-defaults';

interface Config {
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
  };
  nextAuth: {
    secret: string;
    url: string;
  };
  app: {
    isDevelopment: boolean;
    isProduction: boolean;
  };
  /**
   * Path research generation. Values drive route maxDuration, deadlines,
   * provider timeouts, and atomic budget reservations.
   */
  research: {
    enabled: boolean;
    /** Vercel function maxDuration (seconds). Set from deployment plan capability. */
    maxDurationSeconds: number;
    /** Application deadline inside the request (ms); shorter than maxDuration. */
    requestDeadlineMs: number;
    providerTimeoutMs: number;
    youtubeTimeoutMs: number;
    modelProvider: string;
    modelName: string;
    modelApiKey: string | null;
    modelBaseUrl: string;
    userDailyBudget: number;
    projectDailyBudget: number;
    candidatesPerStage: number;
    maxStages: number;
    maxVideosPerStage: number;
    promptVersion: string;
    schemaVersion: string;
  };
}

function isBuildTime(): boolean {
  return (
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build'
  );
}

function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (isBuildTime()) {
      // Allow `next build` module analysis without a full local .env.
      // Runtime requests still fail closed when secrets are missing.
      return `missing-${name}`;
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateUrl(url: string, name: string): string {
  if (isBuildTime() && url.startsWith('missing-')) {
    return 'http://localhost';
  }
  try {
    new URL(url);
    return url;
  } catch {
    throw new Error(`Invalid URL for ${name}: ${url}`);
  }
}

function optionalEnvVar(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return null;
  }
  return value;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
}

function parseNonNegativeInt(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative integer for ${name}: ${raw}`);
  }
  return parsed;
}

let cachedConfig: Config | null = null;

function loadConfig(): Config {
  const maxDurationSeconds = parsePositiveInt(
    process.env.RESEARCH_MAX_DURATION_SECONDS,
    RESEARCH_DEFAULT_MAX_DURATION_SECONDS,
    'RESEARCH_MAX_DURATION_SECONDS'
  );

  return {
    supabase: {
      url: validateUrl(
        requireEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
        'NEXT_PUBLIC_SUPABASE_URL'
      ),
      anonKey: requireEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      serviceRoleKey: requireEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    },
    google: {
      clientId: requireEnvVar('GOOGLE_CLIENT_ID'),
      clientSecret: requireEnvVar('GOOGLE_CLIENT_SECRET'),
    },
    nextAuth: {
      secret: requireEnvVar('NEXTAUTH_SECRET'),
      url: validateUrl(requireEnvVar('NEXTAUTH_URL'), 'NEXTAUTH_URL'),
    },
    app: {
      isDevelopment: process.env.NODE_ENV === 'development',
      isProduction: process.env.NODE_ENV === 'production',
    },
    research: {
      enabled: process.env.RESEARCH_ENABLED !== 'false',
      maxDurationSeconds,
      requestDeadlineMs: parsePositiveInt(
        process.env.RESEARCH_REQUEST_DEADLINE_MS,
        Math.min(
          RESEARCH_DEFAULT_REQUEST_DEADLINE_MS,
          maxDurationSeconds * 1000 - 15_000
        ),
        'RESEARCH_REQUEST_DEADLINE_MS'
      ),
      providerTimeoutMs: parsePositiveInt(
        process.env.RESEARCH_PROVIDER_TIMEOUT_MS,
        RESEARCH_DEFAULT_PROVIDER_TIMEOUT_MS,
        'RESEARCH_PROVIDER_TIMEOUT_MS'
      ),
      youtubeTimeoutMs: parsePositiveInt(
        process.env.RESEARCH_YOUTUBE_TIMEOUT_MS,
        RESEARCH_DEFAULT_YOUTUBE_TIMEOUT_MS,
        'RESEARCH_YOUTUBE_TIMEOUT_MS'
      ),
      modelProvider: optionalEnvVar('RESEARCH_MODEL_PROVIDER') || 'openai',
      modelName: optionalEnvVar('RESEARCH_MODEL_NAME') || 'gpt-4o-mini',
      modelApiKey: optionalEnvVar('RESEARCH_MODEL_API_KEY'),
      modelBaseUrl:
        optionalEnvVar('RESEARCH_MODEL_BASE_URL') ||
        'https://api.openai.com/v1',
      userDailyBudget: parseNonNegativeInt(
        process.env.RESEARCH_USER_DAILY_BUDGET,
        RESEARCH_DEFAULT_USER_DAILY_BUDGET,
        'RESEARCH_USER_DAILY_BUDGET'
      ),
      projectDailyBudget: parseNonNegativeInt(
        process.env.RESEARCH_PROJECT_DAILY_BUDGET,
        RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET,
        'RESEARCH_PROJECT_DAILY_BUDGET'
      ),
      candidatesPerStage: parsePositiveInt(
        process.env.RESEARCH_CANDIDATES_PER_STAGE,
        RESEARCH_DEFAULT_CANDIDATES_PER_STAGE,
        'RESEARCH_CANDIDATES_PER_STAGE'
      ),
      maxStages: RESEARCH_MAX_STAGES,
      maxVideosPerStage: RESEARCH_MAX_VIDEOS_PER_STAGE,
      promptVersion:
        optionalEnvVar('RESEARCH_PROMPT_VERSION') || RESEARCH_PROMPT_VERSION,
      schemaVersion:
        optionalEnvVar('RESEARCH_SCHEMA_VERSION') || RESEARCH_SCHEMA_VERSION,
    },
  };
}

export const config: Config = new Proxy({} as Config, {
  get(_target, property, receiver) {
    if (!cachedConfig) {
      cachedConfig = loadConfig();
    }
    return Reflect.get(cachedConfig, property, receiver);
  },
});

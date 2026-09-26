/** Browser-safe research defaults shared by config and tests. No secrets. */

/** Defaults aligned with Vercel Pro Fluid Compute (300s) and a shorter app deadline. */
export const RESEARCH_DEFAULT_MAX_DURATION_SECONDS = 300;
export const RESEARCH_DEFAULT_REQUEST_DEADLINE_MS = 240_000;
export const RESEARCH_DEFAULT_PROVIDER_TIMEOUT_MS = 45_000;
export const RESEARCH_DEFAULT_YOUTUBE_TIMEOUT_MS = 15_000;
export const RESEARCH_DEFAULT_USER_DAILY_BUDGET = 10;
export const RESEARCH_DEFAULT_PROJECT_DAILY_BUDGET = 200;
export const RESEARCH_DEFAULT_CANDIDATES_PER_STAGE = 5;
export const RESEARCH_MAX_STAGES = 5;
export const RESEARCH_MAX_VIDEOS_PER_STAGE = 2;
export const RESEARCH_PROMPT_VERSION = 'research-plan-select-v1';
export const RESEARCH_SCHEMA_VERSION = 'path-research-v1';

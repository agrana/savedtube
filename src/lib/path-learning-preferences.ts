import { z } from 'zod';
import type { ResearchCandidate } from './path-research-schema';

export const PATH_LEARNING_LEVELS = [
  'beginner',
  'intermediate',
  'advanced',
] as const;

export const PATH_LEARNING_STYLES = [
  'corporate',
  'fun',
  'academic',
] as const;

/** Minutes per video. `null` means no per-video duration cap. */
export const PATH_MAX_VIDEO_DURATION_MINUTES_OPTIONS = [
  null,
  5,
  10,
  15,
  20,
  30,
  60,
] as const;

export type PathLearningLevel = (typeof PATH_LEARNING_LEVELS)[number];
export type PathLearningStyle = (typeof PATH_LEARNING_STYLES)[number];
export type PathMaxVideoDurationMinutes =
  (typeof PATH_MAX_VIDEO_DURATION_MINUTES_OPTIONS)[number];

export type PathLearningPreferences = {
  level: PathLearningLevel;
  maxVideoDurationMinutes: PathMaxVideoDurationMinutes;
  style: PathLearningStyle;
};

export const DEFAULT_PATH_LEARNING_PREFERENCES: PathLearningPreferences = {
  level: 'beginner',
  maxVideoDurationMinutes: null,
  style: 'corporate',
};

/** Marker for structured prefs stored in paths.background (no schema migration). */
export const PATH_LEARNING_PREFERENCES_STORAGE_KEY =
  'savedtubeLearningPreferences' as const;
export const PATH_LEARNING_PREFERENCES_STORAGE_VERSION = 1 as const;

const pathLearningPreferencesFieldsSchema = z.object({
  level: z.enum(PATH_LEARNING_LEVELS),
  maxVideoDurationMinutes: z.union([
    z.null(),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(60),
  ]),
  style: z.enum(PATH_LEARNING_STYLES),
});

export const pathLearningPreferencesSchema =
  pathLearningPreferencesFieldsSchema;

/** Partial create-body preferences; missing keys fill from defaults. */
export const pathLearningPreferencesInputSchema = z
  .object({
    level: z.enum(PATH_LEARNING_LEVELS).optional(),
    maxVideoDurationMinutes: z
      .union([
        z.null(),
        z.literal(5),
        z.literal(10),
        z.literal(15),
        z.literal(20),
        z.literal(30),
        z.literal(60),
      ])
      .optional(),
    style: z.enum(PATH_LEARNING_STYLES).optional(),
  })
  .strict();

const preferencesStorageEnvelopeSchema = z
  .object({
    [PATH_LEARNING_PREFERENCES_STORAGE_KEY]: z.literal(
      PATH_LEARNING_PREFERENCES_STORAGE_VERSION
    ),
    level: z.enum(PATH_LEARNING_LEVELS),
    maxVideoDurationMinutes: z.union([
      z.null(),
      z.literal(5),
      z.literal(10),
      z.literal(15),
      z.literal(20),
      z.literal(30),
      z.literal(60),
    ]),
    style: z.enum(PATH_LEARNING_STYLES),
  })
  .strict();

export function normalizePathLearningPreferences(
  input?: Partial<PathLearningPreferences> | null
): PathLearningPreferences {
  const parsed = pathLearningPreferencesInputSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ...DEFAULT_PATH_LEARNING_PREFERENCES };
  }
  return {
    level: parsed.data.level ?? DEFAULT_PATH_LEARNING_PREFERENCES.level,
    maxVideoDurationMinutes:
      parsed.data.maxVideoDurationMinutes === undefined
        ? DEFAULT_PATH_LEARNING_PREFERENCES.maxVideoDurationMinutes
        : parsed.data.maxVideoDurationMinutes,
    style: parsed.data.style ?? DEFAULT_PATH_LEARNING_PREFERENCES.style,
  };
}

export function parsePathLearningPreferences(
  value: unknown
):
  | { success: true; data: PathLearningPreferences }
  | { success: false; error: string } {
  const result = pathLearningPreferencesSchema.safeParse(value);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Invalid learning preferences',
    };
  }
  return { success: true, data: result.data };
}

export function serializePathLearningPreferences(
  preferences: PathLearningPreferences
): string {
  return JSON.stringify({
    [PATH_LEARNING_PREFERENCES_STORAGE_KEY]:
      PATH_LEARNING_PREFERENCES_STORAGE_VERSION,
    level: preferences.level,
    maxVideoDurationMinutes: preferences.maxVideoDurationMinutes,
    style: preferences.style,
  });
}

/**
 * Resolve prefs + optional legacy free-text background from paths.background.
 * Structured envelopes never become prompt "background" text.
 */
export function resolvePathLearningInput(background: string | null): {
  preferences: PathLearningPreferences;
  legacyBackground: string | null;
  storedAsPreferences: boolean;
} {
  if (!background || background.trim().length === 0) {
    return {
      preferences: { ...DEFAULT_PATH_LEARNING_PREFERENCES },
      legacyBackground: null,
      storedAsPreferences: false,
    };
  }

  const trimmed = background.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsedJson: unknown = JSON.parse(trimmed);
      const envelope = preferencesStorageEnvelopeSchema.safeParse(parsedJson);
      if (envelope.success) {
        return {
          preferences: {
            level: envelope.data.level,
            maxVideoDurationMinutes: envelope.data.maxVideoDurationMinutes,
            style: envelope.data.style,
          },
          legacyBackground: null,
          storedAsPreferences: true,
        };
      }
    } catch {
      // Fall through to legacy free-text background.
    }
  }

  return {
    preferences: { ...DEFAULT_PATH_LEARNING_PREFERENCES },
    legacyBackground: trimmed,
    storedAsPreferences: false,
  };
}

/** Read preferences from a research input_snapshot, falling back to background. */
export function preferencesFromResearchSnapshot(
  snapshot: Record<string, unknown>
): {
  preferences: PathLearningPreferences;
  legacyBackground: string | null;
} {
  const fromField = parsePathLearningPreferences(snapshot.preferences);
  if (fromField.success) {
    const background =
      typeof snapshot.background === 'string' &&
      snapshot.background.trim().length > 0
        ? snapshot.background.trim()
        : null;
    // Prefer structured prefs; ignore accidental JSON background when prefs exist.
    const resolvedBackground = resolvePathLearningInput(background);
    return {
      preferences: fromField.data,
      legacyBackground: resolvedBackground.storedAsPreferences
        ? null
        : resolvedBackground.legacyBackground,
    };
  }

  const background =
    typeof snapshot.background === 'string' ? snapshot.background : null;
  const resolved = resolvePathLearningInput(background);
  return {
    preferences: resolved.preferences,
    legacyBackground: resolved.legacyBackground,
  };
}

const LEVEL_SEARCH_HINT: Record<PathLearningLevel, string> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
};

const STYLE_SEARCH_HINT: Record<PathLearningStyle, string> = {
  corporate: 'professional corporate',
  fun: 'fun engaging',
  academic: 'academic lecture',
};

/**
 * Deterministically bias YouTube search queries with level/style hints.
 * Keeps the planner query as the base; does not invent video IDs.
 */
export function augmentSearchQueryWithPreferences(
  searchQuery: string,
  preferences: PathLearningPreferences
): string {
  const base = searchQuery.trim().replace(/\s+/g, ' ');
  if (!base) {
    return base;
  }
  const hints = `${LEVEL_SEARCH_HINT[preferences.level]} ${STYLE_SEARCH_HINT[preferences.style]}`;
  const combined = `${base} ${hints}`.trim();
  return combined.slice(0, 200);
}

export function maxVideoDurationSeconds(
  preferences: PathLearningPreferences
): number | null {
  if (preferences.maxVideoDurationMinutes === null) {
    return null;
  }
  return preferences.maxVideoDurationMinutes * 60;
}

/**
 * Hard filter: when capped, reject over-limit and unknown-duration candidates.
 * Never relaxes the cap.
 */
export function filterCandidatesByMaxVideoDuration(
  candidatesByStage: ReadonlyMap<number, ReadonlyArray<ResearchCandidate>>,
  preferences: PathLearningPreferences
): {
  candidatesByStage: Map<number, ResearchCandidate[]>;
  emptyStages: number[];
  rejectedCount: number;
} {
  const maxSeconds = maxVideoDurationSeconds(preferences);
  const filtered = new Map<number, ResearchCandidate[]>();
  const emptyStages: number[] = [];
  let rejectedCount = 0;

  if (maxSeconds === null) {
    for (const [stageIndex, candidates] of candidatesByStage) {
      filtered.set(stageIndex, [...candidates]);
      if (candidates.length === 0) {
        emptyStages.push(stageIndex);
      }
    }
    return { candidatesByStage: filtered, emptyStages, rejectedCount };
  }

  for (const [stageIndex, candidates] of candidatesByStage) {
    const retained: ResearchCandidate[] = [];
    for (const candidate of candidates) {
      if (
        candidate.durationSeconds === null ||
        candidate.durationSeconds === undefined ||
        candidate.durationSeconds > maxSeconds
      ) {
        rejectedCount += 1;
        continue;
      }
      retained.push(candidate);
    }
    filtered.set(stageIndex, retained);
    if (retained.length === 0) {
      emptyStages.push(stageIndex);
    }
  }

  return { candidatesByStage: filtered, emptyStages, rejectedCount };
}

export function durationCapFailureMessage(
  preferences: PathLearningPreferences
): string {
  const minutes = preferences.maxVideoDurationMinutes;
  if (minutes === null) {
    return 'No playable YouTube videos matched this path within the selected preferences.';
  }
  return `No playable YouTube videos matched this path within the ${minutes}-minute per-video limit. Try a longer max length or refine the goal.`;
}

/** Browser draft for the create-path form (legacy drafts remain readable). */
export const PATH_CREATE_DRAFT_STORAGE_KEY = 'savedtube:path-create-draft';

export type PathCreateDraftV1 = {
  goal?: string;
  background?: string;
};

export type PathCreateDraftV2 = {
  version: 2;
  goal: string;
  preferences: PathLearningPreferences;
  updatedAt: string;
};

export function serializePathCreateDraft(input: {
  goal: string;
  preferences: PathLearningPreferences;
}): string {
  const draft: PathCreateDraftV2 = {
    version: 2,
    goal: input.goal,
    preferences: input.preferences,
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(draft);
}

export function parsePathCreateDraft(raw: string | null): {
  goal: string;
  preferences: PathLearningPreferences;
} | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (record.version === 2) {
      const prefs = parsePathLearningPreferences(record.preferences);
      if (!prefs.success || typeof record.goal !== 'string') {
        return null;
      }
      return { goal: record.goal, preferences: prefs.data };
    }

    // Legacy drafts: goal + optional free-text background only.
    const goal = typeof record.goal === 'string' ? record.goal : '';
    if (!goal && typeof record.background !== 'string') {
      return null;
    }
    return {
      goal,
      preferences: { ...DEFAULT_PATH_LEARNING_PREFERENCES },
    };
  } catch {
    return null;
  }
}

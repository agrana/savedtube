import type { PathLearningPreferences } from './path-learning-preferences';

export type ResearchIdempotencyStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type ResearchIdempotencyIntent = {
  /** Stable for one form visit; reminted when the form is opened again. */
  intentId: string;
  /** Canonical edited goal + preferences for this submit attempt. */
  fingerprint: string;
};

type StoredResearchIdempotencyEntry = {
  key: string;
  intentId: string;
  fingerprint: string;
};

export function researchIdempotencyStorageKey(pathId: string): string {
  return `savedtube:research-idempotency:${pathId}`;
}

export function createResearchFormVisitIntentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `visit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function fingerprintPathResearchRequest(
  goal: string,
  preferences: PathLearningPreferences
): string {
  return JSON.stringify({
    goal: goal.trim(),
    level: preferences.level,
    maxVideoDurationMinutes: preferences.maxVideoDurationMinutes,
    style: preferences.style,
  });
}

function createResearchIdempotencyKeyValue(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseStoredResearchIdempotencyEntry(
  raw: string
): StoredResearchIdempotencyEntry | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.key !== 'string' ||
      record.key.length < 8 ||
      typeof record.intentId !== 'string' ||
      record.intentId.length === 0 ||
      typeof record.fingerprint !== 'string' ||
      record.fingerprint.length === 0
    ) {
      return null;
    }
    return {
      key: record.key,
      intentId: record.intentId,
      fingerprint: record.fingerprint,
    };
  } catch {
    return null;
  }
}

/**
 * Reuse the same key only for the same form-visit intent and canonical
 * goal/preferences fingerprint (network retries). Edited settings or a new
 * form visit mint a fresh key. Legacy bare-UUID storage is ignored.
 */
export function getOrCreateResearchIdempotencyKey(
  storage: ResearchIdempotencyStorage | null | undefined,
  pathId: string,
  intent: ResearchIdempotencyIntent,
  createKey: () => string = createResearchIdempotencyKeyValue
): string {
  const storageKey = researchIdempotencyStorageKey(pathId);
  if (storage) {
    try {
      const existingRaw = storage.getItem(storageKey);
      if (existingRaw) {
        const existing = parseStoredResearchIdempotencyEntry(existingRaw);
        if (
          existing &&
          existing.intentId === intent.intentId &&
          existing.fingerprint === intent.fingerprint
        ) {
          return existing.key;
        }
      }
    } catch {
      // sessionStorage may be unavailable; fall through to a fresh key.
    }
  }

  const key = createKey();
  if (storage) {
    try {
      const entry: StoredResearchIdempotencyEntry = {
        key,
        intentId: intent.intentId,
        fingerprint: intent.fingerprint,
      };
      storage.setItem(storageKey, JSON.stringify(entry));
    } catch {
      // Ignore persistence failures; in-memory key still prevents double-submit.
    }
  }
  return key;
}

/** Clear after a terminal research outcome (succeeded or failed). */
export function clearResearchIdempotencyKey(
  storage: ResearchIdempotencyStorage | null | undefined,
  pathId: string
): void {
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(researchIdempotencyStorageKey(pathId));
  } catch {
    // Ignore.
  }
}

/** True when the research HTTP exchange reached a terminal job or success. */
export function shouldClearResearchIdempotencyKey(input: {
  responseOk: boolean;
  job?: { status?: string } | null;
}): boolean {
  if (input.responseOk) {
    return true;
  }
  const status = input.job?.status;
  return status === 'succeeded' || status === 'failed';
}

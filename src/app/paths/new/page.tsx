'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import {
  DEFAULT_PATH_LEARNING_PREFERENCES,
  PATH_CREATE_DRAFT_STORAGE_KEY,
  PATH_LEARNING_LEVELS,
  PATH_LEARNING_STYLES,
  PATH_MAX_VIDEO_DURATION_MINUTES_OPTIONS,
  parsePathCreateDraft,
  serializePathCreateDraft,
  type PathLearningLevel,
  type PathLearningPreferences,
  type PathLearningStyle,
  type PathMaxVideoDurationMinutes,
} from '@/lib/path-learning-preferences';

function researchIdempotencyStorageKey(pathId: string): string {
  return `savedtube:research-idempotency:${pathId}`;
}

function getOrCreateIdempotencyKey(pathId: string): string {
  const storageKey = researchIdempotencyStorageKey(pathId);
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing && existing.length >= 8) {
      return existing;
    }
  } catch {
    // sessionStorage may be unavailable; fall through to a fresh key.
  }
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `research-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    sessionStorage.setItem(storageKey, key);
  } catch {
    // Ignore persistence failures; in-memory key still prevents double-submit in-flight.
  }
  return key;
}

const researchProgressMoments = [
  'Finding strong starting points...',
  'Comparing videos for signal and fit...',
  'Shaping a sequence you can return to...',
] as const;

const selectClassName =
  'mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-stone-100 outline-none transition focus:border-amber-200/40 focus:bg-white/[0.055]';

const LEVEL_LABELS: Record<PathLearningLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const STYLE_LABELS: Record<PathLearningStyle, string> = {
  corporate: 'Corporate',
  fun: 'Fun',
  academic: 'Academic',
};

function durationOptionLabel(
  minutes: PathMaxVideoDurationMinutes
): string {
  if (minutes === null) {
    return 'No limit';
  }
  return `${minutes} minutes`;
}

function durationSelectValue(
  minutes: PathMaxVideoDurationMinutes
): string {
  return minutes === null ? 'none' : String(minutes);
}

function parseDurationSelectValue(
  value: string
): PathMaxVideoDurationMinutes {
  if (value === 'none') {
    return null;
  }
  const parsed = Number(value);
  if (
    parsed === 5 ||
    parsed === 10 ||
    parsed === 15 ||
    parsed === 20 ||
    parsed === 30 ||
    parsed === 60
  ) {
    return parsed;
  }
  return null;
}

export default function NewPathPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [goal, setGoal] = useState('');
  const [preferences, setPreferences] = useState<PathLearningPreferences>(
    () => ({ ...DEFAULT_PATH_LEARNING_PREFERENCES })
  );
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPhase, setCreatePhase] = useState<
    'idle' | 'saving' | 'researching'
  >('idle');
  const [researchBeat, setResearchBeat] = useState(0);

  useEffect(() => {
    try {
      const restored = parsePathCreateDraft(
        window.localStorage.getItem(PATH_CREATE_DRAFT_STORAGE_KEY)
      );
      if (restored) {
        setGoal(restored.goal);
        setPreferences(restored.preferences);
      }
    } catch {
      // localStorage may be unavailable.
    }
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    if (!draftHydrated || isCreating) {
      return;
    }
    try {
      if (!goal.trim()) {
        window.localStorage.removeItem(PATH_CREATE_DRAFT_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(
        PATH_CREATE_DRAFT_STORAGE_KEY,
        serializePathCreateDraft({ goal, preferences })
      );
    } catch {
      // Ignore persistence failures.
    }
  }, [goal, preferences, draftHydrated, isCreating]);

  useEffect(() => {
    if (createPhase !== 'researching') {
      setResearchBeat(0);
      return;
    }

    const timer = window.setInterval(() => {
      setResearchBeat((beat) => (beat + 1) % 3);
    }, 2200);

    return () => window.clearInterval(timer);
  }, [createPhase]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (isCreating) {
      return;
    }
    setCreateError(null);
    setIsCreating(true);
    setCreatePhase('saving');

    try {
      const createResponse = await fetch('/api/paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          preferences,
        }),
      });

      const createData = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) {
        setCreateError(createData.error || 'Failed to create path');
        return;
      }

      const pathId = createData.path?.id as string | undefined;
      if (!pathId) {
        setCreateError('Path was created but no id was returned');
        return;
      }

      // Persist input first, then explicitly research once (never on reload).
      setCreatePhase('researching');
      const idempotencyKey = getOrCreateIdempotencyKey(pathId);
      const researchResponse = await fetch(`/api/paths/${pathId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey }),
      });
      const researchData = await researchResponse.json().catch(() => ({}));

      setGoal('');
      setPreferences({ ...DEFAULT_PATH_LEARNING_PREFERENCES });
      try {
        window.localStorage.removeItem(PATH_CREATE_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore.
      }

      // Always open the saved path — research failure must not discard the shell.
      const query =
        researchResponse.ok || researchData.job
          ? `?researchJob=${encodeURIComponent(
              researchData.job?.id || ''
            )}&researchStatus=${encodeURIComponent(
              researchData.job?.status ||
                (researchResponse.ok ? 'succeeded' : 'failed')
            )}`
          : `?researchError=${encodeURIComponent(
              researchData.error || 'Research failed'
            )}${
              researchData.code
                ? `&researchErrorCode=${encodeURIComponent(
                    String(researchData.code)
                  )}`
                : ''
            }`;

      router.push(`/paths/${pathId}${query}`);
    } catch (error) {
      console.error('Error creating path:', error);
      setCreateError('Failed to create path');
    } finally {
      setIsCreating(false);
      setCreatePhase('idle');
    }
  };

  if (sessionStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-24 w-24 border-b-2 border-amber-200" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#080806] text-stone-100 flex items-center justify-center px-5">
        <div className="rounded-[2rem] border border-white/10 bg-[#10100d]/90 p-8 text-center shadow-2xl shadow-black/50">
          <h1 className="text-2xl font-medium tracking-[-0.03em] text-stone-50 mb-4">
            Access Denied
          </h1>
          <p className="text-stone-400">
            Please sign in to create learning paths.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080806] text-stone-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_55%)]" />
      <div className="pointer-events-none absolute left-1/2 top-20 h-[1px] w-[78vw] -translate-x-1/2 bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      <nav className="relative z-10 border-b border-white/[0.06] bg-[#080806]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-4">
            <Logo size="lg" variant="white" showText={true} />
            <span className="hidden rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-amber-100/80 sm:inline-flex">
              New path
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link
              href="/paths"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] hover:text-stone-50"
            >
              Your paths
            </Link>
            <div className="hidden items-center gap-3 sm:flex">
              {session.user?.image && (
                <Image
                  className="h-8 w-8 rounded-full border border-white/10"
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={32}
                  height={32}
                />
              )}
              <span className="max-w-36 truncate text-sm font-medium text-stone-300">
                {session.user?.name}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-stone-200 transition hover:bg-white/[0.06] hover:text-stone-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:py-14">
        <section className="mb-9 max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-amber-100/70">
            Build your path to mastery
          </p>
          <h1 className="mt-4 text-4xl font-medium leading-[0.95] tracking-[-0.055em] text-stone-50 sm:text-5xl">
            What do you want to learn?
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-400">
            Save your learning goal and preferences, then research a bounded
            sequence of real YouTube videos. Reloading a path never starts
            another model call.
          </p>
          {isCreating ? (
            <div
              className="mt-7 max-w-2xl rounded-2xl border border-amber-200/15 bg-amber-300/[0.06] px-4 py-4 text-sm text-amber-50/90"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-200/70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-200" />
                </span>
                <span>
                  {createPhase === 'saving'
                    ? 'Saving your intention...'
                    : researchProgressMoments[researchBeat]}
                </span>
              </div>
              {createPhase === 'researching' ? (
                <div className="mt-4 grid grid-cols-3 gap-2" aria-hidden="true">
                  {researchProgressMoments.map((moment, index) => (
                    <div key={moment}>
                      <div
                        className={`h-1 rounded-full transition-colors duration-500 ${
                          index === researchBeat
                            ? 'bg-amber-200 animate-pulse'
                            : 'bg-white/10'
                        }`}
                      />
                      <span className="mt-2 block truncate text-[10px] uppercase tracking-[0.12em] text-stone-500">
                        {index === 0
                          ? 'Discover'
                          : index === 1
                            ? 'Compare'
                            : 'Shape'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <form
          onSubmit={handleCreate}
          className="mb-10 max-w-3xl rounded-[1.5rem] border border-white/10 bg-[#10100d]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur sm:p-6"
        >
          <label className="block" htmlFor="path-learning-goal">
            <span className="text-sm font-medium text-stone-200">
              Learning goal
            </span>
            <textarea
              id="path-learning-goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              required
              rows={3}
              maxLength={500}
              placeholder="e.g. Pass the CKA exam"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-stone-100 placeholder:text-stone-500 outline-none transition focus:border-amber-200/40 focus:bg-white/[0.055]"
            />
          </label>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block" htmlFor="path-learning-level">
              <span className="text-sm font-medium text-stone-200">Level</span>
              <select
                id="path-learning-level"
                value={preferences.level}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    level: event.target.value as PathLearningLevel,
                  }))
                }
                className={selectClassName}
              >
                {PATH_LEARNING_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block" htmlFor="path-max-video-duration">
              <span className="text-sm font-medium text-stone-200">
                Max length
              </span>
              <select
                id="path-max-video-duration"
                value={durationSelectValue(preferences.maxVideoDurationMinutes)}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    maxVideoDurationMinutes: parseDurationSelectValue(
                      event.target.value
                    ),
                  }))
                }
                className={selectClassName}
              >
                {PATH_MAX_VIDEO_DURATION_MINUTES_OPTIONS.map((minutes) => (
                  <option
                    key={durationSelectValue(minutes)}
                    value={durationSelectValue(minutes)}
                  >
                    {durationOptionLabel(minutes)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block" htmlFor="path-learning-style">
              <span className="text-sm font-medium text-stone-200">Style</span>
              <select
                id="path-learning-style"
                value={preferences.style}
                onChange={(event) =>
                  setPreferences((current) => ({
                    ...current,
                    style: event.target.value as PathLearningStyle,
                  }))
                }
                className={selectClassName}
              >
                {PATH_LEARNING_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {STYLE_LABELS[style]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Max length is the maximum duration per video. Level and style guide
            search and selection; the duration cap is enforced from verified
            YouTube metadata.
          </p>

          {createError && (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {createError}
            </p>
          )}

          <button
            type="submit"
            disabled={isCreating || !goal.trim()}
            className="mt-5 rounded-full bg-stone-100 px-6 py-3 text-sm font-medium text-stone-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >
            {createPhase === 'saving'
              ? 'Saving path...'
              : createPhase === 'researching'
                ? 'Researching videos...'
                : 'Create and research'}
          </button>
        </form>
      </main>
    </div>
  );
}

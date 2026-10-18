/**
 * Client-side path playback: resume timestamps, path cursor, and watched-to-end
 * completion. Watched completion is separate from practiced/mastery.
 *
 * Persistence is browser localStorage only (device-local, not cross-device).
 * Keys are scoped by account + path when available. Storage failures are ignored.
 */

export type PathResumeSequenceItem = {
  pathVideoId: string;
  youtubeVideoId: string;
};

export type PathPlaybackResumeCursor = {
  pathVideoId: string;
  youtubeVideoId: string;
  time: number;
};

export type PathResumeTarget = {
  pathVideoId: string;
  youtubeVideoId: string;
  time: number | null;
};

/** Query flag set only on the path-detail "Resume path" link. */
export const PATH_RESUME_INTENT_PARAM = 'resume';
export const PATH_RESUME_INTENT_VALUE = '1';

const WATCHED_COMPLETED_VERSION = 'v1';

export const getVideoResumePositionKey = (youtubeVideoId: string) =>
  `savedtube:resume-position:${youtubeVideoId}`;

export const getPathResumeCursorKey = (pathId: string) =>
  `savedtube:path-resume:${pathId}`;

export function resolvePlaybackAccountScope(
  userId: string | null | undefined
): string {
  const trimmed = typeof userId === 'string' ? userId.trim() : '';
  return trimmed.length > 0 ? trimmed : 'anon';
}

export const getWatchedCompletedKey = (accountScope: string, pathId: string) =>
  `savedtube:watched-completed:${WATCHED_COMPLETED_VERSION}:${accountScope}:${pathId}`;

export function isMeaningfulResumeTime(time: number): boolean {
  return Number.isFinite(time) && time > 3;
}

export function isPathResumeIntent(value: string | null | undefined): boolean {
  return value === PATH_RESUME_INTENT_VALUE;
}

/** Safe browser localStorage access (getter and ops may throw). */
export function browserLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Build the playable resume spine from path stages (already dismissal-filtered). */
export function buildResumeSequenceFromStages(
  stages: ReadonlyArray<{
    position: number;
    videos: ReadonlyArray<{
      id: string;
      youtube_video_id: string;
      position: number;
      title?: string;
    }>;
  }>
): PathResumeSequenceItem[] {
  const orderedStages = [...stages].sort((a, b) => a.position - b.position);
  const sequence: PathResumeSequenceItem[] = [];
  for (const stage of orderedStages) {
    const orderedVideos = [...stage.videos].sort(
      (a, b) => a.position - b.position
    );
    for (const video of orderedVideos) {
      sequence.push({
        pathVideoId: video.id,
        youtubeVideoId: video.youtube_video_id,
      });
    }
  }
  return sequence;
}

export function collectVideoResumeSeconds(
  sequence: readonly PathResumeSequenceItem[],
  storage: Pick<Storage, 'getItem'> | null = browserLocalStorage()
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of sequence) {
    const saved = readVideoResumePosition(item.youtubeVideoId, storage);
    if (saved !== null) {
      map.set(item.youtubeVideoId, saved);
    }
  }
  return map;
}

export function readVideoResumePosition(
  youtubeVideoId: string,
  storage: Pick<Storage, 'getItem'> | null = browserLocalStorage()
): number | null {
  if (!storage) return null;
  try {
    const value = Number(
      storage.getItem(getVideoResumePositionKey(youtubeVideoId))
    );
    return isMeaningfulResumeTime(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeVideoResumePosition(
  youtubeVideoId: string,
  time: number,
  storage: Pick<
    Storage,
    'setItem' | 'removeItem'
  > | null = browserLocalStorage()
): void {
  if (!storage || !isMeaningfulResumeTime(time)) return;
  try {
    storage.setItem(
      getVideoResumePositionKey(youtubeVideoId),
      String(Math.floor(time))
    );
  } catch {
    // Quota / security errors — resume is best-effort.
  }
}

export function clearVideoResumePosition(
  youtubeVideoId: string,
  storage: Pick<Storage, 'removeItem'> | null = browserLocalStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(getVideoResumePositionKey(youtubeVideoId));
  } catch {
    // Ignore storage failures.
  }
}

export function readPathResumeCursor(
  pathId: string,
  storage: Pick<Storage, 'getItem'> | null = browserLocalStorage()
): PathPlaybackResumeCursor | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(getPathResumeCursorKey(pathId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as PathPlaybackResumeCursor).pathVideoId !== 'string' ||
      typeof (parsed as PathPlaybackResumeCursor).youtubeVideoId !== 'string' ||
      !isMeaningfulResumeTime((parsed as PathPlaybackResumeCursor).time)
    ) {
      return null;
    }
    return {
      pathVideoId: (parsed as PathPlaybackResumeCursor).pathVideoId,
      youtubeVideoId: (parsed as PathPlaybackResumeCursor).youtubeVideoId,
      time: Math.floor((parsed as PathPlaybackResumeCursor).time),
    };
  } catch {
    return null;
  }
}

export function writePathResumeCursor(
  pathId: string,
  cursor: PathPlaybackResumeCursor,
  storage: Pick<
    Storage,
    'setItem' | 'removeItem'
  > | null = browserLocalStorage()
): void {
  if (!storage || !isMeaningfulResumeTime(cursor.time)) return;
  try {
    storage.setItem(
      getPathResumeCursorKey(pathId),
      JSON.stringify({
        pathVideoId: cursor.pathVideoId,
        youtubeVideoId: cursor.youtubeVideoId,
        time: Math.floor(cursor.time),
      })
    );
  } catch {
    // Quota / security errors — resume is best-effort.
  }
}

export function clearPathResumeCursor(
  pathId: string,
  storage: Pick<Storage, 'removeItem'> | null = browserLocalStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(getPathResumeCursorKey(pathId));
  } catch {
    // Ignore storage failures.
  }
}

export function readWatchedCompletedIds(
  accountScope: string,
  pathId: string,
  storage: Pick<Storage, 'getItem'> | null = browserLocalStorage()
): Set<string> {
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(getWatchedCompletedKey(accountScope, pathId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter(
        (id): id is string => typeof id === 'string' && id.length > 0
      )
    );
  } catch {
    return new Set();
  }
}

export function writeWatchedCompletedIds(
  accountScope: string,
  pathId: string,
  ids: ReadonlySet<string>,
  storage: Pick<
    Storage,
    'setItem' | 'removeItem'
  > | null = browserLocalStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(
      getWatchedCompletedKey(accountScope, pathId),
      JSON.stringify([...ids])
    );
  } catch {
    // Quota / security errors — completion is best-effort.
  }
}

export function markPathVideoWatchedCompleted(
  accountScope: string,
  pathId: string,
  pathVideoId: string,
  storage: Pick<
    Storage,
    'getItem' | 'setItem' | 'removeItem'
  > | null = browserLocalStorage()
): Set<string> {
  const next = readWatchedCompletedIds(accountScope, pathId, storage);
  next.add(pathVideoId);
  writeWatchedCompletedIds(accountScope, pathId, next, storage);
  return next;
}

export function isPathVideoWatchedCompleted(
  accountScope: string,
  pathId: string,
  pathVideoId: string,
  storage: Pick<Storage, 'getItem'> | null = browserLocalStorage()
): boolean {
  return readWatchedCompletedIds(accountScope, pathId, storage).has(
    pathVideoId
  );
}

/**
 * Whether progress callbacks may write a resume timestamp.
 * After natural end, suppress until replay starts; completed videos never
 * re-store near-end resume (they always reopen at 0).
 */
export function shouldPersistResumeTime(input: {
  playbackEnded: boolean;
  watchedCompleted: boolean;
  time: number;
}): boolean {
  if (input.playbackEnded || input.watchedCompleted) {
    return false;
  }
  return isMeaningfulResumeTime(input.time);
}

export type PlaybackWatchIdentity = {
  youtubeVideoId: string;
  pathId: string | null;
  pathVideoId: string | null;
};

export type WatchStartSeek = {
  /** Explicit player seek seconds; finished lessons are always 0. */
  time: number;
  /** Meaningful resume restore — keep playback paused after seek. */
  restorePaused: boolean;
};

export function buildPlaybackWatchIdentityKey(
  identity: PlaybackWatchIdentity
): string {
  return `${identity.youtubeVideoId}::${identity.pathId ?? ''}::${identity.pathVideoId ?? ''}`;
}

export function playbackWatchIdentitiesEqual(
  a: PlaybackWatchIdentity,
  b: PlaybackWatchIdentity
): boolean {
  return (
    a.youtubeVideoId === b.youtubeVideoId &&
    a.pathId === b.pathId &&
    a.pathVideoId === b.pathVideoId
  );
}

/**
 * Watch-route start seconds: finished lessons always start at 0.
 * Resume-path intent may prefer a matching path cursor; map clicks use
 * per-video resume only when the lesson is unfinished.
 *
 * Returns null for finished or when no meaningful resume exists. Prefer
 * resolveWatchStartSeek when the player may be reused — null must not mean
 * "leave the previous timestamp in place".
 */
export function resolveWatchStartSeconds(input: {
  youtubeVideoId: string;
  pathId: string | null;
  pathVideoId: string | null;
  resumeIntent: boolean;
  watchedCompleted: boolean;
  storage?: Pick<Storage, 'getItem'> | null;
}): number | null {
  if (input.watchedCompleted) {
    return null;
  }

  const storage =
    input.storage === undefined ? browserLocalStorage() : input.storage;

  if (input.resumeIntent && input.pathId && input.pathVideoId) {
    const cursor = readPathResumeCursor(input.pathId, storage);
    if (
      cursor &&
      cursor.pathVideoId === input.pathVideoId &&
      cursor.youtubeVideoId === input.youtubeVideoId &&
      isMeaningfulResumeTime(cursor.time)
    ) {
      return Math.floor(cursor.time);
    }
  }

  return readVideoResumePosition(input.youtubeVideoId, storage);
}

/**
 * Explicit watch-route seek after mount or identity change. Finished lessons
 * and missing resumes both seek to 0 so a reused player cannot keep the
 * previous membership's timestamp (including same YouTube id).
 */
export function resolveWatchStartSeek(input: {
  youtubeVideoId: string;
  pathId: string | null;
  pathVideoId: string | null;
  resumeIntent: boolean;
  watchedCompleted: boolean;
  storage?: Pick<Storage, 'getItem'> | null;
}): WatchStartSeek {
  if (input.watchedCompleted) {
    return { time: 0, restorePaused: false };
  }

  const saved = resolveWatchStartSeconds({
    ...input,
    watchedCompleted: false,
  });
  if (saved === null) {
    return { time: 0, restorePaused: false };
  }
  return { time: saved, restorePaused: true };
}

/** Persist resume for a concrete watch identity (never the "current" route alone). */
export function persistResumeForWatchIdentity(input: {
  identity: PlaybackWatchIdentity;
  time: number;
  playbackEnded: boolean;
  watchedCompleted: boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}): boolean {
  if (
    !shouldPersistResumeTime({
      playbackEnded: input.playbackEnded,
      watchedCompleted: input.watchedCompleted,
      time: input.time,
    })
  ) {
    return false;
  }

  const storage =
    input.storage === undefined ? browserLocalStorage() : input.storage;

  writeVideoResumePosition(input.identity.youtubeVideoId, input.time, storage);
  if (input.identity.pathId && input.identity.pathVideoId) {
    writePathResumeCursor(
      input.identity.pathId,
      {
        pathVideoId: input.identity.pathVideoId,
        youtubeVideoId: input.identity.youtubeVideoId,
        time: input.time,
      },
      storage
    );
  }
  return true;
}

/**
 * Route-change lifecycle: save the leaving unfinished identity, then compute
 * an explicit start seek for the next identity (finished → 0).
 */
export function planWatchIdentityTransition(input: {
  previous: PlaybackWatchIdentity | null;
  previousTime: number;
  previousPlaybackEnded: boolean;
  previousWatchedCompleted: boolean;
  next: PlaybackWatchIdentity;
  nextWatchedCompleted: boolean;
  resumeIntent: boolean;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}): {
  persistedPrevious: boolean;
  startSeek: WatchStartSeek;
} {
  let persistedPrevious = false;
  if (
    input.previous &&
    !playbackWatchIdentitiesEqual(input.previous, input.next)
  ) {
    persistedPrevious = persistResumeForWatchIdentity({
      identity: input.previous,
      time: input.previousTime,
      playbackEnded: input.previousPlaybackEnded,
      watchedCompleted: input.previousWatchedCompleted,
      storage: input.storage,
    });
  }

  return {
    persistedPrevious,
    startSeek: resolveWatchStartSeek({
      youtubeVideoId: input.next.youtubeVideoId,
      pathId: input.next.pathId,
      pathVideoId: input.next.pathVideoId,
      resumeIntent: input.resumeIntent,
      watchedCompleted: input.nextWatchedCompleted,
      storage: input.storage,
    }),
  };
}

/** Drop stale ENDED from a previous membership/player generation. */
export function shouldHandlePlaybackEndedForIdentity(input: {
  eventIdentity: PlaybackWatchIdentity;
  activeIdentity: PlaybackWatchIdentity;
  resumeSeekGuardActive: boolean;
}): boolean {
  if (input.resumeSeekGuardActive) {
    return false;
  }
  return playbackWatchIdentitiesEqual(
    input.eventIdentity,
    input.activeIdentity
  );
}

/** @deprecated Prefer resolveWatchStartSeconds — kept name for resume-intent call sites. */
export const resolveWatchResumeSeekSeconds = resolveWatchStartSeconds;

/** Resume-path navigation href (includes resume intent; map links must not). */
export function buildPathResumeWatchHref(
  youtubeVideoId: string,
  pathId: string,
  pathVideoId: string
): string {
  const params = new URLSearchParams({
    pathId,
    pathVideoId,
    [PATH_RESUME_INTENT_PARAM]: PATH_RESUME_INTENT_VALUE,
  });
  return `/watch/${youtubeVideoId}?${params.toString()}`;
}

/**
 * Explicit lesson selection always opens the requested video — never redirects
 * a completed lesson to the continue/unpracticed target.
 */
export function resolveExplicitWatchSelection(input: {
  requestedPathVideoId: string;
  requestedYoutubeVideoId: string;
  continueTarget: {
    pathVideoId: string;
    youtubeVideoId: string;
  } | null;
}): { pathVideoId: string; youtubeVideoId: string } {
  void input.continueTarget;
  return {
    pathVideoId: input.requestedPathVideoId,
    youtubeVideoId: input.requestedYoutubeVideoId,
  };
}

function findInSequence(
  sequence: readonly PathResumeSequenceItem[],
  pathVideoId: string
): PathResumeSequenceItem | null {
  return sequence.find((item) => item.pathVideoId === pathVideoId) ?? null;
}

/**
 * Pick the single lesson + timestamp Resume should open.
 * Prefer an explicit path cursor, then the furthest unpracticed lesson with a
 * local per-video resume, then the first-unpracticed continue target.
 * Completed (practiced) and missing membership fall through to the next rule.
 * Watched-finished is independent of practiced and does not by itself skip.
 */
export function resolvePathResumeTarget(input: {
  sequence: readonly PathResumeSequenceItem[];
  practicedVideoIds: ReadonlySet<string>;
  pathCursor: PathPlaybackResumeCursor | null;
  /** youtubeVideoId → saved seconds */
  videoResumeSeconds: ReadonlyMap<string, number>;
}): PathResumeTarget | null {
  const { sequence, practicedVideoIds, pathCursor, videoResumeSeconds } = input;
  if (sequence.length === 0) {
    return null;
  }

  if (pathCursor) {
    const cursorItem = findInSequence(sequence, pathCursor.pathVideoId);
    if (
      cursorItem &&
      cursorItem.youtubeVideoId === pathCursor.youtubeVideoId &&
      !practicedVideoIds.has(cursorItem.pathVideoId) &&
      isMeaningfulResumeTime(pathCursor.time)
    ) {
      return {
        pathVideoId: cursorItem.pathVideoId,
        youtubeVideoId: cursorItem.youtubeVideoId,
        time: Math.floor(pathCursor.time),
      };
    }
  }

  let furthestWithResume: PathResumeTarget | null = null;
  for (const item of sequence) {
    if (practicedVideoIds.has(item.pathVideoId)) {
      continue;
    }
    const saved = videoResumeSeconds.get(item.youtubeVideoId);
    if (saved !== undefined && isMeaningfulResumeTime(saved)) {
      furthestWithResume = {
        pathVideoId: item.pathVideoId,
        youtubeVideoId: item.youtubeVideoId,
        time: Math.floor(saved),
      };
    }
  }
  if (furthestWithResume) {
    return furthestWithResume;
  }

  const firstUnpracticed =
    sequence.find((item) => !practicedVideoIds.has(item.pathVideoId)) ||
    sequence[0];
  const saved = videoResumeSeconds.get(firstUnpracticed.youtubeVideoId);
  return {
    pathVideoId: firstUnpracticed.pathVideoId,
    youtubeVideoId: firstUnpracticed.youtubeVideoId,
    time:
      saved !== undefined && isMeaningfulResumeTime(saved)
        ? Math.floor(saved)
        : null,
  };
}

/**
 * After a resume seek, YouTube may emit ENDED immediately when the saved time
 * is at/near the end. That must not auto-advance or mark completion.
 * Natural playback end still advances when this returns true.
 */
export function shouldAutoAdvanceOnEnded(input: {
  autoplayEnabled: boolean;
  hasNext: boolean;
  hasPracticeIntervals: boolean;
  resumeSeekGuardActive: boolean;
}): boolean {
  if (input.resumeSeekGuardActive) {
    return false;
  }
  return input.autoplayEnabled && input.hasNext && !input.hasPracticeIntervals;
}

/** Natural YouTube ENDED may mark watched; seek-guard / stale end must not. */
export function shouldMarkWatchedOnEnded(input: {
  resumeSeekGuardActive: boolean;
  hasPathMembership: boolean;
}): boolean {
  return input.hasPathMembership && !input.resumeSeekGuardActive;
}

/**
 * Deterministic playback session model for tests and shared decision logic.
 * Interval loop/seek ends never call applyNaturalVideoEnded.
 */
export type PathPlaybackSession = {
  watchedCompletedIds: Set<string>;
  resumeSecondsByYoutubeId: Map<string, number>;
  pathCursor: PathPlaybackResumeCursor | null;
  playbackEnded: boolean;
  resumeSeekGuardActive: boolean;
};

export function createPathPlaybackSession(
  initial?: Partial<{
    watchedCompletedIds: Iterable<string>;
    resumeSecondsByYoutubeId: Iterable<[string, number]>;
    pathCursor: PathPlaybackResumeCursor | null;
  }>
): PathPlaybackSession {
  return {
    watchedCompletedIds: new Set(initial?.watchedCompletedIds ?? []),
    resumeSecondsByYoutubeId: new Map(initial?.resumeSecondsByYoutubeId ?? []),
    pathCursor: initial?.pathCursor ?? null,
    playbackEnded: false,
    resumeSeekGuardActive: false,
  };
}

export function applyNaturalVideoEnded(
  session: PathPlaybackSession,
  input: {
    pathVideoId: string;
    youtubeVideoId: string;
    autoplayEnabled: boolean;
    hasNext: boolean;
    hasPracticeIntervals: boolean;
  }
): { advanced: boolean; markedWatched: boolean } {
  if (session.resumeSeekGuardActive) {
    return { advanced: false, markedWatched: false };
  }

  session.watchedCompletedIds.add(input.pathVideoId);
  session.resumeSecondsByYoutubeId.delete(input.youtubeVideoId);
  session.pathCursor = null;
  session.playbackEnded = true;

  const advanced = shouldAutoAdvanceOnEnded({
    autoplayEnabled: input.autoplayEnabled,
    hasNext: input.hasNext,
    hasPracticeIntervals: input.hasPracticeIntervals,
    resumeSeekGuardActive: false,
  });

  return { advanced, markedWatched: true };
}

export function applyReplayStarted(session: PathPlaybackSession): void {
  session.playbackEnded = false;
  session.resumeSeekGuardActive = false;
}

export function applyProgressTick(
  session: PathPlaybackSession,
  input: {
    pathVideoId: string;
    youtubeVideoId: string;
    time: number;
  }
): boolean {
  const watchedCompleted = session.watchedCompletedIds.has(input.pathVideoId);
  if (
    !shouldPersistResumeTime({
      playbackEnded: session.playbackEnded,
      watchedCompleted,
      time: input.time,
    })
  ) {
    return false;
  }
  session.resumeSecondsByYoutubeId.set(
    input.youtubeVideoId,
    Math.floor(input.time)
  );
  session.pathCursor = {
    pathVideoId: input.pathVideoId,
    youtubeVideoId: input.youtubeVideoId,
    time: Math.floor(input.time),
  };
  return true;
}

export function resolveSessionStartSeconds(
  session: PathPlaybackSession,
  input: {
    pathVideoId: string;
    youtubeVideoId: string;
  }
): number | null {
  if (session.watchedCompletedIds.has(input.pathVideoId)) {
    return null;
  }
  const saved = session.resumeSecondsByYoutubeId.get(input.youtubeVideoId);
  if (saved !== undefined && isMeaningfulResumeTime(saved)) {
    return Math.floor(saved);
  }
  return null;
}

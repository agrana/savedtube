import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPathWatchHref } from './path-links.ts';
import {
  applyNaturalVideoEnded,
  applyProgressTick,
  applyReplayStarted,
  browserLocalStorage,
  buildPathResumeWatchHref,
  buildPlaybackWatchIdentityKey,
  clearVideoResumePosition,
  createPathPlaybackSession,
  isPathResumeIntent,
  isPathVideoWatchedCompleted,
  markPathVideoWatchedCompleted,
  PATH_RESUME_INTENT_PARAM,
  PATH_RESUME_INTENT_VALUE,
  persistResumeForWatchIdentity,
  planWatchIdentityTransition,
  readPathResumeCursor,
  readVideoResumePosition,
  readWatchedCompletedIds,
  resolveExplicitWatchSelection,
  resolvePathResumeTarget,
  resolveSessionStartSeconds,
  resolveWatchStartSeconds,
  resolveWatchStartSeek,
  shouldAutoAdvanceOnEnded,
  shouldHandlePlaybackEndedForIdentity,
  shouldMarkWatchedOnEnded,
  shouldPersistResumeTime,
  writePathResumeCursor,
  writeVideoResumePosition,
  type PathResumeSequenceItem,
} from './path-playback-resume.ts';

const SEQUENCE: PathResumeSequenceItem[] = [
  { pathVideoId: 'pv-1', youtubeVideoId: 'yt-1' },
  { pathVideoId: 'pv-2', youtubeVideoId: 'yt-2' },
  { pathVideoId: 'pv-3', youtubeVideoId: 'yt-3' },
  { pathVideoId: 'pv-4', youtubeVideoId: 'yt-4' },
  { pathVideoId: 'pv-5', youtubeVideoId: 'yt-5' },
];

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
  };
}

describe('natural end marks watched completion', () => {
  it('marks completion, clears resume timestamp, and may auto-advance', () => {
    const session = createPathPlaybackSession({
      resumeSecondsByYoutubeId: [['yt-1', 590]],
      pathCursor: {
        pathVideoId: 'pv-1',
        youtubeVideoId: 'yt-1',
        time: 590,
      },
    });

    const result = applyNaturalVideoEnded(session, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      autoplayEnabled: true,
      hasNext: true,
      hasPracticeIntervals: false,
    });

    assert.equal(result.markedWatched, true);
    assert.equal(result.advanced, true);
    assert.equal(session.watchedCompletedIds.has('pv-1'), true);
    assert.equal(session.resumeSecondsByYoutubeId.has('yt-1'), false);
    assert.equal(session.pathCursor, null);
    assert.equal(session.playbackEnded, true);
  });

  it('does not mark or advance on stale end under the resume-seek guard', () => {
    const session = createPathPlaybackSession({
      resumeSecondsByYoutubeId: [['yt-1', 595]],
    });
    session.resumeSeekGuardActive = true;

    const result = applyNaturalVideoEnded(session, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      autoplayEnabled: true,
      hasNext: true,
      hasPracticeIntervals: false,
    });

    assert.equal(result.markedWatched, false);
    assert.equal(result.advanced, false);
    assert.equal(session.watchedCompletedIds.has('pv-1'), false);
    assert.equal(session.resumeSecondsByYoutubeId.get('yt-1'), 595);
  });

  it('keeps interval loop end from counting as full-video finish', () => {
    // Interval ends seek/loop inside the player and never call applyNaturalVideoEnded.
    const session = createPathPlaybackSession();
    applyProgressTick(session, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      time: 42,
    });
    assert.equal(session.watchedCompletedIds.has('pv-1'), false);
    assert.equal(
      shouldMarkWatchedOnEnded({
        resumeSeekGuardActive: false,
        hasPathMembership: true,
      }),
      true
    );
  });
});

describe('replay starts at zero and ignores stale end', () => {
  it('starts finished videos at 0 and keeps completion across replay', () => {
    const session = createPathPlaybackSession();
    applyNaturalVideoEnded(session, {
      pathVideoId: 'pv-2',
      youtubeVideoId: 'yt-2',
      autoplayEnabled: false,
      hasNext: true,
      hasPracticeIntervals: false,
    });

    assert.equal(
      resolveSessionStartSeconds(session, {
        pathVideoId: 'pv-2',
        youtubeVideoId: 'yt-2',
      }),
      null
    );

    applyReplayStarted(session);
    assert.equal(session.watchedCompletedIds.has('pv-2'), true);
    assert.equal(session.playbackEnded, false);

    // Progress after end must not recreate a near-end resume for completed.
    assert.equal(
      applyProgressTick(session, {
        pathVideoId: 'pv-2',
        youtubeVideoId: 'yt-2',
        time: 598,
      }),
      false
    );
    assert.equal(session.resumeSecondsByYoutubeId.has('yt-2'), false);
    assert.equal(
      resolveSessionStartSeconds(session, {
        pathVideoId: 'pv-2',
        youtubeVideoId: 'yt-2',
      }),
      null
    );
  });

  it('allows advance only on a second natural end after replay', () => {
    const session = createPathPlaybackSession();
    applyNaturalVideoEnded(session, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      autoplayEnabled: true,
      hasNext: true,
      hasPracticeIntervals: false,
    });
    applyReplayStarted(session);
    session.resumeSeekGuardActive = true;
    const stale = applyNaturalVideoEnded(session, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      autoplayEnabled: true,
      hasNext: true,
      hasPracticeIntervals: false,
    });
    assert.equal(stale.advanced, false);

    session.resumeSeekGuardActive = false;
    const natural = applyNaturalVideoEnded(session, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      autoplayEnabled: true,
      hasNext: true,
      hasPracticeIntervals: false,
    });
    assert.equal(natural.advanced, true);
    assert.equal(natural.markedWatched, true);
  });
});

describe('unfinished resumes last saved position', () => {
  it('returns saved seconds for unfinished lessons and null when finished', () => {
    const storage = memoryStorage();
    writeVideoResumePosition('yt-3', 88, storage);
    markPathVideoWatchedCompleted('user-a', 'path-1', 'pv-4', storage);
    writeVideoResumePosition('yt-4', 400, storage);

    assert.equal(
      resolveWatchStartSeconds({
        youtubeVideoId: 'yt-3',
        pathId: 'path-1',
        pathVideoId: 'pv-3',
        resumeIntent: false,
        watchedCompleted: false,
        storage,
      }),
      88
    );

    assert.equal(
      resolveWatchStartSeconds({
        youtubeVideoId: 'yt-4',
        pathId: 'path-1',
        pathVideoId: 'pv-4',
        resumeIntent: false,
        watchedCompleted: true,
        storage,
      }),
      null
    );
  });

  it('suppresses resume writes after natural end until replay', () => {
    assert.equal(
      shouldPersistResumeTime({
        playbackEnded: true,
        watchedCompleted: false,
        time: 40,
      }),
      false
    );
    assert.equal(
      shouldPersistResumeTime({
        playbackEnded: false,
        watchedCompleted: true,
        time: 40,
      }),
      false
    );
    assert.equal(
      shouldPersistResumeTime({
        playbackEnded: false,
        watchedCompleted: false,
        time: 40,
      }),
      true
    );
  });
});

describe('explicit selection vs continue target', () => {
  it('honors the requested video even when continue points elsewhere', () => {
    const selected = resolveExplicitWatchSelection({
      requestedPathVideoId: 'pv-1',
      requestedYoutubeVideoId: 'yt-1',
      continueTarget: {
        pathVideoId: 'pv-4',
        youtubeVideoId: 'yt-4',
      },
    });
    assert.deepEqual(selected, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
    });

    const mapHref = buildPathWatchHref('yt-1', 'path-1', 'pv-1');
    assert.equal(mapHref, '/watch/yt-1?pathId=path-1&pathVideoId=pv-1');
    assert.doesNotMatch(mapHref, /resume=/);

    const resumeHref = buildPathResumeWatchHref('yt-4', 'path-1', 'pv-4');
    assert.match(
      resumeHref,
      new RegExp(`${PATH_RESUME_INTENT_PARAM}=${PATH_RESUME_INTENT_VALUE}`)
    );
  });
});

describe('per-video state reset', () => {
  it('clears only the ended video resume while keeping siblings', () => {
    const storage = memoryStorage();
    writeVideoResumePosition('yt-1', 50, storage);
    writeVideoResumePosition('yt-2', 60, storage);
    writePathResumeCursor(
      'path-1',
      { pathVideoId: 'pv-1', youtubeVideoId: 'yt-1', time: 50 },
      storage
    );

    clearVideoResumePosition('yt-1', storage);
    assert.equal(readVideoResumePosition('yt-1', storage), null);
    assert.equal(readVideoResumePosition('yt-2', storage), 60);

    const session = createPathPlaybackSession({
      resumeSecondsByYoutubeId: [
        ['yt-1', 50],
        ['yt-2', 60],
      ],
    });
    applyNaturalVideoEnded(session, {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      autoplayEnabled: false,
      hasNext: false,
      hasPracticeIntervals: false,
    });
    assert.equal(session.resumeSecondsByYoutubeId.has('yt-1'), false);
    assert.equal(session.resumeSecondsByYoutubeId.get('yt-2'), 60);
  });

  it('scopes watched completion per account and path', () => {
    const storage = memoryStorage();
    markPathVideoWatchedCompleted('user-a', 'path-1', 'pv-1', storage);
    assert.equal(
      isPathVideoWatchedCompleted('user-a', 'path-1', 'pv-1', storage),
      true
    );
    assert.equal(
      isPathVideoWatchedCompleted('user-b', 'path-1', 'pv-1', storage),
      false
    );
    assert.equal(
      isPathVideoWatchedCompleted('user-a', 'path-2', 'pv-1', storage),
      false
    );
    assert.deepEqual(
      [...readWatchedCompletedIds('user-a', 'path-1', storage)],
      ['pv-1']
    );
  });
});

describe('path resume target resolution', () => {
  it('resolves the furthest unfinished lesson with local resume', () => {
    const target = resolvePathResumeTarget({
      sequence: SEQUENCE,
      practicedVideoIds: new Set(),
      pathCursor: null,
      videoResumeSeconds: new Map([
        ['yt-1', 590],
        ['yt-5', 142],
      ]),
    });
    assert.deepEqual(target, {
      pathVideoId: 'pv-5',
      youtubeVideoId: 'yt-5',
      time: 142,
    });
  });

  it('prefers an explicit path cursor over earlier per-video resumes', () => {
    const target = resolvePathResumeTarget({
      sequence: SEQUENCE,
      practicedVideoIds: new Set(),
      pathCursor: {
        pathVideoId: 'pv-3',
        youtubeVideoId: 'yt-3',
        time: 88,
      },
      videoResumeSeconds: new Map([
        ['yt-1', 590],
        ['yt-5', 200],
      ]),
    });
    assert.deepEqual(target, {
      pathVideoId: 'pv-3',
      youtubeVideoId: 'yt-3',
      time: 88,
    });
  });

  it('does not auto-advance when ENDED fires under the resume-seek guard', () => {
    assert.equal(
      shouldAutoAdvanceOnEnded({
        autoplayEnabled: true,
        hasNext: true,
        hasPracticeIntervals: false,
        resumeSeekGuardActive: true,
      }),
      false
    );
    assert.equal(
      shouldAutoAdvanceOnEnded({
        autoplayEnabled: true,
        hasNext: true,
        hasPracticeIntervals: true,
        resumeSeekGuardActive: false,
      }),
      false
    );
  });
});

describe('watch-route start resolution', () => {
  it('uses matching path cursor time when resume intent is present', () => {
    const storage = memoryStorage();
    writePathResumeCursor(
      'path-1',
      { pathVideoId: 'pv-3', youtubeVideoId: 'yt-3', time: 88 },
      storage
    );
    writeVideoResumePosition('yt-3', 12, storage);

    assert.equal(
      resolveWatchStartSeconds({
        youtubeVideoId: 'yt-3',
        pathId: 'path-1',
        pathVideoId: 'pv-3',
        resumeIntent: true,
        watchedCompleted: false,
        storage,
      }),
      88
    );
  });

  it('ignores path cursor for intentional map clicks (no resume intent)', () => {
    const storage = memoryStorage();
    writePathResumeCursor(
      'path-1',
      { pathVideoId: 'pv-3', youtubeVideoId: 'yt-3', time: 88 },
      storage
    );
    writeVideoResumePosition('yt-3', 12, storage);

    assert.equal(
      resolveWatchStartSeconds({
        youtubeVideoId: 'yt-3',
        pathId: 'path-1',
        pathVideoId: 'pv-3',
        resumeIntent: false,
        watchedCompleted: false,
        storage,
      }),
      12
    );
  });

  it('recognizes only the explicit resume intent value', () => {
    assert.equal(isPathResumeIntent('1'), true);
    assert.equal(isPathResumeIntent(PATH_RESUME_INTENT_VALUE), true);
    assert.equal(isPathResumeIntent('true'), false);
    assert.equal(isPathResumeIntent(null), false);
  });
});

describe('watch identity lifecycle (production helpers)', () => {
  it('persists unfinished leave to the previous identity only', () => {
    const storage = memoryStorage();
    const previous = {
      youtubeVideoId: 'yt-1',
      pathId: 'path-1',
      pathVideoId: 'pv-1',
    };
    const next = {
      youtubeVideoId: 'yt-2',
      pathId: 'path-1',
      pathVideoId: 'pv-2',
    };

    const transition = planWatchIdentityTransition({
      previous,
      previousTime: 142,
      previousPlaybackEnded: false,
      previousWatchedCompleted: false,
      next,
      nextWatchedCompleted: false,
      resumeIntent: false,
      storage,
    });

    assert.equal(transition.persistedPrevious, true);
    assert.equal(readVideoResumePosition('yt-1', storage), 142);
    assert.equal(readVideoResumePosition('yt-2', storage), null);
    assert.deepEqual(readPathResumeCursor('path-1', storage), {
      pathVideoId: 'pv-1',
      youtubeVideoId: 'yt-1',
      time: 142,
    });
    assert.deepEqual(transition.startSeek, {
      time: 0,
      restorePaused: false,
    });
  });

  it('does not let previous cleanup time become the next video resume', () => {
    const storage = memoryStorage();
    writeVideoResumePosition('yt-next', 12, storage);

    // Simulate a buggy cleanup that would write the leaving time onto the next
    // identity — production persist is identity-tagged, so next stays at 12.
    persistResumeForWatchIdentity({
      identity: {
        youtubeVideoId: 'yt-prev',
        pathId: 'path-1',
        pathVideoId: 'pv-prev',
      },
      time: 500,
      playbackEnded: false,
      watchedCompleted: false,
      storage,
    });

    assert.equal(readVideoResumePosition('yt-prev', storage), 500);
    assert.equal(readVideoResumePosition('yt-next', storage), 12);
  });

  it('starts finished lessons at explicit zero including same YouTube id', () => {
    const storage = memoryStorage();
    writeVideoResumePosition('yt-shared', 240, storage);
    markPathVideoWatchedCompleted('user-a', 'path-1', 'pv-b', storage);

    const transition = planWatchIdentityTransition({
      previous: {
        youtubeVideoId: 'yt-shared',
        pathId: 'path-1',
        pathVideoId: 'pv-a',
      },
      previousTime: 240,
      previousPlaybackEnded: false,
      previousWatchedCompleted: false,
      next: {
        youtubeVideoId: 'yt-shared',
        pathId: 'path-1',
        pathVideoId: 'pv-b',
      },
      nextWatchedCompleted: true,
      resumeIntent: false,
      storage,
    });

    assert.notEqual(
      buildPlaybackWatchIdentityKey({
        youtubeVideoId: 'yt-shared',
        pathId: 'path-1',
        pathVideoId: 'pv-a',
      }),
      buildPlaybackWatchIdentityKey({
        youtubeVideoId: 'yt-shared',
        pathId: 'path-1',
        pathVideoId: 'pv-b',
      })
    );
    assert.deepEqual(transition.startSeek, {
      time: 0,
      restorePaused: false,
    });
    assert.equal(
      resolveWatchStartSeek({
        youtubeVideoId: 'yt-shared',
        pathId: 'path-1',
        pathVideoId: 'pv-b',
        resumeIntent: false,
        watchedCompleted: true,
        storage,
      }).time,
      0
    );
    // null start-seconds must not be treated as "keep prior player time".
    assert.equal(
      resolveWatchStartSeconds({
        youtubeVideoId: 'yt-shared',
        pathId: 'path-1',
        pathVideoId: 'pv-b',
        resumeIntent: false,
        watchedCompleted: true,
        storage,
      }),
      null
    );
  });

  it('does not persist leave after natural end or for finished lessons', () => {
    const storage = memoryStorage();
    const ended = planWatchIdentityTransition({
      previous: {
        youtubeVideoId: 'yt-1',
        pathId: 'path-1',
        pathVideoId: 'pv-1',
      },
      previousTime: 590,
      previousPlaybackEnded: true,
      previousWatchedCompleted: false,
      next: {
        youtubeVideoId: 'yt-2',
        pathId: 'path-1',
        pathVideoId: 'pv-2',
      },
      nextWatchedCompleted: false,
      resumeIntent: false,
      storage,
    });
    assert.equal(ended.persistedPrevious, false);
    assert.equal(readVideoResumePosition('yt-1', storage), null);

    const finished = planWatchIdentityTransition({
      previous: {
        youtubeVideoId: 'yt-3',
        pathId: 'path-1',
        pathVideoId: 'pv-3',
      },
      previousTime: 40,
      previousPlaybackEnded: false,
      previousWatchedCompleted: true,
      next: {
        youtubeVideoId: 'yt-4',
        pathId: 'path-1',
        pathVideoId: 'pv-4',
      },
      nextWatchedCompleted: false,
      resumeIntent: false,
      storage,
    });
    assert.equal(finished.persistedPrevious, false);
  });

  it('ignores stale ENDED from a previous membership', () => {
    assert.equal(
      shouldHandlePlaybackEndedForIdentity({
        eventIdentity: {
          youtubeVideoId: 'yt-1',
          pathId: 'path-1',
          pathVideoId: 'pv-1',
        },
        activeIdentity: {
          youtubeVideoId: 'yt-1',
          pathId: 'path-1',
          pathVideoId: 'pv-2',
        },
        resumeSeekGuardActive: false,
      }),
      false
    );
    assert.equal(
      shouldHandlePlaybackEndedForIdentity({
        eventIdentity: {
          youtubeVideoId: 'yt-2',
          pathId: 'path-1',
          pathVideoId: 'pv-2',
        },
        activeIdentity: {
          youtubeVideoId: 'yt-2',
          pathId: 'path-1',
          pathVideoId: 'pv-2',
        },
        resumeSeekGuardActive: false,
      }),
      true
    );
  });

  it('restores unfinished resume with restorePaused via production seek helper', () => {
    const storage = memoryStorage();
    writeVideoResumePosition('yt-3', 88, storage);
    assert.deepEqual(
      resolveWatchStartSeek({
        youtubeVideoId: 'yt-3',
        pathId: 'path-1',
        pathVideoId: 'pv-3',
        resumeIntent: false,
        watchedCompleted: false,
        storage,
      }),
      { time: 88, restorePaused: true }
    );
  });
});

describe('localStorage hardening', () => {
  it('returns null when the localStorage property getter throws', () => {
    const hadWindow = Object.prototype.hasOwnProperty.call(
      globalThis,
      'window'
    );
    const previousWindow = (globalThis as { window?: unknown }).window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        get localStorage() {
          throw new Error('SecurityError');
        },
      },
    });
    try {
      assert.equal(browserLocalStorage(), null);
    } finally {
      if (hadWindow) {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: previousWindow,
        });
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('swallows getItem / setItem / removeItem exceptions', () => {
    const throwingStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
      {
        getItem() {
          throw new Error('SecurityError');
        },
        setItem() {
          throw new Error('QuotaExceededError');
        },
        removeItem() {
          throw new Error('SecurityError');
        },
      };

    assert.equal(readVideoResumePosition('yt-x', throwingStorage), null);
    assert.doesNotThrow(() =>
      writeVideoResumePosition('yt-x', 40, throwingStorage)
    );
    assert.doesNotThrow(() =>
      clearVideoResumePosition('yt-x', throwingStorage)
    );
    assert.equal(readPathResumeCursor('path-x', throwingStorage), null);
    assert.deepEqual(
      [...readWatchedCompletedIds('anon', 'path-x', throwingStorage)],
      []
    );
    assert.doesNotThrow(() =>
      markPathVideoWatchedCompleted('anon', 'path-x', 'pv', throwingStorage)
    );
  });
});

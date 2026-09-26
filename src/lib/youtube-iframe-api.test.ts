import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  YOUTUBE_IFRAME_API_SRC,
  findExistingYouTubeIframeApiScript,
  getYouTubeIframeApiStatus,
  isYouTubeIframeApiReady,
  loadYouTubeIframeApi,
  resetYouTubeIframeApiLoaderForTests,
  resolveYouTubeIframeApiScriptParent,
  setYouTubeIframeApiEnvironmentForTests,
  type YouTubeIframeApiDocument,
  type YouTubeIframeApiEnvironment,
  type YouTubeIframeApiParentNode,
  type YouTubeIframeApiScriptElement,
  type YouTubeIframeApiWindow,
} from './youtube-iframe-api.ts';

type FakeScript = YouTubeIframeApiScriptElement & {
  parentNode: YouTubeIframeApiParentNode | null;
};

function createFakeEnvironment(options?: {
  yt?: YouTubeIframeApiWindow['YT'];
  existingScript?: boolean;
  scripts?: FakeScript[];
  head?: YouTubeIframeApiParentNode | null;
  documentElement?: YouTubeIframeApiParentNode | null;
}): {
  env: YouTubeIframeApiEnvironment;
  win: YouTubeIframeApiWindow;
  inserted: FakeScript[];
  timers: Array<{ id: number; handler: () => void; ms: number }>;
  runTimer: (index?: number) => void;
} {
  const inserted: FakeScript[] = [];
  const timers: Array<{ id: number; handler: () => void; ms: number }> = [];
  let nextTimerId = 1;

  const parent: YouTubeIframeApiParentNode = {
    insertBefore(newNode, referenceNode) {
      const script = newNode as FakeScript;
      script.parentNode = parent;
      inserted.push(script);
      if (referenceNode) {
        // Keep ordering metadata only; tests assert insert happened.
      }
      return script;
    },
    appendChild(newNode) {
      const script = newNode as FakeScript;
      script.parentNode = parent;
      inserted.push(script);
      return script;
    },
  };

  const scripts: FakeScript[] = options?.scripts
    ? [...options.scripts]
    : options?.existingScript
      ? [
          {
            src: YOUTUBE_IFRAME_API_SRC,
            async: true,
            onerror: null,
            parentNode: parent,
          },
        ]
      : [];

  const win: YouTubeIframeApiWindow = {
    YT: options?.yt,
    onYouTubeIframeAPIReady: undefined,
  };

  const doc: YouTubeIframeApiDocument = {
    createElement(tagName) {
      assert.equal(tagName, 'script');
      return {
        src: '',
        async: false,
        onerror: null,
        parentNode: null,
      } as FakeScript;
    },
    getElementsByTagName() {
      return scripts;
    },
    querySelector(selectors) {
      if (selectors === `script[src="${YOUTUBE_IFRAME_API_SRC}"]`) {
        return (
          scripts.find((script) => script.src === YOUTUBE_IFRAME_API_SRC) ??
          inserted.find((script) => script.src === YOUTUBE_IFRAME_API_SRC) ??
          null
        );
      }
      return null;
    },
    head: options?.head === undefined ? parent : options.head,
    documentElement:
      options?.documentElement === undefined ? parent : options.documentElement,
  };

  const env: YouTubeIframeApiEnvironment = {
    getWindow: () => win,
    getDocument: () => doc,
    setTimeout: (handler, ms) => {
      const id = nextTimerId++;
      timers.push({ id, handler, ms });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timeoutId) => {
      const id = timeoutId as unknown as number;
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) {
        timers.splice(index, 1);
      }
    },
  };

  return {
    env,
    win,
    inserted,
    timers,
    runTimer: (index = 0) => {
      const timer = timers[index];
      assert.ok(timer, 'expected a pending timer');
      timers.splice(index, 1);
      timer.handler();
    },
  };
}

describe('isYouTubeIframeApiReady', () => {
  it('requires YT.Player to be a constructor function', () => {
    assert.equal(isYouTubeIframeApiReady(undefined), false);
    assert.equal(isYouTubeIframeApiReady({}), false);
    assert.equal(isYouTubeIframeApiReady({ Player: {} }), false);
    assert.equal(
      isYouTubeIframeApiReady({ Player: function Player() {} }),
      true
    );
  });
});

describe('resolveYouTubeIframeApiScriptParent', () => {
  it('uses the first script parent when present', () => {
    const parent = {
      insertBefore(newNode: YouTubeIframeApiScriptElement) {
        return newNode;
      },
      appendChild(newNode: YouTubeIframeApiScriptElement) {
        return newNode;
      },
    };
    const first: FakeScript = {
      src: '/app.js',
      async: false,
      onerror: null,
      parentNode: parent,
    };
    const doc: YouTubeIframeApiDocument = {
      createElement: () => first,
      getElementsByTagName: () => [first],
      querySelector: () => null,
      head: null,
      documentElement: null,
    };
    const resolved = resolveYouTubeIframeApiScriptParent(doc);
    assert.deepEqual(resolved, { parent, before: first });
  });

  it('falls back to head when no script tags exist', () => {
    const head = {
      insertBefore(newNode: YouTubeIframeApiScriptElement) {
        return newNode;
      },
      appendChild(newNode: YouTubeIframeApiScriptElement) {
        return newNode;
      },
    };
    const doc: YouTubeIframeApiDocument = {
      createElement: () => ({
        src: '',
        async: false,
        onerror: null,
      }),
      getElementsByTagName: () => [],
      querySelector: () => null,
      head,
      documentElement: null,
    };
    const resolved = resolveYouTubeIframeApiScriptParent(doc);
    assert.deepEqual(resolved, { parent: head, before: null });
  });

  it('returns null when no insertion parent is available', () => {
    const doc: YouTubeIframeApiDocument = {
      createElement: () => ({
        src: '',
        async: false,
        onerror: null,
      }),
      getElementsByTagName: () => [],
      querySelector: () => null,
      head: null,
      documentElement: null,
    };
    assert.equal(resolveYouTubeIframeApiScriptParent(doc), null);
  });
});

describe('findExistingYouTubeIframeApiScript', () => {
  it('detects an already-present iframe_api script', () => {
    const script: YouTubeIframeApiScriptElement = {
      src: YOUTUBE_IFRAME_API_SRC,
      async: true,
      onerror: null,
    };
    const doc = {
      querySelector(selectors: string) {
        return selectors === `script[src="${YOUTUBE_IFRAME_API_SRC}"]`
          ? script
          : null;
      },
    };
    assert.equal(findExistingYouTubeIframeApiScript(doc), script);
  });
});

describe('loadYouTubeIframeApi', () => {
  beforeEach(() => {
    resetYouTubeIframeApiLoaderForTests();
  });

  afterEach(() => {
    resetYouTubeIframeApiLoaderForTests();
  });

  it('resolves immediately when window.YT.Player is already available', async () => {
    const { env } = createFakeEnvironment({
      yt: { Player: function Player() {} },
    });
    setYouTubeIframeApiEnvironmentForTests(env);

    await loadYouTubeIframeApi();
    assert.equal(getYouTubeIframeApiStatus(), 'ready');
  });

  it('does not treat a YT stub without Player as ready', async () => {
    const { env, win, inserted } = createFakeEnvironment({
      yt: {},
    });
    setYouTubeIframeApiEnvironmentForTests(env);

    const pending = loadYouTubeIframeApi({ timeoutMs: 1_000 });
    assert.equal(getYouTubeIframeApiStatus(), 'loading');
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]?.src, YOUTUBE_IFRAME_API_SRC);

    win.YT = { Player: function Player() {} };
    win.onYouTubeIframeAPIReady?.();
    await pending;
    assert.equal(getYouTubeIframeApiStatus(), 'ready');
  });

  it('reuses an in-flight script and preserves prior ready callbacks', async () => {
    const { env, win, inserted } = createFakeEnvironment();
    let priorCalls = 0;
    win.onYouTubeIframeAPIReady = () => {
      priorCalls += 1;
    };
    setYouTubeIframeApiEnvironmentForTests(env);

    const first = loadYouTubeIframeApi({ timeoutMs: 5_000 });
    const second = loadYouTubeIframeApi({ timeoutMs: 5_000 });
    assert.equal(inserted.length, 1);
    assert.equal(first, second);

    win.YT = { Player: function Player() {} };
    win.onYouTubeIframeAPIReady?.();
    await Promise.all([first, second]);
    assert.equal(priorCalls, 1);
    assert.equal(getYouTubeIframeApiStatus(), 'ready');
  });

  it('does not inject a duplicate script when iframe_api is already loading', async () => {
    const { env, win, inserted } = createFakeEnvironment({
      existingScript: true,
    });
    setYouTubeIframeApiEnvironmentForTests(env);

    const pending = loadYouTubeIframeApi({ timeoutMs: 5_000 });
    assert.equal(inserted.length, 0);

    win.YT = { Player: function Player() {} };
    win.onYouTubeIframeAPIReady?.();
    await pending;
    assert.equal(getYouTubeIframeApiStatus(), 'ready');
  });

  it('appends to head when no script elements exist', async () => {
    const appendLog: string[] = [];
    const head: YouTubeIframeApiParentNode = {
      insertBefore(newNode) {
        appendLog.push('insertBefore');
        return newNode;
      },
      appendChild(newNode) {
        appendLog.push('appendChild');
        (newNode as FakeScript).parentNode = head;
        return newNode;
      },
    };
    const { env, win } = createFakeEnvironment({
      scripts: [],
      head,
      documentElement: null,
    });
    setYouTubeIframeApiEnvironmentForTests(env);

    const pending = loadYouTubeIframeApi({ timeoutMs: 5_000 });
    assert.deepEqual(appendLog, ['appendChild']);

    win.YT = { Player: function Player() {} };
    win.onYouTubeIframeAPIReady?.();
    await pending;
  });

  it('rejects on timeout with a user-visible message and leaves loading state', async () => {
    const { env, runTimer, timers } = createFakeEnvironment();
    setYouTubeIframeApiEnvironmentForTests(env);

    const pending = loadYouTubeIframeApi({ timeoutMs: 250 });
    assert.equal(timers.length, 1);
    runTimer(0);

    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /timed out/i);
      return true;
    });
    assert.equal(getYouTubeIframeApiStatus(), 'error');
  });

  it('rejects on script onerror without throwing unhandled exceptions', async () => {
    const { env, inserted } = createFakeEnvironment();
    setYouTubeIframeApiEnvironmentForTests(env);

    const pending = loadYouTubeIframeApi({ timeoutMs: 5_000 });
    assert.equal(inserted.length, 1);
    inserted[0]?.onerror?.(new Event('error'));

    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Unable to load YouTube player/i);
      return true;
    });
    assert.equal(getYouTubeIframeApiStatus(), 'error');
  });

  it('notifies multiple mounts through one shared promise', async () => {
    const { env, win } = createFakeEnvironment();
    setYouTubeIframeApiEnvironmentForTests(env);

    const a = loadYouTubeIframeApi({ timeoutMs: 5_000 });
    const b = loadYouTubeIframeApi({ timeoutMs: 5_000 });
    const c = loadYouTubeIframeApi({ timeoutMs: 5_000 });

    win.YT = { Player: function Player() {} };
    win.onYouTubeIframeAPIReady?.();
    await Promise.all([a, b, c]);
    assert.equal(getYouTubeIframeApiStatus(), 'ready');
  });
});

/**
 * Shared YouTube IFrame API loader.
 *
 * Multiple YouTubePlayer mounts must share one script tag and one ready
 * signal. Overwriting window.onYouTubeIframeAPIReady or re-injecting
 * iframe_api leaves later mounts stuck on "Loading video...".
 */

export const YOUTUBE_IFRAME_API_SRC = 'https://www.youtube.com/iframe_api';
export const YOUTUBE_IFRAME_API_TIMEOUT_MS = 15_000;

export type YouTubeIframeApiStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface YouTubeIframeApiYt {
  Player?: unknown;
}

export interface YouTubeIframeApiWindow {
  YT?: YouTubeIframeApiYt;
  onYouTubeIframeAPIReady?: (() => void) | undefined;
}

export interface YouTubeIframeApiScriptElement {
  src: string;
  async: boolean;
  onerror: ((event: unknown) => void) | null;
}

export interface YouTubeIframeApiParentNode {
  insertBefore(
    newNode: YouTubeIframeApiScriptElement,
    referenceNode: YouTubeIframeApiScriptElement | null
  ): YouTubeIframeApiScriptElement;
  appendChild(
    newNode: YouTubeIframeApiScriptElement
  ): YouTubeIframeApiScriptElement;
}

export interface YouTubeIframeApiDocument {
  createElement(tagName: 'script'): YouTubeIframeApiScriptElement;
  getElementsByTagName(
    qualifiedName: 'script'
  ): ArrayLike<
    YouTubeIframeApiScriptElement & {
      parentNode: YouTubeIframeApiParentNode | null;
    }
  >;
  querySelector(selectors: string): YouTubeIframeApiScriptElement | null;
  head: YouTubeIframeApiParentNode | null;
  documentElement: YouTubeIframeApiParentNode | null;
}

export interface YouTubeIframeApiEnvironment {
  getWindow: () => YouTubeIframeApiWindow;
  getDocument: () => YouTubeIframeApiDocument;
  setTimeout: (
    handler: () => void,
    timeoutMs: number
  ) => ReturnType<typeof setTimeout>;
  clearTimeout: (timeoutId: ReturnType<typeof setTimeout>) => void;
}

export function isYouTubeIframeApiReady(
  yt: YouTubeIframeApiYt | null | undefined
): boolean {
  return typeof yt?.Player === 'function';
}

export function findExistingYouTubeIframeApiScript(
  doc: Pick<YouTubeIframeApiDocument, 'querySelector'>
): YouTubeIframeApiScriptElement | null {
  return doc.querySelector(`script[src="${YOUTUBE_IFRAME_API_SRC}"]`);
}

/**
 * Prefer YouTube's recommended insert-before-first-script placement.
 * Fall back to head / documentElement when no script tags exist yet
 * (common in Next.js client islands before hydration scripts settle).
 */
export function resolveYouTubeIframeApiScriptParent(
  doc: YouTubeIframeApiDocument
): {
  parent: YouTubeIframeApiParentNode;
  before: YouTubeIframeApiScriptElement | null;
} | null {
  const scripts = doc.getElementsByTagName('script');
  const firstScript = scripts.length > 0 ? scripts[0] : undefined;
  if (firstScript?.parentNode) {
    return { parent: firstScript.parentNode, before: firstScript };
  }
  const parent = doc.head ?? doc.documentElement;
  if (!parent) {
    return null;
  }
  return { parent, before: null };
}

type LoaderState = {
  status: YouTubeIframeApiStatus;
  error: Error | null;
  promise: Promise<void> | null;
  timeoutId: ReturnType<typeof setTimeout> | null;
};

const defaultEnvironment: YouTubeIframeApiEnvironment = {
  getWindow: () => window as unknown as YouTubeIframeApiWindow,
  getDocument: () => document as unknown as YouTubeIframeApiDocument,
  setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
  clearTimeout: (timeoutId) => clearTimeout(timeoutId),
};

let environment: YouTubeIframeApiEnvironment = defaultEnvironment;
let state: LoaderState = {
  status: 'idle',
  error: null,
  promise: null,
  timeoutId: null,
};

function clearLoadTimeout(): void {
  if (state.timeoutId !== null) {
    environment.clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
}

export function getYouTubeIframeApiStatus(): YouTubeIframeApiStatus {
  return state.status;
}

export function getYouTubeIframeApiError(): Error | null {
  return state.error;
}

/** Test-only: swap window/document/timers for deterministic unit tests. */
export function setYouTubeIframeApiEnvironmentForTests(
  next: YouTubeIframeApiEnvironment | null
): void {
  environment = next ?? defaultEnvironment;
}

/** Test-only: reset module singleton between cases. */
export function resetYouTubeIframeApiLoaderForTests(): void {
  clearLoadTimeout();
  state = {
    status: 'idle',
    error: null,
    promise: null,
    timeoutId: null,
  };
  environment = defaultEnvironment;
}

function markReady(resolve: () => void): void {
  clearLoadTimeout();
  state.status = 'ready';
  state.error = null;
  resolve();
}

function markError(reject: (error: Error) => void, error: Error): void {
  clearLoadTimeout();
  state.status = 'error';
  state.error = error;
  reject(error);
}

/**
 * Ensures the YouTube IFrame API is available exactly once per page.
 * Concurrent callers share the same in-flight promise.
 */
export function loadYouTubeIframeApi(options?: {
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? YOUTUBE_IFRAME_API_TIMEOUT_MS;
  const win = environment.getWindow();

  if (isYouTubeIframeApiReady(win.YT)) {
    state.status = 'ready';
    state.error = null;
    state.promise = Promise.resolve();
    return state.promise;
  }

  if (state.promise) {
    return state.promise;
  }

  if (state.status === 'error' && state.error) {
    return Promise.reject(state.error);
  }

  state.status = 'loading';
  state.error = null;

  state.promise = new Promise<void>((resolve, reject) => {
    const settleReady = () => {
      if (state.status === 'ready') {
        resolve();
        return;
      }
      if (state.status === 'error') {
        reject(state.error ?? new Error('YouTube IFrame API failed to load'));
        return;
      }
      markReady(resolve);
    };

    const settleError = (error: Error) => {
      if (state.status === 'ready' || state.status === 'error') {
        return;
      }
      markError(reject, error);
    };

    const previousCallback = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      try {
        previousCallback?.();
      } catch (callbackError) {
        console.error(
          'YouTube onYouTubeIframeAPIReady listener failed:',
          callbackError
        );
      }
      settleReady();
    };

    state.timeoutId = environment.setTimeout(() => {
      settleError(
        new Error(
          `YouTube IFrame API timed out after ${timeoutMs}ms. Check your connection and try again.`
        )
      );
    }, timeoutMs);

    // Race: API may become ready between the initial check and callback wiring.
    if (isYouTubeIframeApiReady(win.YT)) {
      settleReady();
      return;
    }

    const doc = environment.getDocument();
    const existingScript = findExistingYouTubeIframeApiScript(doc);
    if (existingScript) {
      // Script already loading (or failed silently). Wait for callback / timeout.
      return;
    }

    const insertion = resolveYouTubeIframeApiScriptParent(doc);
    if (!insertion) {
      settleError(
        new Error(
          'Unable to load YouTube player: no document location for the IFrame API script.'
        )
      );
      return;
    }

    try {
      const tag = doc.createElement('script');
      tag.src = YOUTUBE_IFRAME_API_SRC;
      tag.async = true;
      tag.onerror = () => {
        settleError(
          new Error(
            'Unable to load YouTube player. Check your connection and try again.'
          )
        );
      };
      if (insertion.before) {
        insertion.parent.insertBefore(tag, insertion.before);
      } else {
        insertion.parent.appendChild(tag);
      }
    } catch (insertError) {
      settleError(
        insertError instanceof Error
          ? insertError
          : new Error('Unable to load YouTube player.')
      );
    }
  });

  return state.promise;
}

/**
 * Bounded, allowlisted YouTube Data API error classification.
 * Never expose raw provider bodies, request URLs, or token-bearing text.
 */

export const YOUTUBE_ERROR_CODE = {
  AUTH: 'youtube_auth',
  QUOTA: 'youtube_quota',
  PERMISSION: 'youtube_permission',
  RATE_LIMITED: 'youtube_rate_limited',
  UNAVAILABLE: 'youtube_unavailable',
  TIMEOUT: 'youtube_timeout',
  NETWORK: 'youtube_network',
  SEARCH_FAILED: 'youtube_search_failed',
  DETAILS_FAILED: 'youtube_details_failed',
} as const;

export type YouTubeErrorCode =
  (typeof YOUTUBE_ERROR_CODE)[keyof typeof YOUTUBE_ERROR_CODE];

export type YouTubeOperation = 'search' | 'videos';

export type ParsedYouTubeUpstreamError = {
  httpStatus: number;
  reason: string | null;
  retryable: boolean;
};

export type ClassifiedYouTubeError = {
  code: YouTubeErrorCode;
  message: string;
  status?: number;
  reason: string | null;
  retryable: boolean;
};

const MAX_REASON_LENGTH = 64;

const QUOTA_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded']);

const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

const AUTH_REASONS = new Set([
  'authError',
  'expired',
  'required',
  'invalid',
  'unauthorized',
]);

const PERMISSION_REASONS = new Set([
  'accessNotConfigured',
  'forbidden',
  'insufficientPermissions',
  'accountClosed',
  'accountDeleted',
  'channelClosed',
  'channelNotFound',
  'authenticatedUserAccountSuspended',
]);

const ALLOWLISTED_REASONS = new Set([
  ...QUOTA_REASONS,
  ...RATE_REASONS,
  ...AUTH_REASONS,
  ...PERMISSION_REASONS,
]);

const ALLOWLISTED_RPC_STATUS = new Set([
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
  'INTERNAL',
  'DEADLINE_EXCEEDED',
  'ABORTED',
]);

const PUBLIC_MESSAGES: Record<YouTubeErrorCode, string> = {
  [YOUTUBE_ERROR_CODE.AUTH]:
    'YouTube sign-in expired. Reconnect Google and try again.',
  [YOUTUBE_ERROR_CODE.QUOTA]: 'YouTube search quota exceeded. Try again later.',
  [YOUTUBE_ERROR_CODE.PERMISSION]:
    'YouTube access is not available for this account right now.',
  [YOUTUBE_ERROR_CODE.RATE_LIMITED]:
    'YouTube is rate-limiting requests. Try again shortly.',
  [YOUTUBE_ERROR_CODE.UNAVAILABLE]:
    'YouTube is temporarily unavailable. Try again later.',
  [YOUTUBE_ERROR_CODE.TIMEOUT]: 'YouTube request timed out',
  [YOUTUBE_ERROR_CODE.NETWORK]:
    'Could not reach YouTube. Check connectivity and try again.',
  [YOUTUBE_ERROR_CODE.SEARCH_FAILED]: 'YouTube search failed',
  [YOUTUBE_ERROR_CODE.DETAILS_FAILED]: 'Failed to fetch YouTube video details',
};

function sanitizeAllowlistedReason(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().slice(0, MAX_REASON_LENGTH);
  if (!trimmed) {
    return null;
  }
  if (ALLOWLISTED_REASONS.has(trimmed) || ALLOWLISTED_RPC_STATUS.has(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Extract only allowlisted status/reason fields from a Google error JSON body.
 * Unknown shapes yield null reason without retaining payload text.
 */
export function parseYouTubeUpstreamErrorBody(
  httpStatus: number,
  bodyText: string
): ParsedYouTubeUpstreamError {
  let reason: string | null = null;

  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText) as {
        error?: {
          status?: unknown;
          errors?: Array<{ reason?: unknown }>;
        };
      };
      const firstReason = parsed.error?.errors?.[0]?.reason;
      reason =
        sanitizeAllowlistedReason(firstReason) ||
        sanitizeAllowlistedReason(parsed.error?.status);
    } catch {
      reason = null;
    }
  }

  return {
    httpStatus,
    reason,
    retryable: isRetryableYouTubeHttpFailure(httpStatus, reason),
  };
}

export function isRetryableYouTubeHttpFailure(
  httpStatus: number,
  reason: string | null
): boolean {
  if (
    reason !== null &&
    (QUOTA_REASONS.has(reason) ||
      AUTH_REASONS.has(reason) ||
      PERMISSION_REASONS.has(reason) ||
      reason === 'UNAUTHENTICATED' ||
      reason === 'PERMISSION_DENIED')
  ) {
    return false;
  }
  if (
    httpStatus === 401 ||
    (httpStatus === 403 && !RATE_REASONS.has(reason ?? ''))
  ) {
    return false;
  }
  if (httpStatus === 429) {
    return true;
  }
  if (httpStatus >= 500 && httpStatus <= 599) {
    return true;
  }
  if (
    reason === 'UNAVAILABLE' ||
    reason === 'INTERNAL' ||
    reason === 'ABORTED'
  ) {
    return true;
  }
  if (reason === 'RESOURCE_EXHAUSTED' && httpStatus === 429) {
    return true;
  }
  return false;
}

export function classifyYouTubeHttpError(args: {
  operation: YouTubeOperation;
  httpStatus: number;
  reason: string | null;
}): ClassifiedYouTubeError {
  const { operation, httpStatus, reason } = args;
  const fallbackCode =
    operation === 'search'
      ? YOUTUBE_ERROR_CODE.SEARCH_FAILED
      : YOUTUBE_ERROR_CODE.DETAILS_FAILED;

  let code: YouTubeErrorCode = fallbackCode;

  if (httpStatus === 401 || (reason !== null && AUTH_REASONS.has(reason))) {
    code = YOUTUBE_ERROR_CODE.AUTH;
  } else if (
    reason !== null &&
    (QUOTA_REASONS.has(reason) ||
      (reason === 'RESOURCE_EXHAUSTED' && httpStatus === 403))
  ) {
    code = YOUTUBE_ERROR_CODE.QUOTA;
  } else if (
    httpStatus === 429 ||
    (reason !== null && RATE_REASONS.has(reason))
  ) {
    code = YOUTUBE_ERROR_CODE.RATE_LIMITED;
  } else if (
    httpStatus === 403 ||
    (reason !== null && PERMISSION_REASONS.has(reason)) ||
    reason === 'PERMISSION_DENIED'
  ) {
    // Non-quota 403s (and explicit permission reasons) are access problems,
    // not quota exhaustion — prior adapter incorrectly mapped all 403 → quota.
    if (reason !== null && QUOTA_REASONS.has(reason)) {
      code = YOUTUBE_ERROR_CODE.QUOTA;
    } else {
      code = YOUTUBE_ERROR_CODE.PERMISSION;
    }
  } else if (httpStatus >= 500 && httpStatus <= 599) {
    code = YOUTUBE_ERROR_CODE.UNAVAILABLE;
  } else if (reason === 'UNAUTHENTICATED') {
    code = YOUTUBE_ERROR_CODE.AUTH;
  } else if (reason === 'DEADLINE_EXCEEDED') {
    code = YOUTUBE_ERROR_CODE.TIMEOUT;
  } else if (
    reason === 'UNAVAILABLE' ||
    reason === 'INTERNAL' ||
    reason === 'ABORTED'
  ) {
    code = YOUTUBE_ERROR_CODE.UNAVAILABLE;
  }

  const retryable = isRetryableYouTubeHttpFailure(httpStatus, reason);

  return {
    code,
    message: publicMessageForYouTubeError(code, operation),
    status: httpStatus,
    reason,
    retryable,
  };
}

export function classifyYouTubeTransportError(args: {
  operation: YouTubeOperation;
  error: unknown;
  outerAborted: boolean;
}): ClassifiedYouTubeError {
  const { operation, error, outerAborted } = args;
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name)
      : '';

  if (outerAborted || name === 'AbortError') {
    return {
      code: YOUTUBE_ERROR_CODE.TIMEOUT,
      message: publicMessageForYouTubeError(
        YOUTUBE_ERROR_CODE.TIMEOUT,
        operation
      ),
      reason: null,
      retryable: false,
    };
  }

  return {
    code: YOUTUBE_ERROR_CODE.NETWORK,
    message: publicMessageForYouTubeError(
      YOUTUBE_ERROR_CODE.NETWORK,
      operation
    ),
    reason: null,
    retryable: true,
  };
}

export function publicMessageForYouTubeError(
  code: YouTubeErrorCode,
  operation: YouTubeOperation
): string {
  if (code === YOUTUBE_ERROR_CODE.TIMEOUT) {
    return operation === 'search'
      ? 'YouTube search timed out'
      : 'YouTube details timed out';
  }
  if (code === YOUTUBE_ERROR_CODE.QUOTA && operation === 'videos') {
    return 'YouTube quota exceeded. Try again later.';
  }
  return PUBLIC_MESSAGES[code];
}

/** Structured log fields only — never include bodies, URLs, or tokens. */
export function youtubeErrorLogFields(args: {
  operation: YouTubeOperation;
  status?: number;
  reason: string | null;
  code: YouTubeErrorCode;
  attempt: number;
  retryable: boolean;
}): Record<string, string | number | boolean | null> {
  return {
    operation: args.operation,
    status: args.status ?? null,
    reason: args.reason,
    code: args.code,
    attempt: args.attempt,
    retryable: args.retryable,
  };
}

/**
 * Cap Retry-After to a small bound so a large upstream value cannot stall
 * the research deadline. Missing/invalid headers use the provided fallback.
 */
export function parseRetryAfterMs(
  headerValue: string | null,
  fallbackMs: number,
  maxMs: number
): number {
  const cappedFallback = Math.max(0, Math.min(fallbackMs, maxMs));
  if (!headerValue) {
    return cappedFallback;
  }

  const asSeconds = Number(headerValue);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(Math.floor(asSeconds * 1000), maxMs);
  }

  const asDate = Date.parse(headerValue);
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    if (delta <= 0) {
      return 0;
    }
    return Math.min(delta, maxMs);
  }

  return cappedFallback;
}

export function httpStatusForYouTubeErrorCode(
  code: string | undefined
): 401 | 403 | 429 | 502 | 500 | null {
  switch (code) {
    case YOUTUBE_ERROR_CODE.AUTH:
      return 401;
    case YOUTUBE_ERROR_CODE.PERMISSION:
      return 403;
    case YOUTUBE_ERROR_CODE.QUOTA:
    case YOUTUBE_ERROR_CODE.RATE_LIMITED:
      return 429;
    case YOUTUBE_ERROR_CODE.UNAVAILABLE:
    case YOUTUBE_ERROR_CODE.NETWORK:
      return 502;
    default:
      return null;
  }
}

/** Fatal YouTube failures must not climb research query ladders or burn quota. */
export function isFatalYouTubeErrorCode(code: string | undefined): boolean {
  return (
    code === YOUTUBE_ERROR_CODE.AUTH ||
    code === YOUTUBE_ERROR_CODE.QUOTA ||
    code === YOUTUBE_ERROR_CODE.PERMISSION ||
    code === YOUTUBE_ERROR_CODE.RATE_LIMITED
  );
}

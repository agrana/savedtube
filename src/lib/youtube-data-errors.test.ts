import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  classifyYouTubeHttpError,
  classifyYouTubeTransportError,
  httpStatusForYouTubeErrorCode,
  isFatalYouTubeErrorCode,
  parseRetryAfterMs,
  parseYouTubeUpstreamErrorBody,
  youtubeErrorLogFields,
  YOUTUBE_ERROR_CODE,
} from './youtube-data-errors.ts';

/** Explicit fatal reasons take precedence over a transient HTTP status. */
it('does not retry quota exhaustion returned as HTTP 429', () => {
  for (const reason of ['quotaExceeded', 'dailyLimitExceeded']) {
    const result = classifyYouTubeHttpError({
      operation: 'search',
      httpStatus: 429,
      reason,
    });
    assert.equal(result.code, YOUTUBE_ERROR_CODE.QUOTA);
    assert.equal(result.retryable, false);
  }
});

/** Realistic Google YouTube Data API error fixtures (bounded shapes). */
const FIXTURES = {
  quotaExceeded: JSON.stringify({
    error: {
      code: 403,
      message:
        'The request cannot be completed because you have exceeded your quota.',
      errors: [
        {
          message:
            'The request cannot be completed because you have exceeded your quota.',
          domain: 'youtube.quota',
          reason: 'quotaExceeded',
        },
      ],
    },
  }),
  dailyLimitExceeded: JSON.stringify({
    error: {
      code: 403,
      message: 'Daily Limit Exceeded',
      errors: [{ reason: 'dailyLimitExceeded', domain: 'usageLimits' }],
    },
  }),
  accessNotConfigured: JSON.stringify({
    error: {
      code: 403,
      message: 'Access Not Configured.',
      errors: [
        {
          reason: 'accessNotConfigured',
          domain: 'usageLimits',
        },
      ],
      status: 'PERMISSION_DENIED',
    },
  }),
  auth401: JSON.stringify({
    error: {
      code: 401,
      message: 'Request had invalid authentication credentials.',
      errors: [{ reason: 'authError', domain: 'global' }],
      status: 'UNAUTHENTICATED',
    },
  }),
  rateLimited: JSON.stringify({
    error: {
      code: 429,
      message: 'Rate Limit Exceeded',
      errors: [{ reason: 'rateLimitExceeded', domain: 'youtube.quota' }],
    },
  }),
  unavailable500: JSON.stringify({
    error: {
      code: 500,
      message: 'Internal error',
      status: 'INTERNAL',
    },
  }),
  /** Contains token-like noise that must never leak into classified output. */
  noisyBody: JSON.stringify({
    error: {
      code: 403,
      message: 'Bearer ya29.secret-token-value must not leak',
      errors: [
        {
          reason: 'forbidden',
          message: 'https://www.googleapis.com/youtube/v3/search?key=SECRET',
        },
      ],
    },
  }),
};

describe('parseYouTubeUpstreamErrorBody', () => {
  it('extracts allowlisted quota reason', () => {
    const parsed = parseYouTubeUpstreamErrorBody(403, FIXTURES.quotaExceeded);
    assert.equal(parsed.reason, 'quotaExceeded');
    assert.equal(parsed.retryable, false);
  });

  it('extracts accessNotConfigured without treating it as quota', () => {
    const parsed = parseYouTubeUpstreamErrorBody(
      403,
      FIXTURES.accessNotConfigured
    );
    assert.equal(parsed.reason, 'accessNotConfigured');
    assert.equal(parsed.retryable, false);
  });

  it('ignores non-JSON and unknown reasons', () => {
    assert.equal(parseYouTubeUpstreamErrorBody(502, 'not-json').reason, null);
    assert.equal(
      parseYouTubeUpstreamErrorBody(
        400,
        JSON.stringify({ error: { errors: [{ reason: 'weirdCustomReason' }] } })
      ).reason,
      null
    );
  });

  it('does not retain raw message or URL text in the parsed result', () => {
    const parsed = parseYouTubeUpstreamErrorBody(403, FIXTURES.noisyBody);
    assert.equal(parsed.reason, 'forbidden');
    const serialized = JSON.stringify(parsed);
    assert.doesNotMatch(serialized, /ya29|SECRET|googleapis\.com/i);
  });
});

describe('classifyYouTubeHttpError', () => {
  it('maps quotaExceeded and dailyLimitExceeded to youtube_quota', () => {
    for (const fixture of [
      FIXTURES.quotaExceeded,
      FIXTURES.dailyLimitExceeded,
    ]) {
      const parsed = parseYouTubeUpstreamErrorBody(403, fixture);
      const classified = classifyYouTubeHttpError({
        operation: 'search',
        httpStatus: 403,
        reason: parsed.reason,
      });
      assert.equal(classified.code, YOUTUBE_ERROR_CODE.QUOTA);
      assert.equal(classified.retryable, false);
      assert.match(classified.message, /quota/i);
    }
  });

  it('maps accessNotConfigured / bare 403 to permission, not quota', () => {
    const withReason = classifyYouTubeHttpError({
      operation: 'search',
      httpStatus: 403,
      reason: 'accessNotConfigured',
    });
    assert.equal(withReason.code, YOUTUBE_ERROR_CODE.PERMISSION);
    assert.equal(withReason.retryable, false);

    const bare = classifyYouTubeHttpError({
      operation: 'search',
      httpStatus: 403,
      reason: null,
    });
    assert.equal(bare.code, YOUTUBE_ERROR_CODE.PERMISSION);
  });

  it('maps 401 authError to youtube_auth', () => {
    const parsed = parseYouTubeUpstreamErrorBody(401, FIXTURES.auth401);
    const classified = classifyYouTubeHttpError({
      operation: 'search',
      httpStatus: 401,
      reason: parsed.reason,
    });
    assert.equal(classified.code, YOUTUBE_ERROR_CODE.AUTH);
    assert.equal(classified.retryable, false);
    assert.match(classified.message, /sign-in expired|Reconnect/i);
  });

  it('maps 429 to rate limited and retryable', () => {
    const parsed = parseYouTubeUpstreamErrorBody(429, FIXTURES.rateLimited);
    const classified = classifyYouTubeHttpError({
      operation: 'search',
      httpStatus: 429,
      reason: parsed.reason,
    });
    assert.equal(classified.code, YOUTUBE_ERROR_CODE.RATE_LIMITED);
    assert.equal(classified.retryable, true);
  });

  it('maps 5xx to unavailable and retryable', () => {
    const parsed = parseYouTubeUpstreamErrorBody(503, FIXTURES.unavailable500);
    const classified = classifyYouTubeHttpError({
      operation: 'videos',
      httpStatus: 503,
      reason: parsed.reason,
    });
    assert.equal(classified.code, YOUTUBE_ERROR_CODE.UNAVAILABLE);
    assert.equal(classified.retryable, true);
  });
});

describe('classifyYouTubeTransportError', () => {
  it('maps AbortError / outer abort to non-retryable timeout', () => {
    const aborted = classifyYouTubeTransportError({
      operation: 'search',
      error: { name: 'AbortError' },
      outerAborted: false,
    });
    assert.equal(aborted.code, YOUTUBE_ERROR_CODE.TIMEOUT);
    assert.equal(aborted.retryable, false);

    const outer = classifyYouTubeTransportError({
      operation: 'videos',
      error: new Error('fetch failed'),
      outerAborted: true,
    });
    assert.equal(outer.code, YOUTUBE_ERROR_CODE.TIMEOUT);
    assert.equal(outer.retryable, false);
  });

  it('maps other transport failures to retryable network', () => {
    const classified = classifyYouTubeTransportError({
      operation: 'search',
      error: new TypeError('fetch failed'),
      outerAborted: false,
    });
    assert.equal(classified.code, YOUTUBE_ERROR_CODE.NETWORK);
    assert.equal(classified.retryable, true);
  });
});

describe('parseRetryAfterMs', () => {
  it('caps seconds and falls back for invalid values', () => {
    assert.equal(parseRetryAfterMs('120', 200, 2000), 2000);
    assert.equal(parseRetryAfterMs('1', 200, 2000), 1000);
    assert.equal(parseRetryAfterMs(null, 200, 2000), 200);
    assert.equal(parseRetryAfterMs('nope', 350, 2000), 350);
  });
});

describe('youtubeErrorLogFields', () => {
  it('only includes allowlisted structured fields', () => {
    const fields = youtubeErrorLogFields({
      operation: 'search',
      status: 403,
      reason: 'quotaExceeded',
      code: YOUTUBE_ERROR_CODE.QUOTA,
      attempt: 1,
      retryable: false,
    });
    assert.deepEqual(Object.keys(fields).sort(), [
      'attempt',
      'code',
      'operation',
      'reason',
      'retryable',
      'status',
    ]);
    const serialized = JSON.stringify(fields);
    assert.doesNotMatch(serialized, /ya29|Bearer|https?:\/\//i);
  });
});

describe('httpStatusForYouTubeErrorCode / isFatalYouTubeErrorCode', () => {
  it('maps public codes to API statuses', () => {
    assert.equal(httpStatusForYouTubeErrorCode('youtube_auth'), 401);
    assert.equal(httpStatusForYouTubeErrorCode('youtube_permission'), 403);
    assert.equal(httpStatusForYouTubeErrorCode('youtube_quota'), 429);
    assert.equal(httpStatusForYouTubeErrorCode('youtube_rate_limited'), 429);
    assert.equal(httpStatusForYouTubeErrorCode('youtube_unavailable'), 502);
    assert.equal(httpStatusForYouTubeErrorCode('youtube_search_failed'), null);
  });

  it('marks auth/quota/permission/rate as fatal for fallback ladders', () => {
    assert.equal(isFatalYouTubeErrorCode('youtube_auth'), true);
    assert.equal(isFatalYouTubeErrorCode('youtube_quota'), true);
    assert.equal(isFatalYouTubeErrorCode('youtube_permission'), true);
    assert.equal(isFatalYouTubeErrorCode('youtube_rate_limited'), true);
    assert.equal(isFatalYouTubeErrorCode('youtube_unavailable'), false);
    assert.equal(isFatalYouTubeErrorCode('youtube_timeout'), false);
  });
});

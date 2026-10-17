import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { createYouTubeDataClient } from './youtube-data.ts';
import { YOUTUBE_ERROR_CODE } from './youtube-data-errors.ts';

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  });
}

describe('createYouTubeDataClient error classification', () => {
  it('maps quotaExceeded 403 to youtube_quota and does not retry', async () => {
    let calls = 0;
    const fetchImpl = mock.fn(async () => {
      calls += 1;
      return jsonResponse(403, {
        error: {
          errors: [{ reason: 'quotaExceeded' }],
        },
      });
    });
    const sleep = mock.fn(async () => undefined);
    const client = createYouTubeDataClient({
      fetch: fetchImpl as unknown as typeof fetch,
      sleep,
      maxAttempts: 3,
    });

    const result = await client.searchEmbeddableVideos({
      accessToken: 'test-token',
      query: 'cka',
      maxResults: 5,
      timeoutMs: 5000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, YOUTUBE_ERROR_CODE.QUOTA);
      assert.equal(result.status, 403);
    }
    assert.equal(calls, 1);
    assert.equal(sleep.mock.callCount(), 0);
  });

  it('maps accessNotConfigured 403 to permission, not quota', async () => {
    const client = createYouTubeDataClient({
      fetch: (async () =>
        jsonResponse(403, {
          error: {
            errors: [{ reason: 'accessNotConfigured' }],
            status: 'PERMISSION_DENIED',
          },
        })) as unknown as typeof fetch,
      maxAttempts: 3,
    });

    const result = await client.searchEmbeddableVideos({
      accessToken: 'test-token',
      query: 'cka',
      maxResults: 5,
      timeoutMs: 5000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, YOUTUBE_ERROR_CODE.PERMISSION);
      assert.notEqual(result.code, YOUTUBE_ERROR_CODE.QUOTA);
    }
  });

  it('maps 401 to youtube_auth without retry', async () => {
    let calls = 0;
    const client = createYouTubeDataClient({
      fetch: (async () => {
        calls += 1;
        return jsonResponse(401, {
          error: {
            errors: [{ reason: 'authError' }],
            status: 'UNAUTHENTICATED',
          },
        });
      }) as unknown as typeof fetch,
      maxAttempts: 3,
    });

    const result = await client.fetchVideoDetails({
      accessToken: 'expired-token',
      videoIds: ['dQw4w9WgXcQ'],
      timeoutMs: 5000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, YOUTUBE_ERROR_CODE.AUTH);
    }
    assert.equal(calls, 1);
  });
});

describe('createYouTubeDataClient transient retry', () => {
  it('retries 503 then succeeds within the attempt budget', async () => {
    let calls = 0;
    const sleep = mock.fn(async () => undefined);
    const client = createYouTubeDataClient({
      fetch: (async () => {
        calls += 1;
        if (calls < 3) {
          return jsonResponse(503, {
            error: { status: 'UNAVAILABLE', message: 'backend' },
          });
        }
        return jsonResponse(200, {
          items: [{ id: { videoId: 'dQw4w9WgXcQ' } }],
        });
      }) as unknown as typeof fetch,
      sleep,
      maxAttempts: 3,
      backoffBaseMs: 10,
      maxRetryAfterMs: 50,
    });

    const result = await client.searchEmbeddableVideos({
      accessToken: 'test-token',
      query: 'cka',
      maxResults: 5,
      timeoutMs: 5000,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.videoIds, ['dQw4w9WgXcQ']);
    }
    assert.equal(calls, 3);
    assert.equal(sleep.mock.callCount(), 2);
  });

  it('respects Retry-After cap on 429 then fails as rate limited', async () => {
    const sleepMs: number[] = [];
    const client = createYouTubeDataClient({
      fetch: (async () =>
        jsonResponse(
          429,
          { error: { errors: [{ reason: 'rateLimitExceeded' }] } },
          { 'retry-after': '120' }
        )) as unknown as typeof fetch,
      sleep: async (ms) => {
        sleepMs.push(ms);
      },
      maxAttempts: 2,
      backoffBaseMs: 200,
      maxRetryAfterMs: 50,
    });

    const result = await client.searchEmbeddableVideos({
      accessToken: 'test-token',
      query: 'cka',
      maxResults: 5,
      timeoutMs: 5000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, YOUTUBE_ERROR_CODE.RATE_LIMITED);
    }
    assert.equal(sleepMs.length, 1);
    assert.equal(sleepMs[0], 50);
  });

  it('does not retry after the deadline is exhausted', async () => {
    let calls = 0;
    const client = createYouTubeDataClient({
      fetch: (async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return jsonResponse(503, { error: { status: 'UNAVAILABLE' } });
      }) as unknown as typeof fetch,
      sleep: async () => undefined,
      maxAttempts: 5,
      backoffBaseMs: 1,
      maxRetryAfterMs: 1,
    });

    const result = await client.searchEmbeddableVideos({
      accessToken: 'test-token',
      query: 'cka',
      maxResults: 5,
      timeoutMs: 40,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(
        result.code === YOUTUBE_ERROR_CODE.UNAVAILABLE ||
          result.code === YOUTUBE_ERROR_CODE.TIMEOUT
      );
    }
    assert.ok(calls <= 2);
  });

  it('never retries fatal auth/quota/permission errors', async () => {
    for (const fixture of [
      {
        status: 401,
        body: { error: { errors: [{ reason: 'authError' }] } },
        code: YOUTUBE_ERROR_CODE.AUTH,
      },
      {
        status: 403,
        body: { error: { errors: [{ reason: 'quotaExceeded' }] } },
        code: YOUTUBE_ERROR_CODE.QUOTA,
      },
      {
        status: 403,
        body: { error: { errors: [{ reason: 'forbidden' }] } },
        code: YOUTUBE_ERROR_CODE.PERMISSION,
      },
    ]) {
      let calls = 0;
      const sleep = mock.fn(async () => undefined);
      const client = createYouTubeDataClient({
        fetch: (async () => {
          calls += 1;
          return jsonResponse(fixture.status, fixture.body);
        }) as unknown as typeof fetch,
        sleep,
        maxAttempts: 4,
      });

      const result = await client.searchEmbeddableVideos({
        accessToken: 'test-token',
        query: 'cka',
        maxResults: 5,
        timeoutMs: 5000,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.code, fixture.code);
      }
      assert.equal(calls, 1);
      assert.equal(sleep.mock.callCount(), 0);
    }
  });

  it('retries network failures then returns youtube_network', async () => {
    let calls = 0;
    const sleep = mock.fn(async () => undefined);
    const client = createYouTubeDataClient({
      fetch: (async () => {
        calls += 1;
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
      sleep,
      maxAttempts: 3,
      backoffBaseMs: 5,
      maxRetryAfterMs: 10,
    });

    const result = await client.searchEmbeddableVideos({
      accessToken: 'test-token',
      query: 'cka',
      maxResults: 5,
      timeoutMs: 5000,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, YOUTUBE_ERROR_CODE.NETWORK);
    }
    assert.equal(calls, 3);
    assert.equal(sleep.mock.callCount(), 2);
  });
});

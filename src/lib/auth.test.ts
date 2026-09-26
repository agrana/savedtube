import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import {
  ACCESS_TOKEN_EXPIRES_FIELD,
  applyAccountToToken,
  handleJwtCallback,
  refreshAccessToken,
  type OAuthAccountTokens,
} from './auth-jwt.ts';

const HOUR_MS = 60 * 60 * 1000;

function makeAccount(
  overrides: Partial<OAuthAccountTokens> = {}
): OAuthAccountTokens {
  return {
    access_token: 'access-initial',
    refresh_token: 'refresh-initial',
    expires_at: Math.floor((Date.now() + HOUR_MS) / 1000),
    ...overrides,
  };
}

describe('ACCESS_TOKEN_EXPIRES_FIELD', () => {
  it('uses the canonical accessTokenExpires name', () => {
    assert.equal(ACCESS_TOKEN_EXPIRES_FIELD, 'accessTokenExpires');
  });
});

describe('applyAccountToToken', () => {
  it('writes accessTokenExpires and clears stale refresh errors on initial login', () => {
    const token = applyAccountToToken(
      { error: 'RefreshAccessTokenError', expiresAt: 1 },
      makeAccount()
    );

    assert.equal(token.accessToken, 'access-initial');
    assert.equal(token.refreshToken, 'refresh-initial');
    assert.equal(typeof token.accessTokenExpires, 'number');
    assert.ok((token.accessTokenExpires as number) > Date.now());
    assert.equal(token.error, undefined);
    assert.equal(token.expiresAt, undefined);
  });

  it('supports expires_in when expires_at is absent', () => {
    const before = Date.now();
    const token = applyAccountToToken(
      {},
      makeAccount({ expires_at: undefined, expires_in: 3600 })
    );
    assert.ok((token.accessTokenExpires as number) >= before + HOUR_MS - 1000);
  });
});

describe('handleJwtCallback', () => {
  it('returns the token unchanged when still valid', async () => {
    const refreshFn = mock.fn(
      async (token: Parameters<typeof refreshAccessToken>[0]) => token
    );
    const result = await handleJwtCallback(
      {
        token: {
          accessToken: 'still-good',
          refreshToken: 'refresh',
          accessTokenExpires: Date.now() + HOUR_MS,
        },
        account: null,
      },
      refreshFn
    );

    assert.equal(result.accessToken, 'still-good');
    assert.equal(refreshFn.mock.callCount(), 0);
  });

  it('refreshes when accessTokenExpires has passed', async () => {
    const refreshFn = mock.fn(
      async (token: Parameters<typeof refreshAccessToken>[0]) => ({
        ...token,
        accessToken: 'access-refreshed',
        accessTokenExpires: Date.now() + HOUR_MS,
        error: undefined,
      })
    );

    const result = await handleJwtCallback(
      {
        token: {
          accessToken: 'expired',
          refreshToken: 'refresh',
          accessTokenExpires: Date.now() - 1000,
          error: 'RefreshAccessTokenError',
        },
        account: null,
      },
      refreshFn
    );

    assert.equal(refreshFn.mock.callCount(), 1);
    assert.equal(result.accessToken, 'access-refreshed');
    assert.equal(result.error, undefined);
    assert.equal(typeof result.accessTokenExpires, 'number');
  });

  it('migrates legacy expiresAt onto accessTokenExpires before validity check', async () => {
    const refreshFn = mock.fn(
      async (token: Parameters<typeof refreshAccessToken>[0]) => token
    );
    const result = await handleJwtCallback(
      {
        token: {
          accessToken: 'legacy',
          refreshToken: 'refresh',
          expiresAt: Date.now() + HOUR_MS,
        },
        account: null,
      },
      refreshFn
    );

    assert.equal(refreshFn.mock.callCount(), 0);
    assert.equal(typeof result.accessTokenExpires, 'number');
    assert.equal(result.expiresAt, undefined);
  });

  it('propagates refresh failure error', async () => {
    const refreshFn = mock.fn(
      async (token: Parameters<typeof refreshAccessToken>[0]) => ({
        ...token,
        error: 'RefreshAccessTokenError',
      })
    );

    const result = await handleJwtCallback(
      {
        token: {
          accessToken: 'expired',
          refreshToken: 'refresh',
          accessTokenExpires: Date.now() - 1000,
        },
        account: null,
      },
      refreshFn
    );

    assert.equal(result.error, 'RefreshAccessTokenError');
  });

  it('clears error and rewrites expiry on reconnect (account present again)', async () => {
    const result = await handleJwtCallback({
      token: {
        accessToken: 'stale',
        refreshToken: 'old-refresh',
        accessTokenExpires: Date.now() - HOUR_MS,
        error: 'RefreshAccessTokenError',
      },
      account: makeAccount({
        access_token: 'access-reconnected',
        refresh_token: 'refresh-reconnected',
      }),
    });

    assert.equal(result.accessToken, 'access-reconnected');
    assert.equal(result.refreshToken, 'refresh-reconnected');
    assert.equal(result.error, undefined);
    assert.ok((result.accessTokenExpires as number) > Date.now());
  });

  it('marks NoRefreshToken when expired without a refresh token', async () => {
    const result = await handleJwtCallback({
      token: {
        accessToken: 'expired',
        accessTokenExpires: Date.now() - 1000,
      },
      account: null,
    });

    assert.equal(result.error, 'NoRefreshToken');
  });
});

describe('refreshAccessToken', () => {
  it('writes accessTokenExpires and clears error on success', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'new-access',
            expires_in: 3600,
            refresh_token: 'new-refresh',
          }),
          { status: 200 }
        )
    ) as typeof fetch;

    try {
      const result = await refreshAccessToken({
        accessToken: 'old',
        refreshToken: 'refresh',
        accessTokenExpires: Date.now() - 1000,
        error: 'RefreshAccessTokenError',
      });

      assert.equal(result.accessToken, 'new-access');
      assert.equal(result.refreshToken, 'new-refresh');
      assert.equal(result.error, undefined);
      assert.equal(typeof result.accessTokenExpires, 'number');
      assert.ok((result.accessTokenExpires as number) > Date.now());
      assert.equal(result.expiresAt, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns RefreshAccessTokenError when Google rejects the refresh', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
        })
    ) as typeof fetch;

    try {
      const result = await refreshAccessToken({
        accessToken: 'old',
        refreshToken: 'bad-refresh',
        accessTokenExpires: Date.now() - 1000,
      });

      assert.equal(result.error, 'RefreshAccessTokenError');
      assert.equal(result.accessToken, 'old');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

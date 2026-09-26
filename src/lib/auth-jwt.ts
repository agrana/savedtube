import type { JWT } from 'next-auth/jwt';

/** Single source of truth for access-token expiry on the JWT (milliseconds since epoch). */
export const ACCESS_TOKEN_EXPIRES_FIELD = 'accessTokenExpires' as const;

/** Minimal OAuth account shape used by the JWT callback. */
export type OAuthAccountTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
};

export type RefreshableToken = JWT & {
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpires?: number;
  /** @deprecated Legacy field; migrated to accessTokenExpires */
  expiresAt?: number;
  error?: string;
};

function readAccessTokenExpires(token: RefreshableToken): number | undefined {
  if (typeof token.accessTokenExpires === 'number') {
    return token.accessTokenExpires;
  }
  // Migrate legacy sessions that stored expiry under expiresAt
  if (typeof token.expiresAt === 'number') {
    return token.expiresAt;
  }
  return undefined;
}

/**
 * Persist OAuth tokens from a fresh account (initial login or reconnect).
 * Clears any prior refresh error and writes a single expiry field.
 */
export function applyAccountToToken(
  token: RefreshableToken,
  account: OAuthAccountTokens
): RefreshableToken {
  const next: RefreshableToken = {
    ...token,
    accessToken: account.access_token,
    refreshToken: account.refresh_token ?? token.refreshToken,
    error: undefined,
  };

  delete next.expiresAt;

  if (account.expires_at) {
    next.accessTokenExpires = account.expires_at * 1000;
  } else if (account.expires_in) {
    next.accessTokenExpires = Date.now() + account.expires_in * 1000;
  } else {
    next.accessTokenExpires = undefined;
  }

  return next;
}

/**
 * Takes a token, and returns a new token with updated
 * `accessToken` and `accessTokenExpires`. If an error occurs,
 * returns the old token and an error property.
 */
export async function refreshAccessToken(
  token: RefreshableToken
): Promise<RefreshableToken> {
  try {
    const url =
      'https://oauth2.googleapis.com/token?' +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken!,
      });

    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });

    const refreshedTokens = await response.json();

    if (!response.ok) {
      throw refreshedTokens;
    }

    const next: RefreshableToken = {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
      error: undefined,
    };
    delete next.expiresAt;
    return next;
  } catch (error) {
    console.error('Error refreshing access token', error);

    return {
      ...token,
      error: 'RefreshAccessTokenError',
    };
  }
}

type JwtCallbackParams = {
  token: RefreshableToken;
  account: OAuthAccountTokens | null | undefined;
};

/**
 * JWT callback logic: initial login, valid token passthrough,
 * expired refresh, refresh failure, and reconnect (account present again).
 */
export async function handleJwtCallback(
  { token, account }: JwtCallbackParams,
  refreshFn: typeof refreshAccessToken = refreshAccessToken
): Promise<RefreshableToken> {
  if (account) {
    return applyAccountToToken(token, account);
  }

  // Normalize legacy expiry field onto the canonical name
  const expiresAt = readAccessTokenExpires(token);
  if (expiresAt !== undefined && token.accessTokenExpires !== expiresAt) {
    token = { ...token, accessTokenExpires: expiresAt };
    delete token.expiresAt;
  }

  if (!token.refreshToken) {
    if (token.accessTokenExpires && Date.now() >= token.accessTokenExpires) {
      return { ...token, error: 'NoRefreshToken' };
    }
    return token;
  }

  if (token.accessTokenExpires && Date.now() < token.accessTokenExpires) {
    return token;
  }

  return refreshFn(token);
}

/**
 * Stable API auth / path-access error codes and safe client-facing messages.
 * Never include tokens, provider payloads, or raw OAuth error strings here.
 */

export const API_AUTH_ERROR_CODE = {
  UNAUTHENTICATED: 'unauthenticated',
  YOUTUBE_REAUTH_REQUIRED: 'youtube_reauth_required',
} as const;

export type ApiAuthErrorCode =
  (typeof API_AUTH_ERROR_CODE)[keyof typeof API_AUTH_ERROR_CODE];

/** Ownership hiding: same message for missing and foreign-owned paths. */
export const PATH_ACCESS_ERROR_CODE = {
  PATH_NOT_FOUND: 'path_not_found',
} as const;

export type PathAccessErrorCode =
  (typeof PATH_ACCESS_ERROR_CODE)[keyof typeof PATH_ACCESS_ERROR_CODE];

export const UNAUTHENTICATED_MESSAGE = 'Sign in required.';

export const YOUTUBE_REAUTH_REQUIRED_MESSAGE =
  'Google YouTube authorization is missing or expired. Reconnect Google to continue research.';

export const PATH_NOT_FOUND_MESSAGE = 'Path not found';

export type ApiAuthErrorBody = {
  error: string;
  code: ApiAuthErrorCode;
};

export type PathAccessErrorBody = {
  error: string;
  code: PathAccessErrorCode;
};

export function buildUnauthenticatedErrorBody(): ApiAuthErrorBody {
  return {
    error: UNAUTHENTICATED_MESSAGE,
    code: API_AUTH_ERROR_CODE.UNAUTHENTICATED,
  };
}

export function buildYouTubeReauthErrorBody(): ApiAuthErrorBody {
  return {
    error: YOUTUBE_REAUTH_REQUIRED_MESSAGE,
    code: API_AUTH_ERROR_CODE.YOUTUBE_REAUTH_REQUIRED,
  };
}

export function buildPathNotFoundErrorBody(): PathAccessErrorBody {
  return {
    error: PATH_NOT_FOUND_MESSAGE,
    code: PATH_ACCESS_ERROR_CODE.PATH_NOT_FOUND,
  };
}

/**
 * True when a signed-in session cannot supply a usable Google YouTube access token.
 * Treat missing token and refresh/session error the same for clients (reconnect).
 */
export function sessionMissingYouTubeAccessToken(session: {
  accessToken?: string | null;
  error?: string | null;
}): boolean {
  return !session.accessToken || Boolean(session.error);
}

export function isYouTubeReauthErrorCode(
  code: unknown
): code is typeof API_AUTH_ERROR_CODE.YOUTUBE_REAUTH_REQUIRED {
  return code === API_AUTH_ERROR_CODE.YOUTUBE_REAUTH_REQUIRED;
}

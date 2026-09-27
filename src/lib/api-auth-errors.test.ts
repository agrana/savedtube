import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_AUTH_ERROR_CODE,
  buildPathNotFoundErrorBody,
  buildUnauthenticatedErrorBody,
  buildYouTubeReauthErrorBody,
  isYouTubeReauthErrorCode,
  PATH_ACCESS_ERROR_CODE,
  PATH_NOT_FOUND_MESSAGE,
  sessionMissingYouTubeAccessToken,
  UNAUTHENTICATED_MESSAGE,
  YOUTUBE_REAUTH_REQUIRED_MESSAGE,
} from './api-auth-errors.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('api-auth error bodies', () => {
  it('returns stable unauthenticated 401 payload without token fields', () => {
    const body = buildUnauthenticatedErrorBody();
    assert.equal(body.code, API_AUTH_ERROR_CODE.UNAUTHENTICATED);
    assert.equal(body.error, UNAUTHENTICATED_MESSAGE);
    assert.equal('accessToken' in body, false);
    assert.doesNotMatch(JSON.stringify(body), /ya29|Bearer|refresh/i);
  });

  it('returns stable YouTube reconnect 401 payload without provider details', () => {
    const body = buildYouTubeReauthErrorBody();
    assert.equal(body.code, API_AUTH_ERROR_CODE.YOUTUBE_REAUTH_REQUIRED);
    assert.equal(body.error, YOUTUBE_REAUTH_REQUIRED_MESSAGE);
    assert.doesNotMatch(
      JSON.stringify(body),
      /RefreshAccessTokenError|ya29|Bearer/i
    );
  });

  it('returns stable path_not_found 404 ownership-hiding payload', () => {
    const body = buildPathNotFoundErrorBody();
    assert.equal(body.code, PATH_ACCESS_ERROR_CODE.PATH_NOT_FOUND);
    assert.equal(body.error, PATH_NOT_FOUND_MESSAGE);
  });
});

describe('sessionMissingYouTubeAccessToken', () => {
  it('is false when accessToken is present and session.error is unset', () => {
    assert.equal(
      sessionMissingYouTubeAccessToken({ accessToken: 'access-ok' }),
      false
    );
  });

  it('is true when accessToken is missing even if the session user exists', () => {
    assert.equal(sessionMissingYouTubeAccessToken({}), true);
    assert.equal(
      sessionMissingYouTubeAccessToken({ accessToken: undefined }),
      true
    );
    assert.equal(sessionMissingYouTubeAccessToken({ accessToken: '' }), true);
  });

  it('is true when session.error is set even if an accessToken string remains', () => {
    assert.equal(
      sessionMissingYouTubeAccessToken({
        accessToken: 'stale-access',
        error: 'RefreshAccessTokenError',
      }),
      true
    );
  });
});

describe('isYouTubeReauthErrorCode', () => {
  it('matches only the stable reconnect code', () => {
    assert.equal(
      isYouTubeReauthErrorCode(API_AUTH_ERROR_CODE.YOUTUBE_REAUTH_REQUIRED),
      true
    );
    assert.equal(
      isYouTubeReauthErrorCode(API_AUTH_ERROR_CODE.UNAUTHENTICATED),
      false
    );
    assert.equal(isYouTubeReauthErrorCode('Unauthorized'), false);
    assert.equal(isYouTubeReauthErrorCode(undefined), false);
  });
});

describe('api-auth wiring (source)', () => {
  it('maps missing accessToken / session.error to youtube_reauth_required 401', () => {
    const source = readFileSync(join(root, 'src/lib/api-auth.ts'), 'utf8');
    assert.match(source, /sessionMissingYouTubeAccessToken/);
    assert.match(source, /buildYouTubeReauthErrorBody/);
    assert.match(source, /buildUnauthenticatedErrorBody/);
    assert.match(source, /status:\s*401/);
    assert.doesNotMatch(source, /error:\s*session\.error/);
    assert.doesNotMatch(source, /accessToken:\s*result\.session\.accessToken/);
  });

  it('keeps research behind requireApiSessionWithAccessToken', () => {
    const research = readFileSync(
      join(root, 'src/app/api/paths/[pathId]/research/route.ts'),
      'utf8'
    );
    assert.match(research, /requireApiSessionWithAccessToken/);
    assert.match(research, /PATH_ACCESS_ERROR_CODE\.PATH_NOT_FOUND/);
  });
});

describe('path research UI reconnect (source)', () => {
  it('shows reconnect CTA for youtube_reauth_required without auto-redirect loops', () => {
    const page = readFileSync(
      join(root, 'src/app/paths/[pathId]/page.tsx'),
      'utf8'
    );
    assert.match(page, /isYouTubeReauthErrorCode/);
    assert.match(page, /needsYouTubeReconnect/);
    assert.match(page, /handleReconnectYouTube/);
    assert.match(page, /signOut\(\{\s*redirect:\s*false\s*\}\)/);
    assert.match(page, /signIn\('google',\s*\{\s*callbackUrl\s*\}/);
    assert.match(page, /Reconnect Google YouTube/);
    assert.doesNotMatch(
      page,
      /useEffect\(\(\)\s*=>\s*\{\s*void handleReconnect/
    );
    assert.doesNotMatch(page, /signIn\('google'[^)]*\)\s*;\s*\}\s*,\s*\[/);
  });

  it('documents youtube.readonly and reconnect for existing sessions', () => {
    const auth = readFileSync(join(root, 'src/lib/auth.ts'), 'utf8');
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    assert.match(
      auth,
      /https:\/\/www\.googleapis\.com\/auth\/youtube\.readonly/
    );
    assert.match(readme, /youtube\.readonly/);
    assert.match(readme, /youtube_reauth_required/);
    assert.match(readme, /sign-out and Google sign-in/i);
  });
});

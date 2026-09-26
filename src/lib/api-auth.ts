import 'server-only';

import { getServerSession } from 'next-auth/next';
import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { authOptions } from './auth';

export type ApiSession = Session & {
  user: Session['user'] & { id: string };
  accessToken?: string;
  error?: string;
};

/**
 * Authoritative API session check. Always returns JSON 401 (never HTML redirects).
 * Page routes continue to rely on middleware for early redirects.
 *
 * App-owned data (paths, intervals, progress) only needs session.user.id.
 * Expired / failed YouTube token refresh must not block those routes.
 */
export async function requireApiSession(): Promise<
  | { session: ApiSession; error?: undefined }
  | { session?: undefined; error: NextResponse }
> {
  const session = (await getServerSession(authOptions)) as ApiSession | null;

  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { session };
}

/** Session guaranteed to include a Google access token for YouTube API calls. */
export async function requireApiSessionWithAccessToken(): Promise<
  | {
      session: ApiSession & { accessToken: string };
      error?: undefined;
    }
  | { session?: undefined; error: NextResponse }
> {
  const result = await requireApiSession();
  if (result.error) {
    return result;
  }

  if (!result.session.accessToken || result.session.error) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return {
    session: result.session as ApiSession & { accessToken: string },
  };
}

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from 'next-auth/middleware';
import { apiRateLimit } from '@/lib/rate-limit';

const PROTECTED_PAGE_PREFIXES = ['/dashboard', '/p/', '/paths'] as const;

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) =>
      pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix)
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

// Rate limiting for API routes (auth is enforced in route handlers with JSON 401)
function withRateLimit(request: NextRequest) {
  if (isApiPath(request.nextUrl.pathname)) {
    return apiRateLimit(request);
  }
  return null;
}

/**
 * Middleware responsibilities:
 * - Early HTML redirects for protected pages (dashboard, playlist views, paths)
 * - Rate limiting for API routes
 * - API auth is NOT enforced here so handlers can return JSON 401 instead of HTML redirects
 *
 * Security headers for all responses (including public pages) live in next.config.js.
 */
export default withAuth(
  function middleware(request: NextRequest) {
    const rateLimitResponse = withRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;

        // Let API routes through; each handler returns JSON 401 when unauthenticated.
        if (isApiPath(pathname)) {
          return true;
        }

        if (isProtectedPage(pathname)) {
          return !!token;
        }

        return true;
      },
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/p/:path*',
    '/paths',
    '/paths/:path*',
    '/api/progress/:path*',
    '/api/playlists/:path*',
    '/api/playlist-items/:path*',
    '/api/hidden-playlists/:path*',
    '/api/vid-intervals/:path*',
    '/api/paths',
    '/api/paths/:path*',
  ],
};

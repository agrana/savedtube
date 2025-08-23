import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { withAuth } from 'next-auth/middleware';
import { apiRateLimit } from '@/lib/rate-limit';

// Security headers middleware
function addSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "media-src 'self' https: blob:",
      "frame-src 'self' https://www.youtube.com",
      "connect-src 'self' https://www.googleapis.com https://*.supabase.co",
      "font-src 'self' data:",
    ].join('; ')
  );

  return response;
}

// Rate limiting for API routes
function withRateLimit(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const rateLimitResult = apiRateLimit(request);
    if (rateLimitResult) {
      return addSecurityHeaders(rateLimitResult);
    }
  }
  return null;
}

// Main middleware function
export default withAuth(
  function middleware(request: NextRequest) {
    // Apply rate limiting
    const rateLimitResponse = withRateLimit(request);
    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Add security headers to all responses
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/protected/:path*',
    '/api/progress/:path*',
    '/api/playlists/:path*',
    '/api/hidden-playlists/:path*',
    '/p/:path*',
  ],
};

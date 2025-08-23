import { NextRequest, NextResponse } from 'next/server';

// Simple in-memory rate limiter (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function createRateLimiter(config: RateLimitConfig) {
  return function rateLimit(request: NextRequest) {
    const ip =
      request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const now = Date.now();

    const key = `${ip}:${request.nextUrl.pathname}`;
    const current = rateLimitMap.get(key);

    if (!current || now > current.resetTime) {
      // First request or window expired
      rateLimitMap.set(key, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      return null; // Allow request
    }

    if (current.count >= config.maxRequests) {
      // Rate limit exceeded
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(current.resetTime).toISOString(),
          },
        }
      );
    }

    // Increment counter
    current.count++;
    rateLimitMap.set(key, current);

    return null; // Allow request
  };
}

// Predefined rate limiters
export const authRateLimit = createRateLimiter({
  maxRequests: 5,
  windowMs: 5 * 60 * 1000, // 5 minutes
});

export const apiRateLimit = createRateLimiter({
  maxRequests: 100,
  windowMs: 60 * 1000, // 1 minute
});

export const playlistRateLimit = createRateLimiter({
  maxRequests: 50,
  windowMs: 60 * 1000, // 1 minute
});

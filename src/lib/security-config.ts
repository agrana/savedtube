export const securityConfig = {
  // Session security
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },

  // Rate limiting
  rateLimit: {
    auth: {
      maxRequests: 5,
      windowMs: 5 * 60 * 1000, // 5 minutes
    },
    api: {
      maxRequests: 100,
      windowMs: 60 * 1000, // 1 minute
    },
    playlist: {
      maxRequests: 50,
      windowMs: 60 * 1000, // 1 minute
    },
  },

  // Input validation
  validation: {
    maxStringLength: 1000,
    maxArrayLength: 100,
    allowedYouTubeDomains: [
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'm.youtube.com',
    ],
  },

  // Content Security Policy
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
      'https://www.youtube.com',
      'https://s.ytimg.com',
    ],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    mediaSrc: ["'self'", 'https:', 'blob:'],
    frameSrc: ["'self'", 'https://www.youtube.com'],
    connectSrc: [
      "'self'",
      'https://www.googleapis.com',
      'https://*.supabase.co',
    ],
    fontSrc: ["'self'", 'data:'],
  },

  // Security headers
  headers: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  },

  // Monitoring and logging
  monitoring: {
    logSecurityEvents: true,
    logAuthFailures: true,
    logRateLimitExceeded: true,
    logValidationFailures: true,
    logSuspiciousActivity: true,
  },

  // Environment-specific settings
  environment: {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTest: process.env.NODE_ENV === 'test',
  },
} as const;

interface SecurityEvent {
  timestamp: string;
  event: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

class SecurityLogger {
  private events: SecurityEvent[] = [];

  log(event: Omit<SecurityEvent, 'timestamp'>) {
    const securityEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.events.push(securityEvent);

    // Log to console in development, send to monitoring service in production
    if (process.env.NODE_ENV === 'development') {
      console.log('🔒 SECURITY EVENT:', securityEvent);
    } else {
      // In production, send to monitoring service (e.g., Sentry, LogRocket)
      // This is where you'd integrate with your monitoring service
    }

    // Keep only last 1000 events in memory
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  logAuthFailure(
    userId: string,
    reason: string,
    ip?: string,
    userAgent?: string
  ) {
    this.log({
      event: 'AUTH_FAILURE',
      userId,
      ip,
      userAgent,
      details: { reason },
      severity: 'medium',
    });
  }

  logRateLimitExceeded(ip: string, endpoint: string, userAgent?: string) {
    this.log({
      event: 'RATE_LIMIT_EXCEEDED',
      ip,
      userAgent,
      details: { endpoint },
      severity: 'medium',
    });
  }

  logValidationFailure(
    userId: string,
    input: unknown,
    reason: string,
    ip?: string
  ) {
    this.log({
      event: 'VALIDATION_FAILURE',
      userId,
      ip,
      details: { input, reason },
      severity: 'low',
    });
  }

  logDataAccess(userId: string, resource: string, action: string, ip?: string) {
    this.log({
      event: 'DATA_ACCESS',
      userId,
      ip,
      details: { resource, action },
      severity: 'low',
    });
  }

  logSuspiciousActivity(
    userId: string,
    activity: string,
    ip?: string,
    userAgent?: string
  ) {
    this.log({
      event: 'SUSPICIOUS_ACTIVITY',
      userId,
      ip,
      userAgent,
      details: { activity },
      severity: 'high',
    });
  }

  getEvents(limit = 100): SecurityEvent[] {
    return this.events.slice(-limit);
  }

  getEventsBySeverity(severity: SecurityEvent['severity']): SecurityEvent[] {
    return this.events.filter((event) => event.severity === severity);
  }
}

export const securityLogger = new SecurityLogger();

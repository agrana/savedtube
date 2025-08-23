import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

// CSRF token generation and validation
export function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

export async function getCSRFToken(): Promise<string> {
  const cookieStore = await cookies();
  let token = cookieStore.get('csrf-token')?.value;

  if (!token) {
    token = generateCSRFToken();
    // Note: In a real implementation, you'd set this cookie with proper options
    // For now, we'll rely on the client-side implementation
  }

  return token;
}

export async function validateCSRFToken(token: string): Promise<boolean> {
  const storedToken = await getCSRFToken();
  return token === storedToken;
}

// CSRF middleware for server actions
export function withCSRF<T extends unknown[], R>(
  action: (...args: T) => Promise<R>
) {
  return async (csrfToken: string, ...args: T): Promise<R> => {
    const isValid = await validateCSRFToken(csrfToken);
    if (!isValid) {
      throw new Error('CSRF token validation failed');
    }
    return action(...args);
  };
}

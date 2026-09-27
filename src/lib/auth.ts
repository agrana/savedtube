/* eslint-disable @typescript-eslint/no-explicit-any */
import 'server-only';

import GoogleProvider from 'next-auth/providers/google';
import { handleJwtCallback } from './auth-jwt';

export {
  ACCESS_TOKEN_EXPIRES_FIELD,
  applyAccountToToken,
  handleJwtCallback,
  refreshAccessToken,
} from './auth-jwt';
export type { OAuthAccountTokens, RefreshableToken } from './auth-jwt';

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // youtube.readonly is required for path research (YouTube Data API search).
          // Existing sessions created before this scope (or after a failed refresh) need
          // one explicit sign-out / sign-in to obtain a usable access token again.
          scope:
            'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          access_type: 'offline', // Enable refresh tokens without forcing the Google consent screen every sign-in
          include_granted_scopes: 'true',
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account }: any) {
      return handleJwtCallback({ token, account });
    },
    async session({ session, token }: any) {
      session.accessToken = token.accessToken;
      session.user.id = token.sub!;

      if (token.error) {
        session.error = token.error;
      } else {
        delete session.error;
      }

      return session;
    },
    async signOut({ token }: any) {
      if (token) {
        token.accessToken = undefined;
        token.refreshToken = undefined;
        token.accessTokenExpires = undefined;
        token.expiresAt = undefined;
        token.error = undefined;
      }
      return true;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
};

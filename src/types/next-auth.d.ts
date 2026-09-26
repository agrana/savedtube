declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: string;
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    /** Access token expiry in milliseconds since epoch */
    accessTokenExpires?: number;
    /** @deprecated Migrated to accessTokenExpires */
    expiresAt?: number;
    error?: string;
    picture?: string;
  }
}

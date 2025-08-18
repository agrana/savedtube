/* eslint-disable @typescript-eslint/no-explicit-any */
import NextAuth from 'next-auth/next'
import GoogleProvider from 'next-auth/providers/google'

/**
 * Takes a token, and returns a new token with updated
 * `accessToken` and `accessTokenExpires`. If an error occurs,
 * returns the old token and an error property
 */
async function refreshAccessToken(token: any) {
  try {
    const url =
      "https://oauth2.googleapis.com/token?" +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      })

    const response = await fetch(url, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      throw refreshedTokens
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      accessTokenExpires: Date.now() + refreshedTokens.expires_in * 1000,
      // Fall back to old refresh token, but note that
      // many providers give a new refresh token when you
      // refresh an access token, so we may want to update
      // our database with the new refresh token as well.
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken,
    }
  } catch (error) {
    console.error("Error refreshing access token", error)

    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          access_type: 'offline', // Enable refresh tokens
          prompt: 'consent', // Force consent screen to ensure refresh token
        },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, account }) {
      // Persist the OAuth access_token and or the user id to the token right after signin
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
      }
      
      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.expiresAt as number)) {
        return token
      }
      
      // Access token has expired, try to update it
      return refreshAccessToken(token)
    },
    async session({ session, token }: any) {
      // Send properties to the client, like an access_token and user id from a provider.
      session.accessToken = token.accessToken
      session.user.id = token.sub!
      
      // If there's an error refreshing the token, we can handle it here
      if (token.error) {
        session.error = token.error
      }
      
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
})

export { handler as GET, handler as POST }

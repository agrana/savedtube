/**
 * Environment configuration with validation
 * This ensures all required environment variables are present and valid
 */

interface Config {
  // Supabase Configuration
  supabase: {
    url: string
    anonKey: string
    serviceRoleKey: string
  }
  
  // Google OAuth Configuration
  google: {
    clientId: string
    clientSecret: string
  }
  
  // NextAuth Configuration
  nextAuth: {
    secret: string
    url: string
  }
  
  // App Configuration
  app: {
    isDevelopment: boolean
    isProduction: boolean
  }
}

function requireEnvVar(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function validateUrl(url: string, name: string): string {
  try {
    new URL(url)
    return url
  } catch {
    throw new Error(`Invalid URL for ${name}: ${url}`)
  }
}

export const config: Config = {
  supabase: {
    url: validateUrl(requireEnvVar('NEXT_PUBLIC_SUPABASE_URL'), 'NEXT_PUBLIC_SUPABASE_URL'),
    anonKey: requireEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
  },
  
  google: {
    clientId: requireEnvVar('GOOGLE_CLIENT_ID'),
    clientSecret: requireEnvVar('GOOGLE_CLIENT_SECRET'),
  },
  
  nextAuth: {
    secret: requireEnvVar('NEXTAUTH_SECRET'),
    url: validateUrl(requireEnvVar('NEXTAUTH_URL'), 'NEXTAUTH_URL'),
  },
  
  app: {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
  },
}

// Validate configuration on module load
if (typeof window === 'undefined') {
  // Only validate on server side
  console.log('✅ Environment configuration validated successfully')
}

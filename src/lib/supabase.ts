import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Database types for TypeScript
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          avatar_url: string | null
          email: string | null
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          email?: string | null
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

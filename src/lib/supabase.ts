import { createClient } from '@supabase/supabase-js';
import { config } from './config';

// Client-side Supabase client (for browser)
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  }
);

// Server-side Supabase client (for API routes with RLS)
export const createServerSupabaseClient = (accessToken?: string) => {
  return createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
};

// Database types for TypeScript
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          avatar_url: string | null;
          email: string | null;
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      playlist_progress: {
        Row: {
          id: string;
          user_id: string;
          playlist_id: string;
          video_id: string;
          watched: boolean;
          watched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          playlist_id: string;
          video_id: string;
          watched: boolean;
          watched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          playlist_id?: string;
          video_id?: string;
          watched?: boolean;
          watched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};

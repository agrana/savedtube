-- Fix playlist_progress table to accept NextAuth user IDs (strings) instead of UUIDs
-- Drop existing policies and constraints first
DROP POLICY IF EXISTS "users_can_view_own_progress" ON public.playlist_progress;
DROP POLICY IF EXISTS "users_can_insert_own_progress" ON public.playlist_progress;
DROP POLICY IF EXISTS "users_can_update_own_progress" ON public.playlist_progress;
DROP POLICY IF EXISTS "users_can_delete_own_progress" ON public.playlist_progress;

-- Drop the foreign key constraint
ALTER TABLE public.playlist_progress DROP CONSTRAINT IF EXISTS playlist_progress_user_id_fkey;

-- Change user_id column from UUID to TEXT
ALTER TABLE public.playlist_progress ALTER COLUMN user_id TYPE TEXT;

-- Disable RLS since we're using NextAuth for authorization
-- Authorization will be handled in the API routes
ALTER TABLE public.playlist_progress DISABLE ROW LEVEL SECURITY;

-- Update the index to work with TEXT
DROP INDEX IF EXISTS idx_playlist_progress_user_id;
CREATE INDEX IF NOT EXISTS idx_playlist_progress_user_id ON public.playlist_progress(user_id);

-- Fix video_intervals table to accept NextAuth user IDs (strings) instead of UUIDs
-- Drop existing policies and constraints first
DROP POLICY IF EXISTS "users_can_view_own_intervals" ON public.video_intervals;
DROP POLICY IF EXISTS "users_can_insert_own_intervals" ON public.video_intervals;
DROP POLICY IF EXISTS "users_can_update_own_intervals" ON public.video_intervals;
DROP POLICY IF EXISTS "users_can_delete_own_intervals" ON public.video_intervals;

-- Drop the foreign key constraint
ALTER TABLE public.video_intervals DROP CONSTRAINT IF EXISTS video_intervals_user_id_fkey;

-- Change user_id column from UUID to TEXT
ALTER TABLE public.video_intervals ALTER COLUMN user_id TYPE TEXT;

-- Disable RLS since we're using NextAuth for authorization
-- Authorization will be handled in the API routes
ALTER TABLE public.video_intervals DISABLE ROW LEVEL SECURITY;

-- Update the index to work with TEXT
DROP INDEX IF EXISTS idx_video_intervals_user_id;
CREATE INDEX IF NOT EXISTS idx_video_intervals_user_id ON public.video_intervals(user_id);

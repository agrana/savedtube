-- Fix RLS policies for NextAuth setup
-- Since we're using NextAuth and not Supabase Auth, auth.uid() won't work
-- We need to disable RLS and handle authorization in the API layer

-- Drop existing policies
DROP POLICY IF EXISTS "users_can_view_own_progress" ON public.playlist_progress;
DROP POLICY IF EXISTS "users_can_insert_own_progress" ON public.playlist_progress;
DROP POLICY IF EXISTS "users_can_update_own_progress" ON public.playlist_progress;
DROP POLICY IF EXISTS "users_can_delete_own_progress" ON public.playlist_progress;

-- Disable RLS since we're handling authorization in the API layer with NextAuth
ALTER TABLE public.playlist_progress DISABLE ROW LEVEL SECURITY;

-- Add a comment explaining the security approach
COMMENT ON TABLE public.playlist_progress IS 'Authorization handled in API layer via NextAuth. RLS disabled to allow service role access.';

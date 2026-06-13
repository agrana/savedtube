-- Re-enable Row Level Security on critical tables with proper policies for NextAuth
-- This ensures data isolation even if API authorization fails

-- Re-enable RLS on playlist_progress table
ALTER TABLE public.playlist_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for playlist_progress using TEXT user_id (NextAuth format)
CREATE POLICY "users_can_view_own_progress" ON public.playlist_progress
    FOR SELECT USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "users_can_insert_own_progress" ON public.playlist_progress
    FOR INSERT WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "users_can_update_own_progress" ON public.playlist_progress
    FOR UPDATE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

CREATE POLICY "users_can_delete_own_progress" ON public.playlist_progress
    FOR DELETE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

-- hidden_playlists is created by a later historical migration in this repo.
-- Keep this migration valid for fresh databases by applying the hidden_playlists
-- RLS changes only when the table already exists.
DO $$
BEGIN
    IF to_regclass('public.hidden_playlists') IS NOT NULL THEN
        ALTER TABLE public.hidden_playlists ENABLE ROW LEVEL SECURITY;

        CREATE POLICY "users_can_view_own_hidden_playlists" ON public.hidden_playlists
            FOR SELECT USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

        CREATE POLICY "users_can_insert_own_hidden_playlists" ON public.hidden_playlists
            FOR INSERT WITH CHECK (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

        CREATE POLICY "users_can_delete_own_hidden_playlists" ON public.hidden_playlists
            FOR DELETE USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub');

        COMMENT ON TABLE public.hidden_playlists IS 'User playlist visibility preferences with RLS enabled. Authorization handled via NextAuth JWT claims.';
    END IF;
END;
$$;

-- Add comment explaining the security approach
COMMENT ON TABLE public.playlist_progress IS 'User progress tracking with RLS enabled. Authorization handled via NextAuth JWT claims.';

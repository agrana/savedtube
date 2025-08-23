-- Re-enable RLS for playlist_progress table with proper policies for NextAuth user IDs
-- Enable Row Level Security
ALTER TABLE public.playlist_progress ENABLE ROW LEVEL SECURITY;

-- Create policies for NextAuth user IDs (TEXT type)
-- Users can view their own progress
CREATE POLICY "users_can_view_own_progress" ON public.playlist_progress
    FOR SELECT
    USING (auth.uid()::text = user_id);

-- Users can insert their own progress
CREATE POLICY "users_can_insert_own_progress" ON public.playlist_progress
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Users can update their own progress
CREATE POLICY "users_can_update_own_progress" ON public.playlist_progress
    FOR UPDATE
    USING (auth.uid()::text = user_id)
    WITH CHECK (auth.uid()::text = user_id);

-- Users can delete their own progress
CREATE POLICY "users_can_delete_own_progress" ON public.playlist_progress
    FOR DELETE
    USING (auth.uid()::text = user_id);

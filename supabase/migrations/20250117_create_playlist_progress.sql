-- Create playlist progress tracking table
CREATE TABLE IF NOT EXISTS public.playlist_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    playlist_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    watched BOOLEAN DEFAULT false,
    watched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, playlist_id, video_id)
);

-- Enable RLS
ALTER TABLE public.playlist_progress ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "users_can_view_own_progress" ON public.playlist_progress
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_can_insert_own_progress" ON public.playlist_progress
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_can_update_own_progress" ON public.playlist_progress
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_can_delete_own_progress" ON public.playlist_progress
    FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_playlist_progress_user_id ON public.playlist_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_progress_playlist_id ON public.playlist_progress(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_progress_video_id ON public.playlist_progress(video_id);
CREATE INDEX IF NOT EXISTS idx_playlist_progress_watched ON public.playlist_progress(watched);

-- Add updated_at trigger
CREATE TRIGGER playlist_progress_updated_at 
    BEFORE UPDATE ON public.playlist_progress 
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_updated_at();

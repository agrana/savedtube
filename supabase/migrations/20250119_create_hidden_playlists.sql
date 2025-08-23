-- Create hidden_playlists table to track user playlist visibility preferences
CREATE TABLE IF NOT EXISTS public.hidden_playlists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  hidden_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique user-playlist combinations
  UNIQUE(user_id, playlist_id)
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_hidden_playlists_user_id ON public.hidden_playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_playlists_playlist_id ON public.hidden_playlists(playlist_id);

-- Add RLS policies
ALTER TABLE public.hidden_playlists ENABLE ROW LEVEL SECURITY;

-- Users can view their own hidden playlists
CREATE POLICY "users_can_view_own_hidden_playlists" ON public.hidden_playlists
    FOR SELECT
    USING (auth.uid()::text = user_id);

-- Users can insert their own hidden playlists
CREATE POLICY "users_can_insert_own_hidden_playlists" ON public.hidden_playlists
    FOR INSERT
    WITH CHECK (auth.uid()::text = user_id);

-- Users can delete their own hidden playlists (to unhide)
CREATE POLICY "users_can_delete_own_hidden_playlists" ON public.hidden_playlists
    FOR DELETE
    USING (auth.uid()::text = user_id);

-- Add comment
COMMENT ON TABLE public.hidden_playlists IS 'Tracks which playlists users have chosen to hide from their main view';

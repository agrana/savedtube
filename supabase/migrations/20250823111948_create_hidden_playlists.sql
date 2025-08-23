-- Create hidden_playlists table to track user playlist visibility preferences
-- Drop table if it exists (for clean slate)
DROP TABLE IF EXISTS public.hidden_playlists;

-- Create the table
CREATE TABLE public.hidden_playlists (
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
CREATE INDEX idx_hidden_playlists_user_id ON public.hidden_playlists(user_id);
CREATE INDEX idx_hidden_playlists_playlist_id ON public.hidden_playlists(playlist_id);

-- Disable RLS since we're using NextAuth for authorization
-- Authorization will be handled in the API routes
ALTER TABLE public.hidden_playlists DISABLE ROW LEVEL SECURITY;

-- Add comment
COMMENT ON TABLE public.hidden_playlists IS 'Tracks which playlists users have chosen to hide from their main view. Authorization handled in API layer via NextAuth.';

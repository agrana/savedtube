-- Persist per-user edits for playlist items coming from YouTube
CREATE TABLE IF NOT EXISTS public.playlist_item_edits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  playlist_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  custom_order INTEGER,
  removed BOOLEAN NOT NULL DEFAULT FALSE,
  added_by_user BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, playlist_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_item_edits_user_id
  ON public.playlist_item_edits(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_edits_playlist_id
  ON public.playlist_item_edits(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_edits_user_playlist
  ON public.playlist_item_edits(user_id, playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_item_edits_custom_order
  ON public.playlist_item_edits(user_id, playlist_id, custom_order);

-- Authorization is enforced in API routes with NextAuth session checks
ALTER TABLE public.playlist_item_edits DISABLE ROW LEVEL SECURITY;

CREATE TRIGGER playlist_item_edits_updated_at
  BEFORE UPDATE ON public.playlist_item_edits
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.playlist_item_edits IS 'Per-user playlist video edits: soft remove, custom order, and manually added videos.';

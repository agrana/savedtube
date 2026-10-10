-- Soft-dismiss for authenticated path videos.
-- Additive only. Preserves path_videos membership, path_video_progress, and
-- video_intervals. Deny-by-default RLS; service_role from Next.js after
-- NextAuth ownership checks.
-- broader_feedback marks a dismissal for later review only; it does not
-- activate a global rule.

-- ---------------------------------------------------------------------------
-- path_video_dismissals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_video_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  path_id UUID NOT NULL REFERENCES public.paths (id) ON DELETE CASCADE,
  path_video_id UUID NOT NULL REFERENCES public.path_videos (id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  broader_feedback BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_video_dismissals_owner_not_blank CHECK (
    char_length(trim(owner)) > 0
  ),
  CONSTRAINT path_video_dismissals_youtube_id_format CHECK (
    youtube_video_id ~ '^[a-zA-Z0-9_-]{11}$'
  ),
  CONSTRAINT path_video_dismissals_reason_valid CHECK (
    reason IN (
      'too_easy',
      'too_hard',
      'poor_quality',
      'not_relevant',
      'duplicate',
      'outdated',
      'wrong_language',
      'already_known',
      'other'
    )
  ),
  CONSTRAINT path_video_dismissals_undismissed_after_dismissed CHECK (
    undismissed_at IS NULL OR undismissed_at >= dismissed_at
  )
);

-- Active dismissal identity: at most one undismissed row per owner + path video.
-- Restored rows (undismissed_at IS NOT NULL) remain for audit; a later dismiss
-- may insert a new active row.
CREATE UNIQUE INDEX IF NOT EXISTS path_video_dismissals_one_active_per_owner_video
  ON public.path_video_dismissals (owner, path_video_id)
  WHERE undismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_path_video_dismissals_owner_path_active
  ON public.path_video_dismissals (owner, path_id)
  WHERE undismissed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_path_video_dismissals_owner_path_video
  ON public.path_video_dismissals (owner, path_video_id, dismissed_at DESC);

DROP TRIGGER IF EXISTS path_video_dismissals_handle_updated_at
  ON public.path_video_dismissals;
CREATE TRIGGER path_video_dismissals_handle_updated_at
  BEFORE UPDATE ON public.path_video_dismissals
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_video_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_video_dismissals FROM PUBLIC;
REVOKE ALL ON TABLE public.path_video_dismissals FROM anon;
REVOKE ALL ON TABLE public.path_video_dismissals FROM authenticated;
GRANT ALL ON TABLE public.path_video_dismissals TO service_role;

COMMENT ON TABLE public.path_video_dismissals IS
  'Soft-dismiss records for owned path videos. Active when undismissed_at IS NULL. Preserves path membership, progress, and shared video_intervals. broader_feedback queues review only (does not activate global rules). RLS deny-by-default; service_role after NextAuth ownership checks.';

-- Additive: learning paths owned by NextAuth session.user.id (TEXT).
-- Deny-by-default RLS; service_role used from Next.js API routes after session checks.
-- Future path-owned tables (revisions, stages, videos, jobs, progress) MUST reference
-- paths(id) ON DELETE CASCADE so path deletion removes dependent path data.
-- Shared per-video loops (video_intervals) must NOT FK to paths and must survive path deletion.

CREATE TABLE IF NOT EXISTS public.paths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  goal TEXT NOT NULL,
  background TEXT,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paths_owner_not_blank CHECK (char_length(trim(owner)) > 0),
  CONSTRAINT paths_goal_length CHECK (
    char_length(goal) >= 1 AND char_length(goal) <= 500
  ),
  CONSTRAINT paths_background_length CHECK (
    background IS NULL OR char_length(background) <= 2000
  ),
  CONSTRAINT paths_title_length CHECK (
    char_length(title) >= 1 AND char_length(title) <= 200
  )
);

CREATE INDEX IF NOT EXISTS idx_paths_owner_created_at
  ON public.paths (owner, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_paths_owner_id
  ON public.paths (owner, id);

DROP TRIGGER IF EXISTS paths_handle_updated_at ON public.paths;
CREATE TRIGGER paths_handle_updated_at
  BEFORE UPDATE ON public.paths
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.paths ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.paths FROM PUBLIC;
REVOKE ALL ON TABLE public.paths FROM anon;
REVOKE ALL ON TABLE public.paths FROM authenticated;
GRANT ALL ON TABLE public.paths TO service_role;

COMMENT ON TABLE public.paths IS
  'Private learning paths. RLS enabled with no client policies (deny-by-default). Access via service_role from Next.js API routes after NextAuth session checks. Child path tables should ON DELETE CASCADE; video_intervals must not reference paths.';

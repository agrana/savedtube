-- Broader-feedback review candidates (pipeline slice 1).
-- Additive only. Linked to path_video_dismissals. Candidates stay inactive for
-- path generation and do not activate global rules. Model assessment is a later slice.
-- Deny-by-default RLS; service_role from Next.js after NextAuth ownership checks.

-- ---------------------------------------------------------------------------
-- path_video_dismissal_review_candidates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_video_dismissal_review_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dismissal_id UUID NOT NULL REFERENCES public.path_video_dismissals (id) ON DELETE CASCADE,
  -- Source snapshots copied from the originating active dismissal.
  owner TEXT NOT NULL,
  path_id UUID NOT NULL REFERENCES public.paths (id) ON DELETE CASCADE,
  path_video_id UUID NOT NULL REFERENCES public.path_videos (id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  -- Deterministic initial evidence: one supporting report (the dismissal), zero opposing.
  supporting_evidence_count INTEGER NOT NULL DEFAULT 1,
  contradicting_evidence_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assessed_at TIMESTAMPTZ,
  -- Reviewer / model provenance (nullable until a later assessment slice).
  reviewer_id TEXT,
  model_id TEXT,
  assessment_notes TEXT,
  CONSTRAINT path_video_dismissal_review_candidates_owner_not_blank CHECK (
    char_length(trim(owner)) > 0
  ),
  CONSTRAINT path_video_dismissal_review_candidates_youtube_id_format CHECK (
    youtube_video_id ~ '^[a-zA-Z0-9_-]{11}$'
  ),
  CONSTRAINT path_video_dismissal_review_candidates_reason_valid CHECK (
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
  CONSTRAINT path_video_dismissal_review_candidates_status_valid CHECK (
    status IN (
      'pending',
      'assessing',
      'approved',
      'rejected',
      'quarantined',
      'retired'
    )
  ),
  CONSTRAINT path_video_dismissal_review_candidates_supporting_nonneg CHECK (
    supporting_evidence_count >= 0
  ),
  CONSTRAINT path_video_dismissal_review_candidates_contradicting_nonneg CHECK (
    contradicting_evidence_count >= 0
  ),
  CONSTRAINT path_video_dismissal_review_candidates_assessed_after_created CHECK (
    assessed_at IS NULL OR assessed_at >= created_at
  )
);

-- One candidate per originating dismissal (idempotent broader-feedback queue).
CREATE UNIQUE INDEX IF NOT EXISTS path_video_dismissal_review_candidates_one_per_dismissal
  ON public.path_video_dismissal_review_candidates (dismissal_id);

CREATE INDEX IF NOT EXISTS idx_path_video_dismissal_review_candidates_owner_created
  ON public.path_video_dismissal_review_candidates (owner, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_path_video_dismissal_review_candidates_owner_status
  ON public.path_video_dismissal_review_candidates (owner, status);

CREATE INDEX IF NOT EXISTS idx_path_video_dismissal_review_candidates_path
  ON public.path_video_dismissal_review_candidates (path_id, created_at DESC);

DROP TRIGGER IF EXISTS path_video_dismissal_review_candidates_handle_updated_at
  ON public.path_video_dismissal_review_candidates;
CREATE TRIGGER path_video_dismissal_review_candidates_handle_updated_at
  BEFORE UPDATE ON public.path_video_dismissal_review_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_video_dismissal_review_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_video_dismissal_review_candidates FROM PUBLIC;
REVOKE ALL ON TABLE public.path_video_dismissal_review_candidates FROM anon;
REVOKE ALL ON TABLE public.path_video_dismissal_review_candidates FROM authenticated;
GRANT ALL ON TABLE public.path_video_dismissal_review_candidates TO service_role;

COMMENT ON TABLE public.path_video_dismissal_review_candidates IS
  'Broader-feedback review queue for soft-dismissals. Inactive for path generation; does not activate global rules. RLS deny-by-default; service_role after NextAuth ownership checks.';

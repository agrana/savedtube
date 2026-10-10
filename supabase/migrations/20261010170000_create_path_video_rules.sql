-- Executable global-rule registry (pipeline slice: reviewer activation only).
-- Additive only. Rules are not read by path generation or soft-dismiss filters yet.
-- Closed structured predicates only (no free-text operators). Deny-by-default RLS;
-- service_role from Next.js after requireApiReviewerSession.

-- ---------------------------------------------------------------------------
-- path_video_rules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_video_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_candidate_id UUID NOT NULL
    REFERENCES public.path_video_dismissal_review_candidates (id) ON DELETE RESTRICT,
  rule_key TEXT NOT NULL,
  target_type TEXT NOT NULL,
  operator TEXT NOT NULL DEFAULT 'equals',
  value TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'exclude',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  activated_by TEXT,
  activated_at TIMESTAMPTZ,
  review_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_video_rules_rule_key_not_blank CHECK (
    char_length(trim(rule_key)) > 0
  ),
  CONSTRAINT path_video_rules_rule_key_format CHECK (
    rule_key ~ '^[a-z0-9][a-z0-9._:-]{0,127}$'
  ),
  CONSTRAINT path_video_rules_target_type_valid CHECK (
    target_type IN ('video', 'creator', 'topic', 'language', 'difficulty')
  ),
  CONSTRAINT path_video_rules_operator_equals_only CHECK (
    operator = 'equals'
  ),
  CONSTRAINT path_video_rules_value_not_blank CHECK (
    char_length(trim(value)) > 0
  ),
  CONSTRAINT path_video_rules_value_max_length CHECK (
    char_length(value) <= 300
  ),
  CONSTRAINT path_video_rules_action_exclude_only CHECK (
    action = 'exclude'
  ),
  CONSTRAINT path_video_rules_reason_not_blank CHECK (
    char_length(trim(reason)) > 0
  ),
  CONSTRAINT path_video_rules_reason_max_length CHECK (
    char_length(reason) <= 500
  ),
  CONSTRAINT path_video_rules_status_valid CHECK (
    status IN ('draft', 'active', 'suspended', 'retired')
  ),
  CONSTRAINT path_video_rules_version_positive CHECK (
    version >= 1
  ),
  CONSTRAINT path_video_rules_activation_provenance CHECK (
    (
      status = 'active'
      AND activated_by IS NOT NULL
      AND char_length(trim(activated_by)) > 0
      AND activated_at IS NOT NULL
    )
    OR (
      status <> 'active'
      AND (
        (activated_by IS NULL AND activated_at IS NULL)
        OR (
          activated_by IS NOT NULL
          AND char_length(trim(activated_by)) > 0
          AND activated_at IS NOT NULL
        )
      )
    )
  ),
  CONSTRAINT path_video_rules_activated_after_created CHECK (
    activated_at IS NULL OR activated_at >= created_at
  ),
  CONSTRAINT path_video_rules_review_due_after_created CHECK (
    review_due_at IS NULL OR review_due_at >= created_at
  )
);

-- Immutable identity of a versioned rule key.
CREATE UNIQUE INDEX IF NOT EXISTS path_video_rules_rule_key_version_unique
  ON public.path_video_rules (rule_key, version);

-- At most one active executable rule per rule_key.
CREATE UNIQUE INDEX IF NOT EXISTS path_video_rules_one_active_per_rule_key
  ON public.path_video_rules (rule_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_path_video_rules_source_candidate
  ON public.path_video_rules (source_candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_path_video_rules_status_created
  ON public.path_video_rules (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_path_video_rules_review_due
  ON public.path_video_rules (review_due_at)
  WHERE review_due_at IS NOT NULL AND status = 'active';

DROP TRIGGER IF EXISTS path_video_rules_handle_updated_at
  ON public.path_video_rules;
CREATE TRIGGER path_video_rules_handle_updated_at
  BEFORE UPDATE ON public.path_video_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_video_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_video_rules FROM PUBLIC;
REVOKE ALL ON TABLE public.path_video_rules FROM anon;
REVOKE ALL ON TABLE public.path_video_rules FROM authenticated;
GRANT ALL ON TABLE public.path_video_rules TO service_role;

COMMENT ON TABLE public.path_video_rules IS
  'Executable global-rule registry with closed structured predicates. Activated only by allowlisted reviewers; not wired into path generation in this slice. RLS deny-by-default; service_role after requireApiReviewerSession.';

-- Slice 7: stage completion version + one stored follow-up per version.
-- Additive only. Deny-by-default RLS; service_role from Next.js after session checks.
-- Follow-ups are keyed by (owner, path_stage_id, completion_version) so edits/new
-- revisions cannot silently attach old feedback to new content.

-- ---------------------------------------------------------------------------
-- Path stage progress: completion version (revision edit_version at complete)
-- ---------------------------------------------------------------------------
ALTER TABLE public.path_stage_progress
  ADD COLUMN IF NOT EXISTS completion_version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'path_stage_progress_completion_version_positive'
  ) THEN
    ALTER TABLE public.path_stage_progress
      ADD CONSTRAINT path_stage_progress_completion_version_positive
      CHECK (completion_version >= 1);
  END IF;
END;
$$;

COMMENT ON COLUMN public.path_stage_progress.completion_version IS
  'Revision edit_version captured at explicit stage completion. Ties follow-up to content state.';

-- ---------------------------------------------------------------------------
-- stage_followups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stage_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  path_id UUID NOT NULL REFERENCES public.paths (id) ON DELETE CASCADE,
  path_stage_id UUID NOT NULL REFERENCES public.path_stages (id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.path_revisions (id) ON DELETE CASCADE,
  completion_version INTEGER NOT NULL,
  reflection TEXT,
  practiced_summary TEXT NOT NULL,
  encouragement TEXT NOT NULL,
  next_step TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stage_followups_owner_not_blank CHECK (char_length(trim(owner)) > 0),
  CONSTRAINT stage_followups_completion_version_positive CHECK (completion_version >= 1),
  CONSTRAINT stage_followups_reflection_length CHECK (
    reflection IS NULL OR char_length(reflection) <= 2000
  ),
  CONSTRAINT stage_followups_practiced_summary_length CHECK (
    char_length(practiced_summary) >= 1 AND char_length(practiced_summary) <= 1000
  ),
  CONSTRAINT stage_followups_encouragement_length CHECK (
    char_length(encouragement) >= 1 AND char_length(encouragement) <= 1000
  ),
  CONSTRAINT stage_followups_next_step_length CHECK (
    char_length(next_step) >= 1 AND char_length(next_step) <= 1000
  ),
  CONSTRAINT stage_followups_source_valid CHECK (source IN ('model', 'template')),
  CONSTRAINT stage_followups_owner_stage_version_unique UNIQUE (
    owner,
    path_stage_id,
    completion_version
  )
);

CREATE INDEX IF NOT EXISTS idx_stage_followups_owner_path
  ON public.stage_followups (owner, path_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stage_followups_stage_version
  ON public.stage_followups (path_stage_id, completion_version);

CREATE INDEX IF NOT EXISTS idx_stage_followups_revision
  ON public.stage_followups (revision_id);

DROP TRIGGER IF EXISTS stage_followups_handle_updated_at ON public.stage_followups;
CREATE TRIGGER stage_followups_handle_updated_at
  BEFORE UPDATE ON public.stage_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.stage_followups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stage_followups FROM PUBLIC;
REVOKE ALL ON TABLE public.stage_followups FROM anon;
REVOKE ALL ON TABLE public.stage_followups FROM authenticated;
GRANT ALL ON TABLE public.stage_followups TO service_role;

COMMENT ON TABLE public.stage_followups IS
  'At most one follow-up per owner/stage/completion_version. RLS deny-by-default; service_role after NextAuth ownership checks.';

-- ---------------------------------------------------------------------------
-- Transactional complete + persist follow-up (idempotent on version)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.persist_stage_completion_followup(
  p_path_id UUID,
  p_owner TEXT,
  p_stage_id UUID,
  p_reflection TEXT,
  p_practiced_summary TEXT,
  p_encouragement TEXT,
  p_next_step TEXT,
  p_source TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path public.paths%ROWTYPE;
  v_revision public.path_revisions%ROWTYPE;
  v_stage public.path_stages%ROWTYPE;
  v_progress public.path_stage_progress%ROWTYPE;
  v_followup public.stage_followups%ROWTYPE;
  v_reflection TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_owner IS NULL OR char_length(trim(p_owner)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('model', 'template') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  IF p_practiced_summary IS NULL OR char_length(trim(p_practiced_summary)) < 1
     OR char_length(trim(p_encouragement)) < 1
     OR char_length(trim(p_next_step)) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  SELECT * INTO v_path
  FROM public.paths
  WHERE id = p_path_id
  FOR UPDATE;

  IF NOT FOUND OR v_path.owner IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_path.active_revision_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_active_revision');
  END IF;

  SELECT * INTO v_revision
  FROM public.path_revisions
  WHERE id = v_path.active_revision_id
    AND path_id = p_path_id
  FOR UPDATE;

  IF NOT FOUND OR v_revision.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_active_revision');
  END IF;

  SELECT * INTO v_stage
  FROM public.path_stages
  WHERE id = p_stage_id
    AND revision_id = v_revision.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
  END IF;

  v_reflection := NULLIF(trim(COALESCE(p_reflection, '')), '');
  IF v_reflection IS NOT NULL AND char_length(v_reflection) > 2000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  -- Idempotent: same owner/stage/completion_version returns the stored follow-up.
  SELECT * INTO v_followup
  FROM public.stage_followups
  WHERE owner = p_owner
    AND path_stage_id = p_stage_id
    AND completion_version = v_revision.edit_version
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_progress
    FROM public.path_stage_progress
    WHERE owner = p_owner
      AND path_stage_id = p_stage_id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'completion_version', v_revision.edit_version,
      'revision_id', v_revision.id,
      'progress', jsonb_build_object(
        'id', v_progress.id,
        'owner', v_progress.owner,
        'path_stage_id', v_progress.path_stage_id,
        'completed_at', v_progress.completed_at,
        'reflection', v_progress.reflection,
        'completion_version', v_progress.completion_version,
        'created_at', v_progress.created_at,
        'updated_at', v_progress.updated_at
      ),
      'followup', jsonb_build_object(
        'id', v_followup.id,
        'owner', v_followup.owner,
        'path_id', v_followup.path_id,
        'path_stage_id', v_followup.path_stage_id,
        'revision_id', v_followup.revision_id,
        'completion_version', v_followup.completion_version,
        'reflection', v_followup.reflection,
        'practiced_summary', v_followup.practiced_summary,
        'encouragement', v_followup.encouragement,
        'next_step', v_followup.next_step,
        'source', v_followup.source,
        'created_at', v_followup.created_at,
        'updated_at', v_followup.updated_at
      )
    );
  END IF;

  INSERT INTO public.path_stage_progress (
    owner,
    path_stage_id,
    completed_at,
    reflection,
    completion_version
  )
  VALUES (
    p_owner,
    p_stage_id,
    v_now,
    v_reflection,
    v_revision.edit_version
  )
  ON CONFLICT (owner, path_stage_id) DO UPDATE
    SET completed_at = EXCLUDED.completed_at,
        reflection = EXCLUDED.reflection,
        completion_version = EXCLUDED.completion_version
  RETURNING * INTO v_progress;

  INSERT INTO public.stage_followups (
    owner,
    path_id,
    path_stage_id,
    revision_id,
    completion_version,
    reflection,
    practiced_summary,
    encouragement,
    next_step,
    source
  )
  VALUES (
    p_owner,
    p_path_id,
    p_stage_id,
    v_revision.id,
    v_revision.edit_version,
    v_reflection,
    LEFT(trim(p_practiced_summary), 1000),
    LEFT(trim(p_encouragement), 1000),
    LEFT(trim(p_next_step), 1000),
    p_source
  )
  ON CONFLICT (owner, path_stage_id, completion_version) DO NOTHING
  RETURNING * INTO v_followup;

  IF v_followup.id IS NULL THEN
    SELECT * INTO v_followup
    FROM public.stage_followups
    WHERE owner = p_owner
      AND path_stage_id = p_stage_id
      AND completion_version = v_revision.edit_version;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'completion_version', v_revision.edit_version,
    'revision_id', v_revision.id,
    'progress', jsonb_build_object(
      'id', v_progress.id,
      'owner', v_progress.owner,
      'path_stage_id', v_progress.path_stage_id,
      'completed_at', v_progress.completed_at,
      'reflection', v_progress.reflection,
      'completion_version', v_progress.completion_version,
      'created_at', v_progress.created_at,
      'updated_at', v_progress.updated_at
    ),
    'followup', jsonb_build_object(
      'id', v_followup.id,
      'owner', v_followup.owner,
      'path_id', v_followup.path_id,
      'path_stage_id', v_followup.path_stage_id,
      'revision_id', v_followup.revision_id,
      'completion_version', v_followup.completion_version,
      'reflection', v_followup.reflection,
      'practiced_summary', v_followup.practiced_summary,
      'encouragement', v_followup.encouragement,
      'next_step', v_followup.next_step,
      'source', v_followup.source,
      'created_at', v_followup.created_at,
      'updated_at', v_followup.updated_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.persist_stage_completion_followup(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_stage_completion_followup(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.persist_stage_completion_followup(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.persist_stage_completion_followup(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.persist_stage_completion_followup(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT
) IS
  'Atomically complete an owned active-revision stage and persist at most one follow-up per completion_version.';

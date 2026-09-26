-- Slice 2: researched path persistence (revisions, stages, videos, jobs, usage).
-- Additive only. Deny-by-default RLS; service_role from Next.js after session checks.
-- Shared video_intervals must NOT reference paths and are unchanged.

-- ---------------------------------------------------------------------------
-- path_revisions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id UUID NOT NULL REFERENCES public.paths (id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  edit_version INTEGER NOT NULL DEFAULT 1,
  input_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_revisions_revision_number_positive CHECK (revision_number >= 1),
  CONSTRAINT path_revisions_edit_version_positive CHECK (edit_version >= 1),
  CONSTRAINT path_revisions_status_valid CHECK (
    status IN ('draft', 'active', 'archived')
  ),
  CONSTRAINT path_revisions_path_revision_unique UNIQUE (path_id, revision_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS path_revisions_one_active_per_path
  ON public.path_revisions (path_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_path_revisions_path_id
  ON public.path_revisions (path_id, created_at DESC);

DROP TRIGGER IF EXISTS path_revisions_handle_updated_at ON public.path_revisions;
CREATE TRIGGER path_revisions_handle_updated_at
  BEFORE UPDATE ON public.path_revisions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_revisions FROM PUBLIC;
REVOKE ALL ON TABLE public.path_revisions FROM anon;
REVOKE ALL ON TABLE public.path_revisions FROM authenticated;
GRANT ALL ON TABLE public.path_revisions TO service_role;

COMMENT ON TABLE public.path_revisions IS
  'Versioned path content. RLS deny-by-default; access via service_role after NextAuth checks.';

-- Active revision pointer on paths (nullable until first successful research).
ALTER TABLE public.paths
  ADD COLUMN IF NOT EXISTS active_revision_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'paths_active_revision_id_fkey'
  ) THEN
    ALTER TABLE public.paths
      ADD CONSTRAINT paths_active_revision_id_fkey
      FOREIGN KEY (active_revision_id)
      REFERENCES public.path_revisions (id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_paths_active_revision_id
  ON public.paths (active_revision_id)
  WHERE active_revision_id IS NOT NULL;

-- Ensure active_revision_id always belongs to the same path.
CREATE OR REPLACE FUNCTION public.enforce_paths_active_revision_belongs()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.active_revision_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.path_revisions r
    WHERE r.id = NEW.active_revision_id
      AND r.path_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'active_revision_id must reference a revision of the same path';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paths_enforce_active_revision ON public.paths;
CREATE TRIGGER paths_enforce_active_revision
  BEFORE INSERT OR UPDATE OF active_revision_id ON public.paths
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_paths_active_revision_belongs();

REVOKE ALL ON FUNCTION public.enforce_paths_active_revision_belongs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_paths_active_revision_belongs() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_paths_active_revision_belongs() FROM authenticated;

-- ---------------------------------------------------------------------------
-- path_stages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id UUID NOT NULL REFERENCES public.path_revisions (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  learning_objective TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_stages_position_nonnegative CHECK (position >= 0),
  CONSTRAINT path_stages_title_length CHECK (
    char_length(title) >= 1 AND char_length(title) <= 200
  ),
  CONSTRAINT path_stages_objective_length CHECK (
    char_length(learning_objective) >= 1 AND char_length(learning_objective) <= 1000
  ),
  CONSTRAINT path_stages_reason_length CHECK (
    char_length(reason) >= 1 AND char_length(reason) <= 1000
  ),
  CONSTRAINT path_stages_revision_position_unique UNIQUE (revision_id, position)
);

CREATE INDEX IF NOT EXISTS idx_path_stages_revision_position
  ON public.path_stages (revision_id, position);

DROP TRIGGER IF EXISTS path_stages_handle_updated_at ON public.path_stages;
CREATE TRIGGER path_stages_handle_updated_at
  BEFORE UPDATE ON public.path_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_stages FROM PUBLIC;
REVOKE ALL ON TABLE public.path_stages FROM anon;
REVOKE ALL ON TABLE public.path_stages FROM authenticated;
GRANT ALL ON TABLE public.path_stages TO service_role;

COMMENT ON TABLE public.path_stages IS
  'Ordered stages within a path revision. Cascades with revision/path deletion.';

-- ---------------------------------------------------------------------------
-- path_videos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id UUID NOT NULL REFERENCES public.path_stages (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_title TEXT,
  selection_reason TEXT NOT NULL,
  source TEXT NOT NULL,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  verified_at TIMESTAMPTZ NOT NULL,
  metadata_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_videos_position_nonnegative CHECK (position >= 0),
  CONSTRAINT path_videos_youtube_id_format CHECK (
    youtube_video_id ~ '^[a-zA-Z0-9_-]{11}$'
  ),
  CONSTRAINT path_videos_title_length CHECK (
    char_length(title) >= 1 AND char_length(title) <= 300
  ),
  CONSTRAINT path_videos_selection_reason_length CHECK (
    char_length(selection_reason) >= 1 AND char_length(selection_reason) <= 1000
  ),
  CONSTRAINT path_videos_source_valid CHECK (source IN ('research', 'manual')),
  CONSTRAINT path_videos_duration_nonnegative CHECK (
    duration_seconds IS NULL OR duration_seconds >= 0
  ),
  CONSTRAINT path_videos_stage_position_unique UNIQUE (stage_id, position)
);

CREATE INDEX IF NOT EXISTS idx_path_videos_stage_position
  ON public.path_videos (stage_id, position);

CREATE INDEX IF NOT EXISTS idx_path_videos_youtube_video_id
  ON public.path_videos (youtube_video_id);

DROP TRIGGER IF EXISTS path_videos_handle_updated_at ON public.path_videos;
CREATE TRIGGER path_videos_handle_updated_at
  BEFORE UPDATE ON public.path_videos
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_videos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_videos FROM PUBLIC;
REVOKE ALL ON TABLE public.path_videos FROM anon;
REVOKE ALL ON TABLE public.path_videos FROM authenticated;
GRANT ALL ON TABLE public.path_videos TO service_role;

COMMENT ON TABLE public.path_videos IS
  'Verified YouTube videos on a stage. No FK to video_intervals; loops stay shared per user/video.';

-- ---------------------------------------------------------------------------
-- path_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  path_id UUID NOT NULL REFERENCES public.paths (id) ON DELETE CASCADE,
  revision_id UUID REFERENCES public.path_revisions (id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  deadline_at TIMESTAMPTZ NOT NULL,
  input_snapshot JSONB NOT NULL,
  prompt_version TEXT,
  schema_version TEXT,
  model_provider TEXT,
  model_name TEXT,
  result JSONB,
  error JSONB,
  usage JSONB,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_jobs_owner_not_blank CHECK (char_length(trim(owner)) > 0),
  CONSTRAINT path_jobs_kind_valid CHECK (kind IN ('research')),
  CONSTRAINT path_jobs_status_valid CHECK (
    status IN (
      'queued',
      'running',
      'succeeded',
      'partial',
      'failed',
      'interrupted'
    )
  ),
  CONSTRAINT path_jobs_phase_valid CHECK (
    phase IN (
      'accepted',
      'planning',
      'searching',
      'selecting',
      'saving',
      'done'
    )
  ),
  CONSTRAINT path_jobs_attempt_positive CHECK (attempt >= 1),
  CONSTRAINT path_jobs_idempotency_key_length CHECK (
    char_length(idempotency_key) >= 8 AND char_length(idempotency_key) <= 128
  ),
  CONSTRAINT path_jobs_owner_idempotency_unique UNIQUE (owner, idempotency_key)
);

-- At most one in-flight research job per path (idempotent retries reuse that row).
CREATE UNIQUE INDEX IF NOT EXISTS path_jobs_one_active_research_per_path
  ON public.path_jobs (path_id)
  WHERE kind = 'research' AND status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_path_jobs_path_created
  ON public.path_jobs (path_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_path_jobs_owner_created
  ON public.path_jobs (owner, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_path_jobs_status_deadline
  ON public.path_jobs (status, deadline_at)
  WHERE status IN ('queued', 'running');

DROP TRIGGER IF EXISTS path_jobs_handle_updated_at ON public.path_jobs;
CREATE TRIGGER path_jobs_handle_updated_at
  BEFORE UPDATE ON public.path_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.path_jobs FROM anon;
REVOKE ALL ON TABLE public.path_jobs FROM authenticated;
GRANT ALL ON TABLE public.path_jobs TO service_role;

COMMENT ON TABLE public.path_jobs IS
  'Generation attempts (research). Store versions, phases, bounded errors/usage — never tokens/secrets.';

-- ---------------------------------------------------------------------------
-- generation_usage (atomic daily reservations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generation_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  reserved_units INTEGER NOT NULL DEFAULT 0,
  consumed_units INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT generation_usage_scope_type_valid CHECK (
    scope_type IN ('user', 'project')
  ),
  CONSTRAINT generation_usage_scope_key_not_blank CHECK (
    char_length(trim(scope_key)) > 0
  ),
  CONSTRAINT generation_usage_reserved_nonnegative CHECK (reserved_units >= 0),
  CONSTRAINT generation_usage_consumed_nonnegative CHECK (consumed_units >= 0),
  CONSTRAINT generation_usage_consumed_lte_reserved CHECK (
    consumed_units <= reserved_units
  ),
  CONSTRAINT generation_usage_scope_period_unique UNIQUE (
    scope_type,
    scope_key,
    period_start
  )
);

CREATE INDEX IF NOT EXISTS idx_generation_usage_scope_period
  ON public.generation_usage (scope_type, scope_key, period_start);

DROP TRIGGER IF EXISTS generation_usage_handle_updated_at ON public.generation_usage;
CREATE TRIGGER generation_usage_handle_updated_at
  BEFORE UPDATE ON public.generation_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.generation_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.generation_usage FROM PUBLIC;
REVOKE ALL ON TABLE public.generation_usage FROM anon;
REVOKE ALL ON TABLE public.generation_usage FROM authenticated;
GRANT ALL ON TABLE public.generation_usage TO service_role;

COMMENT ON TABLE public.generation_usage IS
  'Atomic per-user/project generation budget reservations. No client access.';

-- ---------------------------------------------------------------------------
-- Narrowly scoped RPCs (service_role only)
-- ---------------------------------------------------------------------------

-- Reserve daily budget units for user + project before provider calls.
CREATE OR REPLACE FUNCTION public.reserve_generation_budget(
  p_owner TEXT,
  p_user_limit INTEGER,
  p_project_limit INTEGER,
  p_units INTEGER DEFAULT 1,
  p_project_key TEXT DEFAULT 'project'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := (timezone('utc', now()))::date;
  v_user_row public.generation_usage%ROWTYPE;
  v_project_row public.generation_usage%ROWTYPE;
BEGIN
  IF p_owner IS NULL OR char_length(trim(p_owner)) = 0 THEN
    RAISE EXCEPTION 'owner required';
  END IF;
  IF p_units IS NULL OR p_units < 1 THEN
    RAISE EXCEPTION 'units must be >= 1';
  END IF;
  IF p_user_limit IS NULL OR p_user_limit < 0 OR p_project_limit IS NULL OR p_project_limit < 0 THEN
    RAISE EXCEPTION 'limits must be >= 0';
  END IF;

  INSERT INTO public.generation_usage (scope_type, scope_key, period_start)
  VALUES ('user', p_owner, v_period)
  ON CONFLICT (scope_type, scope_key, period_start) DO NOTHING;

  INSERT INTO public.generation_usage (scope_type, scope_key, period_start)
  VALUES ('project', p_project_key, v_period)
  ON CONFLICT (scope_type, scope_key, period_start) DO NOTHING;

  SELECT * INTO v_user_row
  FROM public.generation_usage
  WHERE scope_type = 'user' AND scope_key = p_owner AND period_start = v_period
  FOR UPDATE;

  SELECT * INTO v_project_row
  FROM public.generation_usage
  WHERE scope_type = 'project' AND scope_key = p_project_key AND period_start = v_period
  FOR UPDATE;

  IF v_user_row.reserved_units + p_units > p_user_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'user_budget_exhausted',
      'period_start', v_period,
      'user_reserved', v_user_row.reserved_units,
      'project_reserved', v_project_row.reserved_units
    );
  END IF;

  IF v_project_row.reserved_units + p_units > p_project_limit THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'project_budget_exhausted',
      'period_start', v_period,
      'user_reserved', v_user_row.reserved_units,
      'project_reserved', v_project_row.reserved_units
    );
  END IF;

  UPDATE public.generation_usage
  SET reserved_units = reserved_units + p_units
  WHERE id = v_user_row.id;

  UPDATE public.generation_usage
  SET reserved_units = reserved_units + p_units
  WHERE id = v_project_row.id;

  RETURN jsonb_build_object(
    'ok', true,
    'period_start', v_period,
    'units', p_units,
    'user_reserved', v_user_row.reserved_units + p_units,
    'project_reserved', v_project_row.reserved_units + p_units
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_generation_budget(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_generation_budget(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
  FROM anon;
REVOKE ALL ON FUNCTION public.reserve_generation_budget(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_generation_budget(TEXT, INTEGER, INTEGER, INTEGER, TEXT)
  TO service_role;

-- Mark reserved units as consumed after a billed attempt finishes (success or failure after start).
CREATE OR REPLACE FUNCTION public.consume_generation_budget(
  p_owner TEXT,
  p_units INTEGER DEFAULT 1,
  p_project_key TEXT DEFAULT 'project',
  p_period_start DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := COALESCE(p_period_start, (timezone('utc', now()))::date);
BEGIN
  UPDATE public.generation_usage
  SET consumed_units = LEAST(reserved_units, consumed_units + p_units)
  WHERE scope_type = 'user' AND scope_key = p_owner AND period_start = v_period;

  UPDATE public.generation_usage
  SET consumed_units = LEAST(reserved_units, consumed_units + p_units)
  WHERE scope_type = 'project' AND scope_key = p_project_key AND period_start = v_period;

  RETURN jsonb_build_object('ok', true, 'period_start', v_period, 'units', p_units);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_generation_budget(TEXT, INTEGER, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_generation_budget(TEXT, INTEGER, TEXT, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.consume_generation_budget(TEXT, INTEGER, TEXT, DATE)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_generation_budget(TEXT, INTEGER, TEXT, DATE)
  TO service_role;

-- Release a reservation that was never started (insert race / claim abort).
CREATE OR REPLACE FUNCTION public.release_generation_budget(
  p_owner TEXT,
  p_units INTEGER DEFAULT 1,
  p_project_key TEXT DEFAULT 'project',
  p_period_start DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period DATE := COALESCE(p_period_start, (timezone('utc', now()))::date);
BEGIN
  IF p_owner IS NULL OR char_length(trim(p_owner)) = 0 THEN
    RAISE EXCEPTION 'owner required';
  END IF;
  IF p_units IS NULL OR p_units < 1 THEN
    RAISE EXCEPTION 'units must be >= 1';
  END IF;

  UPDATE public.generation_usage
  SET reserved_units = GREATEST(consumed_units, reserved_units - p_units)
  WHERE scope_type = 'user' AND scope_key = p_owner AND period_start = v_period;

  UPDATE public.generation_usage
  SET reserved_units = GREATEST(consumed_units, reserved_units - p_units)
  WHERE scope_type = 'project' AND scope_key = p_project_key AND period_start = v_period;

  RETURN jsonb_build_object('ok', true, 'period_start', v_period, 'units', p_units);
END;
$$;

REVOKE ALL ON FUNCTION public.release_generation_budget(TEXT, INTEGER, TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_generation_budget(TEXT, INTEGER, TEXT, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.release_generation_budget(TEXT, INTEGER, TEXT, DATE)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_generation_budget(TEXT, INTEGER, TEXT, DATE)
  TO service_role;

-- Persist a complete researched revision and activate it atomically.
CREATE OR REPLACE FUNCTION public.save_complete_path_revision(
  p_path_id UUID,
  p_owner TEXT,
  p_input_snapshot JSONB,
  p_stages JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path public.paths%ROWTYPE;
  v_revision_id UUID;
  v_revision_number INTEGER;
  v_stage JSONB;
  v_video JSONB;
  v_stage_id UUID;
  v_stage_index INTEGER := 0;
  v_video_index INTEGER;
  v_previous_active UUID;
BEGIN
  SELECT * INTO v_path
  FROM public.paths
  WHERE id = p_path_id
  FOR UPDATE;

  IF NOT FOUND OR v_path.owner IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' OR jsonb_array_length(p_stages) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_stages');
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_revision_number
  FROM public.path_revisions
  WHERE path_id = p_path_id;

  v_previous_active := v_path.active_revision_id;

  IF v_previous_active IS NOT NULL THEN
    UPDATE public.path_revisions
    SET status = 'archived'
    WHERE id = v_previous_active AND status = 'active';
  END IF;

  INSERT INTO public.path_revisions (
    path_id,
    revision_number,
    status,
    edit_version,
    input_snapshot
  )
  VALUES (
    p_path_id,
    v_revision_number,
    'active',
    1,
    p_input_snapshot
  )
  RETURNING id INTO v_revision_id;

  FOR v_stage IN SELECT * FROM jsonb_array_elements(p_stages)
  LOOP
    INSERT INTO public.path_stages (
      revision_id,
      position,
      title,
      learning_objective,
      reason
    )
    VALUES (
      v_revision_id,
      v_stage_index,
      COALESCE(v_stage->>'title', ''),
      COALESCE(v_stage->>'learningObjective', v_stage->>'learning_objective', ''),
      COALESCE(v_stage->>'reason', '')
    )
    RETURNING id INTO v_stage_id;

    v_video_index := 0;
    FOR v_video IN
      SELECT * FROM jsonb_array_elements(COALESCE(v_stage->'videos', '[]'::jsonb))
    LOOP
      INSERT INTO public.path_videos (
        stage_id,
        position,
        youtube_video_id,
        title,
        channel_title,
        selection_reason,
        source,
        duration_seconds,
        thumbnail_url,
        verified_at,
        metadata_snapshot
      )
      VALUES (
        v_stage_id,
        v_video_index,
        COALESCE(v_video->>'youtubeVideoId', v_video->>'youtube_video_id', ''),
        COALESCE(v_video->>'title', ''),
        v_video->>'channelTitle',
        COALESCE(v_video->>'selectionReason', v_video->>'selection_reason', ''),
        COALESCE(v_video->>'source', 'research'),
        NULLIF(v_video->>'durationSeconds', '')::INTEGER,
        v_video->>'thumbnailUrl',
        COALESCE((v_video->>'verifiedAt')::TIMESTAMPTZ, NOW()),
        v_video->'metadataSnapshot'
      );
      v_video_index := v_video_index + 1;
    END LOOP;

    v_stage_index := v_stage_index + 1;
  END LOOP;

  UPDATE public.paths
  SET active_revision_id = v_revision_id
  WHERE id = p_path_id;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', v_revision_id,
    'revision_number', v_revision_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB)
  FROM anon;
REVOKE ALL ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB)
  TO service_role;

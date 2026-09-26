-- Slice 6: suggested practice intervals + atomic owned interval replace.
-- Additive only. Deny-by-default RLS; service_role from Next.js after session checks.
-- video_intervals remain shared per user/video and are not FK'd to paths.
--
-- Overwrite contract: replace_owned_video_intervals atomically replaces ALL owned
-- intervals for (user_id, video_id). Other videos are never touched. Manual loops
-- on the same video survive acceptance (accept_interval_suggestion), not overwrite.

-- Provenance for intervals (manual | chapter_import | suggestion).
ALTER TABLE public.video_intervals
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'video_intervals_source_valid'
  ) THEN
    ALTER TABLE public.video_intervals
      ADD CONSTRAINT video_intervals_source_valid CHECK (
        source IN ('manual', 'chapter_import', 'suggestion')
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Atomic replace of ALL owned intervals for one video (other videos untouched)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_owned_video_intervals(
  p_user_id TEXT,
  p_video_id TEXT,
  p_intervals JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_index INTEGER := 0;
  v_inserted JSONB := '[]'::jsonb;
  v_row public.video_intervals%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR char_length(trim(p_user_id)) = 0 THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF p_video_id IS NULL OR char_length(trim(p_video_id)) = 0 THEN
    RAISE EXCEPTION 'video_id required';
  END IF;
  IF p_intervals IS NULL OR jsonb_typeof(p_intervals) <> 'array' THEN
    RAISE EXCEPTION 'intervals must be a JSON array';
  END IF;

  -- Overwrite contract: replace every owned interval for this video only.
  DELETE FROM public.video_intervals
  WHERE user_id = p_user_id
    AND video_id = p_video_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_intervals)
  LOOP
    INSERT INTO public.video_intervals (
      user_id,
      video_id,
      name,
      start_time,
      end_time,
      order_index,
      source
    )
    VALUES (
      p_user_id,
      p_video_id,
      NULLIF(trim(COALESCE(v_item->>'name', '')), ''),
      (v_item->>'start_time')::INTEGER,
      (v_item->>'end_time')::INTEGER,
      COALESCE((v_item->>'order_index')::INTEGER, v_index),
      'chapter_import'
    )
    RETURNING * INTO v_row;

    v_inserted := v_inserted || jsonb_build_array(
      jsonb_build_object(
        'id', v_row.id,
        'user_id', v_row.user_id,
        'video_id', v_row.video_id,
        'name', v_row.name,
        'start_time', v_row.start_time,
        'end_time', v_row.end_time,
        'order_index', v_row.order_index,
        'source', v_row.source,
        'created_at', v_row.created_at,
        'updated_at', v_row.updated_at
      )
    );
    v_index := v_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'intervals', v_inserted,
    'imported_count', v_index
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_owned_video_intervals(TEXT, TEXT, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_owned_video_intervals(TEXT, TEXT, JSONB)
  FROM anon;
REVOKE ALL ON FUNCTION public.replace_owned_video_intervals(TEXT, TEXT, JSONB)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.replace_owned_video_intervals(TEXT, TEXT, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.replace_owned_video_intervals(TEXT, TEXT, JSONB) IS
  'Atomically replace all owned video_intervals for one video. Other videos untouched. Service-role only after NextAuth checks.';
-- ---------------------------------------------------------------------------
-- Extend path_jobs for interval suggestion attempts
-- ---------------------------------------------------------------------------
ALTER TABLE public.path_jobs
  DROP CONSTRAINT IF EXISTS path_jobs_kind_valid;

ALTER TABLE public.path_jobs
  ADD CONSTRAINT path_jobs_kind_valid CHECK (
    kind IN ('research', 'interval_suggestions')
  );

ALTER TABLE public.path_jobs
  DROP CONSTRAINT IF EXISTS path_jobs_phase_valid;

ALTER TABLE public.path_jobs
  ADD CONSTRAINT path_jobs_phase_valid CHECK (
    phase IN (
      'accepted',
      'planning',
      'searching',
      'selecting',
      'saving',
      'parsing',
      'ranking',
      'done'
    )
  );

-- ---------------------------------------------------------------------------
-- interval_suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.interval_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  path_video_id UUID NOT NULL REFERENCES public.path_videos (id) ON DELETE CASCADE,
  path_job_id UUID NOT NULL REFERENCES public.path_jobs (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  accepted_interval_id UUID REFERENCES public.video_intervals (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interval_suggestions_owner_not_blank CHECK (
    char_length(trim(owner)) > 0
  ),
  CONSTRAINT interval_suggestions_label_length CHECK (
    char_length(label) >= 1 AND char_length(label) <= 100
  ),
  CONSTRAINT interval_suggestions_rationale_length CHECK (
    char_length(rationale) >= 1 AND char_length(rationale) <= 1000
  ),
  CONSTRAINT interval_suggestions_time_bounds CHECK (
    start_time >= 0 AND end_time > start_time
  ),
  CONSTRAINT interval_suggestions_owner_job_span_unique UNIQUE (
    owner,
    path_job_id,
    start_time,
    end_time
  )
);

CREATE INDEX IF NOT EXISTS idx_interval_suggestions_owner_path_video
  ON public.interval_suggestions (owner, path_video_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interval_suggestions_path_job
  ON public.interval_suggestions (path_job_id);

DROP TRIGGER IF EXISTS interval_suggestions_handle_updated_at
  ON public.interval_suggestions;
CREATE TRIGGER interval_suggestions_handle_updated_at
  BEFORE UPDATE ON public.interval_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.interval_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.interval_suggestions FROM PUBLIC;
REVOKE ALL ON TABLE public.interval_suggestions FROM anon;
REVOKE ALL ON TABLE public.interval_suggestions FROM authenticated;
GRANT ALL ON TABLE public.interval_suggestions TO service_role;

COMMENT ON TABLE public.interval_suggestions IS
  'Ranked known chapter spans for a path video/job. RLS deny-by-default; service_role after NextAuth checks.';

-- ---------------------------------------------------------------------------
-- Idempotent acceptance: insert named interval if missing; link suggestion
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_interval_suggestion(
  p_owner TEXT,
  p_suggestion_id UUID,
  p_youtube_video_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_suggestion public.interval_suggestions%ROWTYPE;
  v_existing public.video_intervals%ROWTYPE;
  v_created public.video_intervals%ROWTYPE;
  v_next_order INTEGER;
  v_created_new BOOLEAN := false;
BEGIN
  IF p_owner IS NULL OR char_length(trim(p_owner)) = 0 THEN
    RAISE EXCEPTION 'owner required';
  END IF;

  SELECT * INTO v_suggestion
  FROM public.interval_suggestions
  WHERE id = p_suggestion_id
    AND owner = p_owner
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Already accepted: return linked interval without inserting another row.
  IF v_suggestion.accepted_interval_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.video_intervals
    WHERE id = v_suggestion.accepted_interval_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'suggestion_id', v_suggestion.id,
        'interval', jsonb_build_object(
          'id', v_existing.id,
          'user_id', v_existing.user_id,
          'video_id', v_existing.video_id,
          'name', v_existing.name,
          'start_time', v_existing.start_time,
          'end_time', v_existing.end_time,
          'order_index', v_existing.order_index,
          'created_at', v_existing.created_at,
          'updated_at', v_existing.updated_at
        )
      );
    END IF;
  END IF;

  -- Preserve unrelated/manual loops: reuse an exact start/end match if present.
  SELECT * INTO v_existing
  FROM public.video_intervals
  WHERE user_id = p_owner
    AND video_id = p_youtube_video_id
    AND start_time = v_suggestion.start_time
    AND end_time = v_suggestion.end_time
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.interval_suggestions
    SET accepted_interval_id = v_existing.id
    WHERE id = v_suggestion.id;

    IF v_existing.name IS NULL AND v_suggestion.label IS NOT NULL THEN
      UPDATE public.video_intervals
      SET name = v_suggestion.label
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'suggestion_id', v_suggestion.id,
      'interval', jsonb_build_object(
        'id', v_existing.id,
        'user_id', v_existing.user_id,
        'video_id', v_existing.video_id,
        'name', v_existing.name,
        'start_time', v_existing.start_time,
        'end_time', v_existing.end_time,
        'order_index', v_existing.order_index,
        'created_at', v_existing.created_at,
        'updated_at', v_existing.updated_at
      )
    );
  END IF;

  SELECT COALESCE(MAX(order_index), -1) + 1
  INTO v_next_order
  FROM public.video_intervals
  WHERE user_id = p_owner
    AND video_id = p_youtube_video_id;

  INSERT INTO public.video_intervals (
    user_id,
    video_id,
    name,
    start_time,
    end_time,
    order_index,
    source
  )
  VALUES (
    p_owner,
    p_youtube_video_id,
    v_suggestion.label,
    v_suggestion.start_time,
    v_suggestion.end_time,
    v_next_order,
    'suggestion'
  )
  RETURNING * INTO v_created;

  UPDATE public.interval_suggestions
  SET accepted_interval_id = v_created.id
  WHERE id = v_suggestion.id;

  v_created_new := true;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created_new,
    'suggestion_id', v_suggestion.id,
    'interval', jsonb_build_object(
      'id', v_created.id,
      'user_id', v_created.user_id,
      'video_id', v_created.video_id,
      'name', v_created.name,
      'start_time', v_created.start_time,
      'end_time', v_created.end_time,
      'order_index', v_created.order_index,
      'created_at', v_created.created_at,
      'updated_at', v_created.updated_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_interval_suggestion(TEXT, UUID, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_interval_suggestion(TEXT, UUID, TEXT)
  FROM anon;
REVOKE ALL ON FUNCTION public.accept_interval_suggestion(TEXT, UUID, TEXT)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accept_interval_suggestion(TEXT, UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.accept_interval_suggestion(TEXT, UUID, TEXT) IS
  'Idempotently accept a suggestion into named video_intervals without erasing other loops.';

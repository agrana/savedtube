-- Slice 3: path practice progress, transactional edits, draft regeneration activation.
-- Additive only. Shared video_intervals remain untouched (no FK to paths).
-- Deny-by-default RLS; service_role from Next.js after session ownership checks.

-- ---------------------------------------------------------------------------
-- path_video_progress (stable path-item IDs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_video_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  path_video_id UUID NOT NULL REFERENCES public.path_videos (id) ON DELETE CASCADE,
  practiced BOOLEAN NOT NULL DEFAULT FALSE,
  practiced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_video_progress_owner_nonempty CHECK (char_length(trim(owner)) > 0),
  CONSTRAINT path_video_progress_practiced_at_consistent CHECK (
    (practiced = FALSE AND practiced_at IS NULL)
    OR (practiced = TRUE AND practiced_at IS NOT NULL)
  ),
  CONSTRAINT path_video_progress_owner_video_unique UNIQUE (owner, path_video_id)
);

CREATE INDEX IF NOT EXISTS idx_path_video_progress_owner
  ON public.path_video_progress (owner);

CREATE INDEX IF NOT EXISTS idx_path_video_progress_video
  ON public.path_video_progress (path_video_id);

DROP TRIGGER IF EXISTS path_video_progress_handle_updated_at ON public.path_video_progress;
CREATE TRIGGER path_video_progress_handle_updated_at
  BEFORE UPDATE ON public.path_video_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_video_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_video_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.path_video_progress FROM anon;
REVOKE ALL ON TABLE public.path_video_progress FROM authenticated;
GRANT ALL ON TABLE public.path_video_progress TO service_role;

COMMENT ON TABLE public.path_video_progress IS
  'Explicit practiced state per owner and stable path_videos.id. Not inferred from playback.';

-- ---------------------------------------------------------------------------
-- path_stage_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.path_stage_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  path_stage_id UUID NOT NULL REFERENCES public.path_stages (id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL,
  reflection TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT path_stage_progress_owner_nonempty CHECK (char_length(trim(owner)) > 0),
  CONSTRAINT path_stage_progress_reflection_length CHECK (
    reflection IS NULL OR char_length(reflection) <= 2000
  ),
  CONSTRAINT path_stage_progress_owner_stage_unique UNIQUE (owner, path_stage_id)
);

CREATE INDEX IF NOT EXISTS idx_path_stage_progress_owner
  ON public.path_stage_progress (owner);

CREATE INDEX IF NOT EXISTS idx_path_stage_progress_stage
  ON public.path_stage_progress (path_stage_id);

DROP TRIGGER IF EXISTS path_stage_progress_handle_updated_at ON public.path_stage_progress;
CREATE TRIGGER path_stage_progress_handle_updated_at
  BEFORE UPDATE ON public.path_stage_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.path_stage_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.path_stage_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.path_stage_progress FROM anon;
REVOKE ALL ON TABLE public.path_stage_progress FROM authenticated;
GRANT ALL ON TABLE public.path_stage_progress TO service_role;

COMMENT ON TABLE public.path_stage_progress IS
  'Explicit stage completion per owner and stable path_stages.id. Reflection optional.';

-- ---------------------------------------------------------------------------
-- Helpers for owned active-revision mutations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._path_lock_owned_active_revision(
  p_path_id UUID,
  p_owner TEXT,
  p_expected_edit_version INTEGER
)
RETURNS TABLE (
  path_row public.paths,
  revision_row public.path_revisions
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path public.paths%ROWTYPE;
  v_revision public.path_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_path
  FROM public.paths
  WHERE id = p_path_id
  FOR UPDATE;

  IF NOT FOUND OR v_path.owner IS DISTINCT FROM p_owner THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_path.active_revision_id IS NULL THEN
    RAISE EXCEPTION 'no_active_revision' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_revision
  FROM public.path_revisions
  WHERE id = v_path.active_revision_id
    AND path_id = p_path_id
  FOR UPDATE;

  IF NOT FOUND OR v_revision.status <> 'active' THEN
    RAISE EXCEPTION 'no_active_revision' USING ERRCODE = 'P0001';
  END IF;

  IF p_expected_edit_version IS NULL
     OR v_revision.edit_version IS DISTINCT FROM p_expected_edit_version THEN
    RAISE EXCEPTION 'stale_edit' USING ERRCODE = 'P0001';
  END IF;

  path_row := v_path;
  revision_row := v_revision;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._path_lock_owned_active_revision(UUID, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._path_lock_owned_active_revision(UUID, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public._path_lock_owned_active_revision(UUID, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._path_lock_owned_active_revision(UUID, TEXT, INTEGER) TO service_role;

-- Bump edit_version after a successful mutation.
CREATE OR REPLACE FUNCTION public._path_bump_edit_version(p_revision_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  UPDATE public.path_revisions
  SET edit_version = edit_version + 1
  WHERE id = p_revision_id
  RETURNING edit_version INTO v_next;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'no_active_revision' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public._path_bump_edit_version(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._path_bump_edit_version(UUID) FROM anon;
REVOKE ALL ON FUNCTION public._path_bump_edit_version(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._path_bump_edit_version(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Transactional path edits (one action per call)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_path_revision_edit(
  p_path_id UUID,
  p_owner TEXT,
  p_expected_edit_version INTEGER,
  p_action TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path public.paths%ROWTYPE;
  v_revision public.path_revisions%ROWTYPE;
  v_lock RECORD;
  v_new_version INTEGER;
  v_stage_id UUID;
  v_video_id UUID;
  v_target_stage_id UUID;
  v_title TEXT;
  v_ids UUID[];
  v_id UUID;
  v_index INTEGER;
  v_count INTEGER;
  v_existing_ids UUID[];
  v_video public.path_videos%ROWTYPE;
  v_max_pos INTEGER;
  v_insert_pos INTEGER;
  v_new_video_id UUID;
BEGIN
  BEGIN
    SELECT * INTO v_lock
    FROM public._path_lock_owned_active_revision(
      p_path_id,
      p_owner,
      p_expected_edit_version
    );
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM = 'not_found' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'not_found');
      ELSIF SQLERRM = 'no_active_revision' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'no_active_revision');
      ELSIF SQLERRM = 'stale_edit' THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stale_edit');
      ELSE
        RETURN jsonb_build_object('ok', false, 'code', 'edit_failed');
      END IF;
  END;

  v_path := v_lock.path_row;
  v_revision := v_lock.revision_row;

  IF p_action = 'rename_stage' THEN
    v_stage_id := NULLIF(p_payload->>'stageId', '')::UUID;
    v_title := trim(COALESCE(p_payload->>'title', ''));
    IF v_stage_id IS NULL OR char_length(v_title) < 1 OR char_length(v_title) > 200 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    UPDATE public.path_stages
    SET title = v_title
    WHERE id = v_stage_id AND revision_id = v_revision.id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
    END IF;

  ELSIF p_action = 'reorder_stages' THEN
    SELECT ARRAY(
      SELECT (value::text)::UUID
      FROM jsonb_array_elements_text(COALESCE(p_payload->'orderedStageIds', '[]'::jsonb))
    ) INTO v_ids;
    SELECT ARRAY_AGG(id ORDER BY position)
      INTO v_existing_ids
    FROM public.path_stages
    WHERE revision_id = v_revision.id;
    IF v_existing_ids IS NULL OR array_length(v_existing_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    IF v_ids IS NULL
       OR array_length(v_ids, 1) IS DISTINCT FROM array_length(v_existing_ids, 1)
       OR (SELECT COUNT(DISTINCT x) FROM unnest(v_ids) AS x)
          IS DISTINCT FROM array_length(v_ids, 1)
       OR EXISTS (
         SELECT 1 FROM unnest(v_ids) AS x
         WHERE x <> ALL (v_existing_ids)
       )
       OR EXISTS (
         SELECT 1 FROM unnest(v_existing_ids) AS x
         WHERE x <> ALL (v_ids)
       )
    THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_order');
    END IF;
    -- Two-phase update avoids unique (revision_id, position) collisions.
    v_index := 0;
    FOREACH v_id IN ARRAY v_ids
    LOOP
      UPDATE public.path_stages
      SET position = -(v_index + 1)
      WHERE id = v_id AND revision_id = v_revision.id;
      v_index := v_index + 1;
    END LOOP;
    v_index := 0;
    FOREACH v_id IN ARRAY v_ids
    LOOP
      UPDATE public.path_stages
      SET position = v_index
      WHERE id = v_id AND revision_id = v_revision.id;
      v_index := v_index + 1;
    END LOOP;

  ELSIF p_action = 'reorder_items' THEN
    v_stage_id := NULLIF(p_payload->>'stageId', '')::UUID;
    IF v_stage_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.path_stages
      WHERE id = v_stage_id AND revision_id = v_revision.id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
    END IF;
    SELECT ARRAY(
      SELECT (value::text)::UUID
      FROM jsonb_array_elements_text(COALESCE(p_payload->'orderedPathVideoIds', '[]'::jsonb))
    ) INTO v_ids;
    SELECT ARRAY_AGG(id ORDER BY position)
      INTO v_existing_ids
    FROM public.path_videos
    WHERE stage_id = v_stage_id;
    IF v_existing_ids IS NULL OR array_length(v_existing_ids, 1) IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    IF v_ids IS NULL
       OR array_length(v_ids, 1) IS DISTINCT FROM array_length(v_existing_ids, 1)
       OR (SELECT COUNT(DISTINCT x) FROM unnest(v_ids) AS x)
          IS DISTINCT FROM array_length(v_ids, 1)
       OR EXISTS (
         SELECT 1 FROM unnest(v_ids) AS x
         WHERE x <> ALL (v_existing_ids)
       )
       OR EXISTS (
         SELECT 1 FROM unnest(v_existing_ids) AS x
         WHERE x <> ALL (v_ids)
       )
    THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_order');
    END IF;
    v_index := 0;
    FOREACH v_id IN ARRAY v_ids
    LOOP
      UPDATE public.path_videos
      SET position = -(v_index + 1)
      WHERE id = v_id AND stage_id = v_stage_id;
      v_index := v_index + 1;
    END LOOP;
    v_index := 0;
    FOREACH v_id IN ARRAY v_ids
    LOOP
      UPDATE public.path_videos
      SET position = v_index
      WHERE id = v_id AND stage_id = v_stage_id;
      v_index := v_index + 1;
    END LOOP;

  ELSIF p_action = 'move_item' THEN
    v_video_id := NULLIF(p_payload->>'pathVideoId', '')::UUID;
    v_target_stage_id := NULLIF(p_payload->>'targetStageId', '')::UUID;
    v_insert_pos := COALESCE((p_payload->>'targetPosition')::INTEGER, -1);
    IF v_video_id IS NULL OR v_target_stage_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    SELECT pv.* INTO v_video
    FROM public.path_videos pv
    JOIN public.path_stages ps ON ps.id = pv.stage_id
    WHERE pv.id = v_video_id AND ps.revision_id = v_revision.id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.path_stages
      WHERE id = v_target_stage_id AND revision_id = v_revision.id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
    END IF;

    -- Compact source stage after removal.
    UPDATE public.path_videos
    SET position = position - 1
    WHERE stage_id = v_video.stage_id AND position > v_video.position;

    SELECT COALESCE(MAX(position), -1) INTO v_max_pos
    FROM public.path_videos
    WHERE stage_id = v_target_stage_id
      AND id <> v_video_id;

    IF v_insert_pos < 0 OR v_insert_pos > v_max_pos + 1 THEN
      v_insert_pos := v_max_pos + 1;
    END IF;

    UPDATE public.path_videos
    SET position = position + 1
    WHERE stage_id = v_target_stage_id
      AND position >= v_insert_pos
      AND id <> v_video_id;

    UPDATE public.path_videos
    SET stage_id = v_target_stage_id,
        position = v_insert_pos
    WHERE id = v_video_id;

  ELSIF p_action = 'remove_item' THEN
    v_video_id := NULLIF(p_payload->>'pathVideoId', '')::UUID;
    IF v_video_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    SELECT pv.* INTO v_video
    FROM public.path_videos pv
    JOIN public.path_stages ps ON ps.id = pv.stage_id
    WHERE pv.id = v_video_id AND ps.revision_id = v_revision.id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
    END IF;
    DELETE FROM public.path_videos WHERE id = v_video_id;
    UPDATE public.path_videos
    SET position = position - 1
    WHERE stage_id = v_video.stage_id AND position > v_video.position;
    -- Drop empty stages so the path stays usable.
    DELETE FROM public.path_stages ps
    WHERE ps.id = v_video.stage_id
      AND NOT EXISTS (SELECT 1 FROM public.path_videos pv WHERE pv.stage_id = ps.id);
    -- Compact remaining stage positions.
    WITH ordered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY position) - 1 AS new_pos
      FROM public.path_stages
      WHERE revision_id = v_revision.id
    )
    UPDATE public.path_stages ps
    SET position = ordered.new_pos
    FROM ordered
    WHERE ps.id = ordered.id;

  ELSIF p_action = 'add_item' THEN
    v_stage_id := NULLIF(p_payload->>'stageId', '')::UUID;
    IF v_stage_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.path_stages
      WHERE id = v_stage_id AND revision_id = v_revision.id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
    END IF;
    IF COALESCE(p_payload->>'youtubeVideoId', '') !~ '^[a-zA-Z0-9_-]{11}$' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    SELECT COALESCE(MAX(position), -1) + 1 INTO v_insert_pos
    FROM public.path_videos
    WHERE stage_id = v_stage_id;
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
      v_insert_pos,
      p_payload->>'youtubeVideoId',
      LEFT(trim(COALESCE(p_payload->>'title', 'Untitled video')), 300),
      NULLIF(LEFT(trim(COALESCE(p_payload->>'channelTitle', '')), 200), ''),
      LEFT(trim(COALESCE(p_payload->>'selectionReason', 'Added manually')), 1000),
      'manual',
      NULLIF(p_payload->>'durationSeconds', '')::INTEGER,
      NULLIF(p_payload->>'thumbnailUrl', ''),
      COALESCE((p_payload->>'verifiedAt')::TIMESTAMPTZ, NOW()),
      p_payload->'metadataSnapshot'
    )
    RETURNING id INTO v_new_video_id;

  ELSIF p_action = 'replace_item' THEN
    v_video_id := NULLIF(p_payload->>'pathVideoId', '')::UUID;
    IF v_video_id IS NULL
       OR COALESCE(p_payload->>'youtubeVideoId', '') !~ '^[a-zA-Z0-9_-]{11}$' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;
    SELECT pv.* INTO v_video
    FROM public.path_videos pv
    JOIN public.path_stages ps ON ps.id = pv.stage_id
    WHERE pv.id = v_video_id AND ps.revision_id = v_revision.id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
    END IF;
    UPDATE public.path_videos
    SET youtube_video_id = p_payload->>'youtubeVideoId',
        title = LEFT(trim(COALESCE(p_payload->>'title', 'Untitled video')), 300),
        channel_title = NULLIF(LEFT(trim(COALESCE(p_payload->>'channelTitle', '')), 200), ''),
        selection_reason = LEFT(
          trim(COALESCE(p_payload->>'selectionReason', 'Replaced manually')),
          1000
        ),
        source = 'manual',
        duration_seconds = NULLIF(p_payload->>'durationSeconds', '')::INTEGER,
        thumbnail_url = NULLIF(p_payload->>'thumbnailUrl', ''),
        verified_at = COALESCE((p_payload->>'verifiedAt')::TIMESTAMPTZ, NOW()),
        metadata_snapshot = p_payload->'metadataSnapshot'
    WHERE id = v_video_id;
    -- Replacing identity clears practiced state for this path item.
    DELETE FROM public.path_video_progress
    WHERE path_video_id = v_video_id;

  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'unknown_action');
  END IF;

  -- Refuse leaving an active revision with zero videos.
  SELECT COUNT(*) INTO v_count
  FROM public.path_videos pv
  JOIN public.path_stages ps ON ps.id = pv.stage_id
  WHERE ps.revision_id = v_revision.id;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'empty_revision' USING ERRCODE = 'P0002';
  END IF;

  v_new_version := public._path_bump_edit_version(v_revision.id);

  RETURN jsonb_build_object(
    'ok', true,
    'edit_version', v_new_version,
    'revision_id', v_revision.id,
    'path_video_id', v_new_video_id
  );
EXCEPTION
  WHEN SQLSTATE 'P0002' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'empty_revision');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_path_revision_edit(UUID, TEXT, INTEGER, TEXT, JSONB)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_path_revision_edit(UUID, TEXT, INTEGER, TEXT, JSONB)
  FROM anon;
REVOKE ALL ON FUNCTION public.apply_path_revision_edit(UUID, TEXT, INTEGER, TEXT, JSONB)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_path_revision_edit(UUID, TEXT, INTEGER, TEXT, JSONB)
  TO service_role;

-- ---------------------------------------------------------------------------
-- Extend revision save: first result can activate; regeneration saves draft.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.save_complete_path_revision(
  p_path_id UUID,
  p_owner TEXT,
  p_input_snapshot JSONB,
  p_stages JSONB,
  p_as_draft BOOLEAN DEFAULT FALSE
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
  v_status TEXT;
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

  -- Regeneration (active already exists) must be draft; first result may activate.
  IF p_as_draft OR v_path.active_revision_id IS NOT NULL THEN
    v_status := 'draft';
  ELSE
    v_status := 'active';
  END IF;

  SELECT COALESCE(MAX(revision_number), 0) + 1
  INTO v_revision_number
  FROM public.path_revisions
  WHERE path_id = p_path_id;

  IF v_status = 'draft' THEN
    UPDATE public.path_revisions
    SET status = 'archived'
    WHERE path_id = p_path_id AND status = 'draft';
  ELSE
    v_previous_active := v_path.active_revision_id;
    IF v_previous_active IS NOT NULL THEN
      UPDATE public.path_revisions
      SET status = 'archived'
      WHERE id = v_previous_active AND status = 'active';
    END IF;
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
    v_status,
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

  IF v_status = 'active' THEN
    UPDATE public.paths
    SET active_revision_id = v_revision_id
    WHERE id = p_path_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', v_revision_id,
    'revision_number', v_revision_number,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB, BOOLEAN)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB, BOOLEAN)
  FROM anon;
REVOKE ALL ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB, BOOLEAN)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_complete_path_revision(UUID, TEXT, JSONB, JSONB, BOOLEAN)
  TO service_role;

-- Activate a draft or restore an archived revision with stale-edit protection.
CREATE OR REPLACE FUNCTION public.activate_path_revision(
  p_path_id UUID,
  p_owner TEXT,
  p_revision_id UUID,
  p_expected_edit_version INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path public.paths%ROWTYPE;
  v_current public.path_revisions%ROWTYPE;
  v_target public.path_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_path
  FROM public.paths
  WHERE id = p_path_id
  FOR UPDATE;

  IF NOT FOUND OR v_path.owner IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT * INTO v_target
  FROM public.path_revisions
  WHERE id = p_revision_id AND path_id = p_path_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF v_target.status NOT IN ('draft', 'archived') THEN
    IF v_target.status = 'active' AND v_path.active_revision_id = v_target.id THEN
      RETURN jsonb_build_object(
        'ok', true,
        'revision_id', v_target.id,
        'already_active', true,
        'edit_version', v_target.edit_version
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status');
  END IF;

  IF v_path.active_revision_id IS NOT NULL THEN
    SELECT * INTO v_current
    FROM public.path_revisions
    WHERE id = v_path.active_revision_id AND path_id = p_path_id
    FOR UPDATE;

    IF FOUND THEN
      IF p_expected_edit_version IS NULL
         OR v_current.edit_version IS DISTINCT FROM p_expected_edit_version THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'stale_edit',
          'edit_version', v_current.edit_version
        );
      END IF;
      UPDATE public.path_revisions
      SET status = 'archived'
      WHERE id = v_current.id;
    END IF;
  END IF;

  UPDATE public.path_revisions
  SET status = 'active'
  WHERE id = v_target.id;

  UPDATE public.paths
  SET active_revision_id = v_target.id
  WHERE id = p_path_id;

  RETURN jsonb_build_object(
    'ok', true,
    'revision_id', v_target.id,
    'already_active', false,
    'edit_version', v_target.edit_version
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_path_revision(UUID, TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_path_revision(UUID, TEXT, UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.activate_path_revision(UUID, TEXT, UUID, INTEGER)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_path_revision(UUID, TEXT, UUID, INTEGER)
  TO service_role;

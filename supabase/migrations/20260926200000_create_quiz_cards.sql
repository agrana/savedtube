-- Slice 8: spaced recall quiz cards + immutable review attempts.
-- Additive only. Deny-by-default RLS; service_role from Next.js after session checks.
-- Cards are keyed by (owner, path_stage_id, completion_version, card_index) so generation
-- is once per eligible completed stage version. Archived revision cards stay stored for
-- restoration/history but are excluded from active due lists in application queries.

-- ---------------------------------------------------------------------------
-- quiz_cards
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  path_id UUID NOT NULL REFERENCES public.paths (id) ON DELETE CASCADE,
  path_stage_id UUID NOT NULL REFERENCES public.path_stages (id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.path_revisions (id) ON DELETE CASCADE,
  completion_version INTEGER NOT NULL,
  card_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer_rubric TEXT NOT NULL,
  evidence_basis TEXT NOT NULL,
  evidence_label TEXT NOT NULL,
  is_metadata_only BOOLEAN NOT NULL DEFAULT TRUE,
  schedule_version INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL,
  review_state TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_cards_owner_not_blank CHECK (char_length(trim(owner)) > 0),
  CONSTRAINT quiz_cards_completion_version_positive CHECK (completion_version >= 1),
  CONSTRAINT quiz_cards_card_index_nonnegative CHECK (card_index >= 0),
  CONSTRAINT quiz_cards_schedule_version_nonnegative CHECK (schedule_version >= 0),
  CONSTRAINT quiz_cards_question_length CHECK (
    char_length(question) >= 1 AND char_length(question) <= 2000
  ),
  CONSTRAINT quiz_cards_answer_rubric_length CHECK (
    char_length(answer_rubric) >= 1 AND char_length(answer_rubric) <= 4000
  ),
  CONSTRAINT quiz_cards_evidence_basis_length CHECK (
    char_length(evidence_basis) >= 1 AND char_length(evidence_basis) <= 200
  ),
  CONSTRAINT quiz_cards_evidence_label_length CHECK (
    char_length(evidence_label) >= 1 AND char_length(evidence_label) <= 200
  ),
  CONSTRAINT quiz_cards_review_state_valid CHECK (
    review_state IN ('new', 'relearning', 'review')
  ),
  CONSTRAINT quiz_cards_owner_stage_version_index_unique UNIQUE (
    owner,
    path_stage_id,
    completion_version,
    card_index
  )
);

CREATE INDEX IF NOT EXISTS idx_quiz_cards_owner_due
  ON public.quiz_cards (owner, due_at ASC);

CREATE INDEX IF NOT EXISTS idx_quiz_cards_owner_path_due
  ON public.quiz_cards (owner, path_id, due_at ASC);

CREATE INDEX IF NOT EXISTS idx_quiz_cards_revision
  ON public.quiz_cards (revision_id);

CREATE INDEX IF NOT EXISTS idx_quiz_cards_stage_version
  ON public.quiz_cards (path_stage_id, completion_version);

DROP TRIGGER IF EXISTS quiz_cards_handle_updated_at ON public.quiz_cards;
CREATE TRIGGER quiz_cards_handle_updated_at
  BEFORE UPDATE ON public.quiz_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.quiz_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quiz_cards FROM PUBLIC;
REVOKE ALL ON TABLE public.quiz_cards FROM anon;
REVOKE ALL ON TABLE public.quiz_cards FROM authenticated;
GRANT ALL ON TABLE public.quiz_cards TO service_role;

COMMENT ON TABLE public.quiz_cards IS
  'Spaced-recall cards per owner/stage/completion_version. RLS deny-by-default; service_role after NextAuth ownership checks. Answer rubrics are never returned in initial question payloads.';

-- ---------------------------------------------------------------------------
-- quiz_review_attempts (immutable)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quiz_review_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  quiz_card_id UUID NOT NULL REFERENCES public.quiz_cards (id) ON DELETE CASCADE,
  path_id UUID NOT NULL REFERENCES public.paths (id) ON DELETE CASCADE,
  path_stage_id UUID NOT NULL REFERENCES public.path_stages (id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.path_revisions (id) ON DELETE CASCADE,
  rating TEXT NOT NULL,
  schedule_version_before INTEGER NOT NULL,
  schedule_version_after INTEGER NOT NULL,
  due_at_before TIMESTAMPTZ NOT NULL,
  due_at_after TIMESTAMPTZ NOT NULL,
  review_state_after TEXT NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quiz_review_attempts_owner_not_blank CHECK (char_length(trim(owner)) > 0),
  CONSTRAINT quiz_review_attempts_rating_valid CHECK (rating IN ('again', 'remembered')),
  CONSTRAINT quiz_review_attempts_schedule_before_nonnegative CHECK (schedule_version_before >= 0),
  CONSTRAINT quiz_review_attempts_schedule_after_nonnegative CHECK (schedule_version_after >= 0),
  CONSTRAINT quiz_review_attempts_review_state_valid CHECK (
    review_state_after IN ('new', 'relearning', 'review')
  ),
  CONSTRAINT quiz_review_attempts_card_schedule_unique UNIQUE (
    quiz_card_id,
    schedule_version_before
  )
);

CREATE INDEX IF NOT EXISTS idx_quiz_review_attempts_owner_card
  ON public.quiz_review_attempts (owner, quiz_card_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_review_attempts_path
  ON public.quiz_review_attempts (path_id, reviewed_at DESC);

CREATE OR REPLACE FUNCTION public.quiz_review_attempts_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'quiz_review_attempts are immutable'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS quiz_review_attempts_forbid_update ON public.quiz_review_attempts;
CREATE TRIGGER quiz_review_attempts_forbid_update
  BEFORE UPDATE ON public.quiz_review_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.quiz_review_attempts_immutable();

ALTER TABLE public.quiz_review_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quiz_review_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.quiz_review_attempts FROM anon;
REVOKE ALL ON TABLE public.quiz_review_attempts FROM authenticated;
-- Immutable reviews: no UPDATE grant.
GRANT SELECT, INSERT, DELETE ON TABLE public.quiz_review_attempts TO service_role;

COMMENT ON TABLE public.quiz_review_attempts IS
  'Immutable spaced-recall ratings. Unique per card/schedule_version_before for idempotent retries without double-advance.';

-- ---------------------------------------------------------------------------
-- Insert a generated card set once (idempotent on stage/version)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_stage_quiz_cards(
  p_path_id UUID,
  p_owner TEXT,
  p_stage_id UUID,
  p_completion_version INTEGER,
  p_cards JSONB,
  p_due_at TIMESTAMPTZ
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
  v_existing_count INTEGER;
  v_card JSONB;
  v_index INTEGER;
  v_inserted public.quiz_cards%ROWTYPE;
  v_rows JSONB := '[]'::JSONB;
BEGIN
  IF p_owner IS NULL OR char_length(trim(p_owner)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF p_completion_version IS NULL OR p_completion_version < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' OR jsonb_array_length(p_cards) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  IF p_due_at IS NULL THEN
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

  IF v_revision.edit_version IS DISTINCT FROM p_completion_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_completion_version');
  END IF;

  SELECT * INTO v_stage
  FROM public.path_stages
  WHERE id = p_stage_id
    AND revision_id = v_revision.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'foreign_id');
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_existing_count
  FROM public.quiz_cards
  WHERE owner = p_owner
    AND path_stage_id = p_stage_id
    AND completion_version = p_completion_version;

  IF v_existing_count > 0 THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.card_index), '[]'::JSONB)
    INTO v_rows
    FROM public.quiz_cards c
    WHERE c.owner = p_owner
      AND c.path_stage_id = p_stage_id
      AND c.completion_version = p_completion_version;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'revision_id', v_revision.id,
      'completion_version', p_completion_version,
      'cards', v_rows
    );
  END IF;

  v_index := 0;
  FOR v_card IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    IF v_card->>'question' IS NULL OR char_length(trim(v_card->>'question')) < 1
       OR v_card->>'answer_rubric' IS NULL OR char_length(trim(v_card->>'answer_rubric')) < 1
       OR v_card->>'evidence_basis' IS NULL OR char_length(trim(v_card->>'evidence_basis')) < 1
       OR v_card->>'evidence_label' IS NULL OR char_length(trim(v_card->>'evidence_label')) < 1 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
    END IF;

    INSERT INTO public.quiz_cards (
      owner,
      path_id,
      path_stage_id,
      revision_id,
      completion_version,
      card_index,
      question,
      answer_rubric,
      evidence_basis,
      evidence_label,
      is_metadata_only,
      schedule_version,
      due_at,
      review_state
    )
    VALUES (
      p_owner,
      p_path_id,
      p_stage_id,
      v_revision.id,
      p_completion_version,
      COALESCE((v_card->>'card_index')::INTEGER, v_index),
      LEFT(trim(v_card->>'question'), 2000),
      LEFT(trim(v_card->>'answer_rubric'), 4000),
      LEFT(trim(v_card->>'evidence_basis'), 200),
      LEFT(trim(v_card->>'evidence_label'), 200),
      COALESCE((v_card->>'is_metadata_only')::BOOLEAN, TRUE),
      0,
      p_due_at,
      'new'
    )
    RETURNING * INTO v_inserted;

    v_rows := v_rows || jsonb_build_array(to_jsonb(v_inserted));
    v_index := v_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'revision_id', v_revision.id,
    'completion_version', p_completion_version,
    'cards', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_stage_quiz_cards(
  UUID, TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_stage_quiz_cards(
  UUID, TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) FROM anon;
REVOKE ALL ON FUNCTION public.insert_stage_quiz_cards(
  UUID, TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.insert_stage_quiz_cards(
  UUID, TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.insert_stage_quiz_cards(
  UUID, TEXT, UUID, INTEGER, JSONB, TIMESTAMPTZ
) IS
  'Insert a small quiz-card set once for an owned active-revision completed stage version. Idempotent.';

-- ---------------------------------------------------------------------------
-- Submit Again / Remembered (idempotent on schedule_version_before)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_quiz_review(
  p_path_id UUID,
  p_owner TEXT,
  p_card_id UUID,
  p_rating TEXT,
  p_expected_schedule_version INTEGER,
  p_reviewed_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path public.paths%ROWTYPE;
  v_card public.quiz_cards%ROWTYPE;
  v_revision public.path_revisions%ROWTYPE;
  v_attempt public.quiz_review_attempts%ROWTYPE;
  v_now TIMESTAMPTZ;
  v_next_due TIMESTAMPTZ;
  v_next_version INTEGER;
  v_next_state TEXT;
  v_interval_days INTEGER;
BEGIN
  IF p_owner IS NULL OR char_length(trim(p_owner)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  IF p_rating IS NULL OR p_rating NOT IN ('again', 'remembered') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  IF p_expected_schedule_version IS NULL OR p_expected_schedule_version < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_payload');
  END IF;

  v_now := COALESCE(p_reviewed_at, NOW());

  SELECT * INTO v_path
  FROM public.paths
  WHERE id = p_path_id
  FOR UPDATE;

  IF NOT FOUND OR v_path.owner IS DISTINCT FROM p_owner THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT * INTO v_card
  FROM public.quiz_cards
  WHERE id = p_card_id
    AND owner = p_owner
    AND path_id = p_path_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  SELECT * INTO v_revision
  FROM public.path_revisions
  WHERE id = v_card.revision_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Active due list excludes archived revisions; rating still allowed only on
  -- cards that belong to the currently active revision.
  IF v_path.active_revision_id IS DISTINCT FROM v_card.revision_id
     OR v_revision.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'archived_revision');
  END IF;

  -- Idempotent: same card + schedule_version_before returns existing attempt.
  SELECT * INTO v_attempt
  FROM public.quiz_review_attempts
  WHERE quiz_card_id = v_card.id
    AND schedule_version_before = p_expected_schedule_version;

  IF FOUND THEN
    SELECT * INTO v_card
    FROM public.quiz_cards
    WHERE id = p_card_id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'card', to_jsonb(v_card),
      'attempt', to_jsonb(v_attempt)
    );
  END IF;

  IF v_card.schedule_version IS DISTINCT FROM p_expected_schedule_version THEN
    RETURN jsonb_build_object('ok', false, 'code', 'stale_schedule');
  END IF;

  IF p_rating = 'again' THEN
    v_next_version := 0;
    v_interval_days := 1;
    v_next_state := 'relearning';
  ELSE
    -- Remembered advances: after first review -> 3, then 7, 14, 30 (cap).
    v_next_version := LEAST(v_card.schedule_version + 1, 4);
    CASE v_next_version
      WHEN 1 THEN v_interval_days := 3;
      WHEN 2 THEN v_interval_days := 7;
      WHEN 3 THEN v_interval_days := 14;
      ELSE v_interval_days := 30;
    END CASE;
    v_next_state := 'review';
  END IF;

  -- Server-time scheduling in UTC (day arithmetic via interval).
  v_next_due := v_now + make_interval(days => v_interval_days);

  INSERT INTO public.quiz_review_attempts (
    owner,
    quiz_card_id,
    path_id,
    path_stage_id,
    revision_id,
    rating,
    schedule_version_before,
    schedule_version_after,
    due_at_before,
    due_at_after,
    review_state_after,
    reviewed_at
  )
  VALUES (
    p_owner,
    v_card.id,
    v_card.path_id,
    v_card.path_stage_id,
    v_card.revision_id,
    p_rating,
    v_card.schedule_version,
    v_next_version,
    v_card.due_at,
    v_next_due,
    v_next_state,
    v_now
  )
  ON CONFLICT (quiz_card_id, schedule_version_before) DO NOTHING
  RETURNING * INTO v_attempt;

  IF v_attempt.id IS NULL THEN
    SELECT * INTO v_attempt
    FROM public.quiz_review_attempts
    WHERE quiz_card_id = v_card.id
      AND schedule_version_before = p_expected_schedule_version;

    SELECT * INTO v_card
    FROM public.quiz_cards
    WHERE id = p_card_id;

    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'card', to_jsonb(v_card),
      'attempt', to_jsonb(v_attempt)
    );
  END IF;

  UPDATE public.quiz_cards
  SET schedule_version = v_next_version,
      due_at = v_next_due,
      review_state = v_next_state
  WHERE id = v_card.id
  RETURNING * INTO v_card;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'card', to_jsonb(v_card),
    'attempt', to_jsonb(v_attempt)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_quiz_review(
  UUID, TEXT, UUID, TEXT, INTEGER, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_quiz_review(
  UUID, TEXT, UUID, TEXT, INTEGER, TIMESTAMPTZ
) FROM anon;
REVOKE ALL ON FUNCTION public.submit_quiz_review(
  UUID, TEXT, UUID, TEXT, INTEGER, TIMESTAMPTZ
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_quiz_review(
  UUID, TEXT, UUID, TEXT, INTEGER, TIMESTAMPTZ
) TO service_role;

COMMENT ON FUNCTION public.submit_quiz_review(
  UUID, TEXT, UUID, TEXT, INTEGER, TIMESTAMPTZ
) IS
  'Atomically rate a quiz card with Again/Remembered. Idempotent on schedule_version_before; server-time UTC scheduling; no double-advance.';

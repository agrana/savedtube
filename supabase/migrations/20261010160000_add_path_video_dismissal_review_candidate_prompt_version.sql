-- Advisory assessment provenance (pipeline slice 2).
-- Additive only. prompt_version records which assessment prompt produced
-- model_id / assessment_notes. Candidates remain inactive for path generation
-- and do not activate global rules or executable predicates.

ALTER TABLE public.path_video_dismissal_review_candidates
  ADD COLUMN IF NOT EXISTS prompt_version TEXT;

COMMENT ON COLUMN public.path_video_dismissal_review_candidates.prompt_version IS
  'Advisory LLM assessment prompt version; nullable until assessed. Does not activate rules or path filters.';

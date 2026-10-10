-- Additive display metadata for path presentation.
-- Raw goal/background remain for research; UI should prefer display_* fields.

ALTER TABLE public.paths
  ADD COLUMN IF NOT EXISTS display_objective TEXT,
  ADD COLUMN IF NOT EXISTS display_path TEXT;

-- Backfill existing rows from raw goal / derived title before enforcing NOT NULL.
UPDATE public.paths
SET
  display_objective = COALESCE(NULLIF(trim(display_objective), ''), goal),
  display_path = COALESCE(NULLIF(trim(display_path), ''), title)
WHERE
  display_objective IS NULL
  OR trim(display_objective) = ''
  OR display_path IS NULL
  OR trim(display_path) = '';

ALTER TABLE public.paths
  ALTER COLUMN display_objective SET NOT NULL,
  ALTER COLUMN display_path SET NOT NULL;

ALTER TABLE public.paths
  DROP CONSTRAINT IF EXISTS paths_display_objective_length,
  DROP CONSTRAINT IF EXISTS paths_display_path_length;

ALTER TABLE public.paths
  ADD CONSTRAINT paths_display_objective_length CHECK (
    char_length(display_objective) >= 1 AND char_length(display_objective) <= 500
  ),
  ADD CONSTRAINT paths_display_path_length CHECK (
    char_length(display_path) >= 1 AND char_length(display_path) <= 200
  );

COMMENT ON COLUMN public.paths.display_objective IS
  'Learner-facing cleaned learning objective. Raw goal is retained for research only.';
COMMENT ON COLUMN public.paths.display_path IS
  'Learner-facing cleaned path title. Prefer this over goal/background in UI.';

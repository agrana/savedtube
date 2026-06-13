-- Add optional user-editable names for saved video intervals.
-- Existing rows remain unnamed and the UI derives fallback names from
-- start-time order (interval_1, interval_2, ...).

ALTER TABLE public.video_intervals
  ADD COLUMN IF NOT EXISTS name TEXT;
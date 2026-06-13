-- Ensure video_intervals has the final NextAuth-compatible schema.
-- This replaces an older destructive version of this migration; it must be safe
-- to run against production data.

CREATE TABLE IF NOT EXISTS public.video_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    start_time INTEGER NOT NULL CHECK (start_time >= 0),
    end_time INTEGER NOT NULL CHECK (end_time > start_time),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.video_intervals DROP CONSTRAINT IF EXISTS video_intervals_user_id_fkey;
ALTER TABLE public.video_intervals ALTER COLUMN user_id TYPE TEXT;

-- Disable RLS (we handle authorization in the API)
ALTER TABLE public.video_intervals DISABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_video_intervals_user_id ON public.video_intervals(user_id);
CREATE INDEX IF NOT EXISTS idx_video_intervals_video_id ON public.video_intervals(video_id);
CREATE INDEX IF NOT EXISTS idx_video_intervals_user_video ON public.video_intervals(user_id, video_id);

-- Add updated_at trigger if it does not already exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'video_intervals_updated_at'
          AND tgrelid = 'public.video_intervals'::regclass
    ) THEN
        CREATE TRIGGER video_intervals_updated_at
            BEFORE UPDATE ON public.video_intervals
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END;
$$;

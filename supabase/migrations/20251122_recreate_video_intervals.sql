-- Recreate video_intervals table to ensure correct schema
-- This is a "nuclear" fix to resolve the UUID vs TEXT type mismatch for user_id

-- Drop the table if it exists (WARNING: This deletes all data in this table)
DROP TABLE IF EXISTS public.video_intervals;

-- Recreate the table with user_id as TEXT
CREATE TABLE public.video_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL, -- Changed from UUID to TEXT to support NextAuth IDs
    video_id TEXT NOT NULL,
    start_time INTEGER NOT NULL CHECK (start_time >= 0),
    end_time INTEGER NOT NULL CHECK (end_time > start_time),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable RLS (we handle authorization in the API)
ALTER TABLE public.video_intervals DISABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_video_intervals_user_id ON public.video_intervals(user_id);
CREATE INDEX idx_video_intervals_video_id ON public.video_intervals(video_id);
CREATE INDEX idx_video_intervals_user_video ON public.video_intervals(user_id, video_id);

-- Add updated_at trigger
CREATE TRIGGER video_intervals_updated_at 
    BEFORE UPDATE ON public.video_intervals 
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_updated_at();

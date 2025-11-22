-- Create video intervals tracking table
-- This allows users to define specific time ranges within videos they want to watch
CREATE TABLE IF NOT EXISTS public.video_intervals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id TEXT NOT NULL,
    start_time INTEGER NOT NULL CHECK (start_time >= 0),
    end_time INTEGER NOT NULL CHECK (end_time > start_time),
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.video_intervals ENABLE ROW LEVEL SECURITY;

-- Create policies for user-specific data access
CREATE POLICY "users_can_view_own_intervals" ON public.video_intervals
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_can_insert_own_intervals" ON public.video_intervals
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_can_update_own_intervals" ON public.video_intervals
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_can_delete_own_intervals" ON public.video_intervals
    FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_video_intervals_user_id ON public.video_intervals(user_id);
CREATE INDEX IF NOT EXISTS idx_video_intervals_video_id ON public.video_intervals(video_id);
CREATE INDEX IF NOT EXISTS idx_video_intervals_user_video ON public.video_intervals(user_id, video_id);
CREATE INDEX IF NOT EXISTS idx_video_intervals_order ON public.video_intervals(user_id, video_id, order_index);

-- Add updated_at trigger
CREATE TRIGGER video_intervals_updated_at 
    BEFORE UPDATE ON public.video_intervals 
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_updated_at();

-- Create waiting_list table to collect email addresses from interested users
-- Drop table if it exists (for clean slate)
DROP TABLE IF EXISTS public.waiting_list;

-- Create the table
CREATE TABLE public.waiting_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure email is valid format
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create index for efficient queries
CREATE INDEX idx_waiting_list_email ON public.waiting_list(email);
CREATE INDEX idx_waiting_list_created_at ON public.waiting_list(created_at);

-- Disable RLS since this is a public signup form
-- We'll handle spam protection and validation in the API layer
ALTER TABLE public.waiting_list DISABLE ROW LEVEL SECURITY;

-- Add comment
COMMENT ON TABLE public.waiting_list IS 'Collects email addresses from users interested in joining the platform. Used for waiting list functionality.';

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_waiting_list_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER waiting_list_updated_at
    BEFORE UPDATE ON public.waiting_list
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_waiting_list_updated_at();

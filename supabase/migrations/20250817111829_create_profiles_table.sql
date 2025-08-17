-- Create profiles table with secure RLS policies
-- This table stores user profile information linked to Supabase Auth users

-- Create the profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    avatar_url TEXT,
    email TEXT,
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for secure access control

-- Policy: Users can only read their own profile
CREATE POLICY "profiles_are_self_readable" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

-- Policy: Users can only insert their own profile
CREATE POLICY "profiles_are_self_insertable" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Policy: Users can only update their own profile
CREATE POLICY "profiles_are_self_updatable" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Policy: Users can only delete their own profile
CREATE POLICY "profiles_are_self_deletable" ON public.profiles
    FOR DELETE USING (auth.uid() = id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Create a function to handle new user signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

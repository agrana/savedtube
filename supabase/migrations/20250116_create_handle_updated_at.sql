-- Shared trigger function used by early migrations for updated_at columns.
-- This must exist before tables create updated_at triggers.
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

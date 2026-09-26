-- Harden private application tables for NextAuth + service-role access.
-- Deny-by-default for anon/authenticated clients; explicit server (service_role) access.
-- Non-destructive: enables RLS, drops JWT-claim policies that do not apply to NextAuth,
-- and revokes direct client grants. Service role bypasses RLS and retains access.

DO $$
DECLARE
  private_tables text[] := ARRAY[
    'playlist_progress',
    'hidden_playlists',
    'video_intervals',
    'playlist_item_edits'
  ];
  table_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY private_tables
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    -- Drop any existing policies (including legacy auth.uid / JWT claim policies)
    FOR policy_record IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON public.%I',
        policy_record.policyname,
        table_name
      );
    END LOOP;

    -- Deny-by-default for roles subject to RLS (anon / authenticated)
    EXECUTE format(
      'ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',
      table_name
    );

    -- Revoke direct client access; server uses service_role
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC',
      table_name
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM anon',
      table_name
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM authenticated',
      table_name
    );
    EXECUTE format(
      'GRANT ALL ON TABLE public.%I TO service_role',
      table_name
    );

    EXECUTE format(
      'COMMENT ON TABLE public.%I IS %L',
      table_name,
      'Private user data. RLS enabled with no client policies (deny-by-default). Access via service_role from Next.js API routes after NextAuth session checks.'
    );
  END LOOP;
END;
$$;

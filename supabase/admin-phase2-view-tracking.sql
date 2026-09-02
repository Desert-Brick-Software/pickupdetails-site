-- Seller's Filter — Admin Phase 2: public view tracking columns + RPC
--
-- Purpose:
--   - add last_viewed_at and view_count on public.listings
--   - add a narrow SECURITY DEFINER RPC so the public listing API can
--     record a view without direct anon UPDATE on the table
--
-- This file does NOT:
--   - change edit tokens, statuses, titles, or other listing content
--   - drop or recreate existing RPCs
--   - add anon/authenticated table grants
--   - disable or weaken RLS
--   - change Storage
--
-- Run the MIGRATION section in the Supabase SQL editor after review.
-- Then run the VERIFICATION section (or re-run it anytime).
-- Do NOT run the ROLLBACK block unless reversing this change.
-- Do not auto-apply. Re-running the migration is intended to be safe.

-- ===========================================================================
-- MIGRATION
-- ===========================================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS view_count bigint NOT NULL DEFAULT 0;

-- New columns must not become readable/writable via leftover column grants.
-- Table-level REVOKE ALL from Phase 3 lockdown already covers anon; this
-- matches that lockdown for the new columns without granting anything.

REVOKE ALL (
  last_viewed_at,
  view_count
) ON TABLE public.listings FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- record_public_listing_view
-- Updates only last_viewed_at and view_count for an existing active or sold
-- listing. Does not return listing data, email, or edit_token.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_public_listing_view(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.listings
  SET
    last_viewed_at = now(),
    view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_id
    AND lower(status::text) IN ('active', 'sold');
END;
$$;

REVOKE ALL ON FUNCTION public.record_public_listing_view(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_listing_view(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.record_public_listing_view(uuid) TO service_role;

-- ===========================================================================
-- VERIFICATION (read-only — run after the migration, or re-run anytime)
-- Expected:
--   last_viewed_at = timestamp with time zone, nullable
--   view_count = bigint, not null, default 0
--   no table/column privileges on those columns for anon/authenticated/PUBLIC
--   anon and service_role EXECUTE = true on record_public_listing_view
--   authenticated EXECUTE = false
-- ===========================================================================

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'listings'
  AND column_name IN ('last_viewed_at', 'view_count')
ORDER BY column_name;

SELECT
  grantee,
  column_name,
  privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'listings'
  AND column_name IN ('last_viewed_at', 'view_count')
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'postgres', 'service_role')
ORDER BY grantee, column_name, privilege_type;

SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  r.rolname AS role_name,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS has_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'public'
  AND p.proname = 'record_public_listing_view'
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname;

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'listings';

-- ===========================================================================
-- ROLLBACK (do not run with the migration)
-- Drops the RPC and the two new columns. Existing listing rows otherwise
-- remain. Wrapped so it cannot execute if the whole file is run.
-- To roll back: copy the inner statements into a new SQL editor query.
-- ===========================================================================

/*
BEGIN ROLLBACK

REVOKE ALL ON FUNCTION public.record_public_listing_view(uuid) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.record_public_listing_view(uuid);

ALTER TABLE public.listings
  DROP COLUMN IF EXISTS last_viewed_at;

ALTER TABLE public.listings
  DROP COLUMN IF EXISTS view_count;

END ROLLBACK
*/

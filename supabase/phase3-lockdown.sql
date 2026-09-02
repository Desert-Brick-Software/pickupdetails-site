-- Seller's Filter — Phase 3 listings table lockdown
--
-- Purpose: remove direct anon/public table access now that production uses
-- Phase 1 SECURITY DEFINER RPCs.
--
-- This file does NOT:
--   - change listing row data, statuses, or edit tokens
--   - drop or recreate RPCs
--   - revoke EXECUTE from anon on the Phase 1 functions
--   - revoke privileges from postgres or service_role
--   - change table ownership
--   - disable RLS
--   - change Storage
--
-- Run the MIGRATION section in the Supabase SQL editor after review.
-- Then run the VERIFICATION section (or re-run it anytime).
-- Do NOT run the ROLLBACK block unless restoring the previous live state.

-- ===========================================================================
-- MIGRATION
-- ===========================================================================

-- Preflight: abort if the RPC layer is missing so we do not lock the table
-- out from under a broken function install.

DO $$
DECLARE
  missing text[] := ARRAY[]::text[];
  required text[] := ARRAY[
    'create_listing',
    'set_listing_image_urls',
    'get_listing_for_manage',
    'update_listing_for_manage',
    'mark_listing_sold',
    'get_listing_by_uuid_suffix',
    'get_public_listing_by_id',
    'get_active_listing_for_contact'
  ];
  fname text;
BEGIN
  FOREACH fname IN ARRAY required LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fname
    ) THEN
      missing := missing || fname;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'Phase 3 aborted: missing RPC function(s): %. Apply Phase 1 before lockdown. No listings policies or grants were changed.',
      array_to_string(missing, ', ');
  END IF;
END
$$;

-- Keep RLS enabled. Do not FORCE RLS (table owner / postgres must stay able
-- to administer rows). service_role retains BYPASSRLS.

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Drop the known live permissive policies, then drop any other leftover
-- policies on public.listings so direct-table access is deny-all for roles
-- that do not bypass RLS.

DROP POLICY IF EXISTS "Insert" ON public.listings;
DROP POLICY IF EXISTS "Select" ON public.listings;
DROP POLICY IF EXISTS "Update" ON public.listings;
DROP POLICY IF EXISTS "anon_delete_listings" ON public.listings;

-- Repo-era names, in case they still exist alongside the live names.
DROP POLICY IF EXISTS "anon_insert_listings" ON public.listings;
DROP POLICY IF EXISTS "anon_select_listings" ON public.listings;
DROP POLICY IF EXISTS "anon_update_listings" ON public.listings;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.listings', pol.policyname);
    RAISE NOTICE 'Dropped leftover listings policy: %', pol.policyname;
  END LOOP;
END
$$;

-- Revoke direct table DML/SELECT from API-facing roles only.
-- SECURITY DEFINER RPCs run as the function owner (postgres) and do not
-- depend on anon/authenticated/PUBLIC table privileges.

REVOKE ALL ON TABLE public.listings FROM anon;
REVOKE ALL ON TABLE public.listings FROM authenticated;
REVOKE ALL ON TABLE public.listings FROM PUBLIC;

-- Remove leftover column-level grants if any were issued separately from
-- table-level GRANT ALL. Does not affect postgres or service_role.

REVOKE ALL (
  id,
  title,
  description,
  price,
  availability,
  location,
  contact_email,
  edit_token,
  status,
  image_urls,
  created_at,
  sold_at
) ON TABLE public.listings FROM anon, authenticated, PUBLIC;

-- Re-affirm RPC EXECUTE for the live app client. Do not REVOKE from anon.

GRANT EXECUTE ON FUNCTION public.create_listing(text, text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_listing(text, text, text, text, text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.set_listing_image_urls(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.set_listing_image_urls(text, jsonb) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_listing_for_manage(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_listing_for_manage(text) TO service_role;

GRANT EXECUTE ON FUNCTION public.update_listing_for_manage(text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_listing_for_manage(text, text, text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.mark_listing_sold(text) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_listing_sold(text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_listing_by_uuid_suffix(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_listing_by_uuid_suffix(text) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_public_listing_by_id(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_listing_by_id(uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_active_listing_for_contact(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_listing_for_contact(uuid) TO service_role;

-- ===========================================================================
-- VERIFICATION (read-only — run after the migration, or re-run anytime)
-- Expected:
--   relrowsecurity = true, relforcerowsecurity = false
--   no rows in listings RLS policies
--   no table/column privileges for anon, authenticated, or PUBLIC
--   postgres/service_role still privileged on the table
--   anon and service_role EXECUTE = true on all 8 RPCs
--   authenticated EXECUTE = false on those RPCs
-- ===========================================================================

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'listings';

SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'listings'
ORDER BY policyname;

SELECT
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'listings'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC', 'postgres', 'service_role')
ORDER BY grantee, privilege_type;

SELECT
  grantee,
  column_name,
  privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'listings'
  AND column_name IN ('contact_email', 'edit_token')
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
  AND p.proname IN (
    'create_listing',
    'set_listing_image_urls',
    'get_listing_for_manage',
    'update_listing_for_manage',
    'mark_listing_sold',
    'get_listing_by_uuid_suffix',
    'get_public_listing_by_id',
    'get_active_listing_for_contact'
  )
  AND r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY p.proname, r.rolname;

-- ===========================================================================
-- ROLLBACK (do not run with the migration)
-- Restores the previous live listings RLS + table privileges only.
-- Wrapped so it cannot execute if the whole file is run.
-- To roll back: copy the inner statements (between BEGIN ROLLBACK and
-- END ROLLBACK) into a new SQL editor query and run them alone.
-- ===========================================================================

/*
BEGIN ROLLBACK

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insert" ON public.listings;
CREATE POLICY "Insert"
  ON public.listings
  FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Select" ON public.listings;
CREATE POLICY "Select"
  ON public.listings
  FOR SELECT
  TO public
  USING (status = 'active'::text);

DROP POLICY IF EXISTS "Update" ON public.listings;
CREATE POLICY "Update"
  ON public.listings
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_listings" ON public.listings;
CREATE POLICY "anon_delete_listings"
  ON public.listings
  FOR DELETE
  TO anon
  USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.listings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.listings TO authenticated;

END ROLLBACK
*/

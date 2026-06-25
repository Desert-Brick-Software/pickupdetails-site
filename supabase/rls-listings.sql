-- PickupDetails listings RLS policies for anon-client server API
--
-- AUDIT (repository): No RLS policy definitions exist in this codebase.
-- Policies must be verified/applied in the Supabase SQL editor before the
-- service-role rollback will work in production.
--
-- Run this in Supabase → SQL → New query after reviewing existing policies:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'listings';
--
-- Security model:
-- - Authorization (edit_token, field filtering) is enforced in Vercel API routes.
-- - These policies allow the anon role to perform the operations those routes need.
-- - The anon key must remain server-side only (Vercel env vars), not in browser code.

ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;

-- Create listing (api/create-listing.js)
DROP POLICY IF EXISTS "anon_insert_listings" ON public.listings;
CREATE POLICY "anon_insert_listings"
  ON public.listings
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Get listing by edit token (api/get-listing.js)
-- Update / mark sold by edit token (api/update-listing.js, api/mark-sold.js)
DROP POLICY IF EXISTS "anon_select_listings" ON public.listings;
CREATE POLICY "anon_select_listings"
  ON public.listings
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "anon_update_listings" ON public.listings;
CREATE POLICY "anon_update_listings"
  ON public.listings
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Public listing lookup by id (api/get-public-listing.js)
-- Covered by anon_select_listings above; API filters to active status and safe fields.

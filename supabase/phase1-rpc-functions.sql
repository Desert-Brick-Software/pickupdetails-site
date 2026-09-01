-- Seller's Filter — Phase 1 RPC layer
--
-- Purpose: add replacement listing RPCs while the live application continues
-- using table INSERT/SELECT/UPDATE/DELETE under current RLS and grants.
--
-- This file does NOT:
--   - alter listings table GRANT/REVOKE (except UNIQUE on edit_token)
--   - drop or change listings RLS policies
--   - change Storage policies or the listing-images bucket
--
-- Run manually in the Supabase SQL editor after review. Do not auto-apply.
-- Re-running is intended to be safe (IF NOT EXISTS / CREATE OR REPLACE).

-- ---------------------------------------------------------------------------
-- Unique edit_token
-- 256-bit random tokens should never collide; uniqueness enforces that
-- assumption for token-based authorization. Multiple NULLs remain allowed.
-- Fails loudly if duplicates exist. Does not rewrite existing tokens.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.listings
    WHERE edit_token IS NOT NULL
    GROUP BY edit_token
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot add UNIQUE constraint on public.listings.edit_token because duplicate tokens exist. Resolve duplicates before rerunning this migration. Existing tokens were not modified.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.listings'::regclass
      AND conname = 'listings_edit_token_key'
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_edit_token_key UNIQUE (edit_token);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- create_listing
-- Vercel generates the 64-hex edit_token. Caller cannot set id/status/sold_at.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_listing(
  p_title text,
  p_description text,
  p_price text,
  p_availability text,
  p_location text,
  p_contact_email text,
  p_edit_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_description text;
  v_price text;
  v_availability text;
  v_location text;
  v_contact_email text;
  v_id uuid;
BEGIN
  IF p_edit_token IS NULL OR p_edit_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid edit token'
      USING ERRCODE = '22023';
  END IF;

  v_title := NULLIF(btrim(p_title), '');
  v_description := NULLIF(btrim(p_description), '');
  v_contact_email := NULLIF(btrim(p_contact_email), '');
  v_price := NULLIF(btrim(p_price), '');
  v_availability := NULLIF(btrim(p_availability), '');
  v_location := NULLIF(btrim(p_location), '');

  IF v_title IS NULL OR v_description IS NULL OR v_contact_email IS NULL THEN
    RAISE EXCEPTION 'Missing required fields'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.listings (
    title,
    description,
    price,
    availability,
    location,
    contact_email,
    edit_token,
    status,
    sold_at,
    image_urls
  ) VALUES (
    v_title,
    v_description,
    v_price,
    v_availability,
    v_location,
    v_contact_email,
    p_edit_token,
    'active',
    NULL,
    '[]'::jsonb
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- set_listing_image_urls
-- Authorization is the edit token, not listing id. Active listings only.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_listing_image_urls(
  p_edit_token text,
  p_image_urls jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF p_edit_token IS NULL OR p_edit_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_image_urls IS NULL OR jsonb_typeof(p_image_urls) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_image_urls');
  END IF;

  SELECT id, status
    INTO v_id, v_status
  FROM public.listings
  WHERE edit_token = p_edit_token;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF lower(v_status) <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sold');
  END IF;

  UPDATE public.listings
  SET image_urls = p_image_urls
  WHERE id = v_id
    AND edit_token = p_edit_token
    AND lower(status) = 'active';

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- get_listing_for_manage
-- Same field list as api/get-listing.js. Works for active and sold rows.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_listing_for_manage(
  p_edit_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing jsonb;
BEGIN
  IF p_edit_token IS NULL OR p_edit_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', id,
    'title', title,
    'description', description,
    'price', price,
    'availability', availability,
    'image_urls', image_urls,
    'status', status,
    'created_at', created_at
  )
    INTO v_listing
  FROM public.listings
  WHERE edit_token = p_edit_token;

  RETURN v_listing;
END;
$$;

-- ---------------------------------------------------------------------------
-- update_listing_for_manage
-- Allowlist matches api/update-listing.js. Rejects sold listings.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_listing_for_manage(
  p_edit_token text,
  p_title text,
  p_description text,
  p_price text,
  p_availability text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF p_edit_token IS NULL OR p_edit_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, status
    INTO v_id, v_status
  FROM public.listings
  WHERE edit_token = p_edit_token;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF lower(v_status) = 'sold' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sold');
  END IF;

  UPDATE public.listings
  SET
    title = NULLIF(btrim(p_title), ''),
    description = NULLIF(btrim(p_description), ''),
    price = NULLIF(btrim(p_price), ''),
    availability = NULLIF(btrim(p_availability), '')
  WHERE id = v_id
    AND edit_token = p_edit_token
    AND lower(status) <> 'sold';

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- mark_listing_sold
-- Preserves the row. Idempotent. Does not delete Storage objects.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_listing_sold(
  p_edit_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF p_edit_token IS NULL OR p_edit_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT id, status
    INTO v_id, v_status
  FROM public.listings
  WHERE edit_token = p_edit_token;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF lower(v_status) = 'sold' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'id', v_id,
      'status', 'sold',
      'already_sold', true
    );
  END IF;

  UPDATE public.listings
  SET
    status = 'sold',
    sold_at = COALESCE(sold_at, now())
  WHERE id = v_id
    AND edit_token = p_edit_token;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'status', 'sold',
    'already_sold', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- get_listing_by_uuid_suffix
-- Same public JSON shape and LIMIT 2 collision behavior. SECURITY DEFINER
-- so it still works after later column/RLS tightening.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_listing_by_uuid_suffix(suffix text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(row_data ORDER BY created_at DESC), '[]'::jsonb)
  FROM (
    SELECT
      jsonb_build_object(
        'id', id,
        'title', title,
        'description', description,
        'price', price,
        'availability', availability,
        'location', location,
        'image_urls', image_urls,
        'status', status,
        'created_at', created_at
      ) AS row_data,
      created_at
    FROM public.listings
    WHERE suffix ~ '^[0-9a-f]{8}$'
      AND lower(left(id::text, 8)) = lower(suffix)
      AND lower(status::text) IN ('active', 'sold')
    LIMIT 2
  ) matches;
$$;

-- ---------------------------------------------------------------------------
-- get_public_listing_by_id
-- Included so Phase 2 can stop using table SELECT for public-by-id lookups.
-- Live SELECT RLS is case-sensitive status = 'active', which hides 'Active'
-- defaults and sold rows. This function uses lower(status) and returns the
-- same public field list as the suffix RPC (including sold rows so the API
-- can classify them). Never returns contact_email or edit_token.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_public_listing_by_id(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing jsonb;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', id,
    'title', title,
    'description', description,
    'price', price,
    'availability', availability,
    'location', location,
    'image_urls', image_urls,
    'status', status,
    'created_at', created_at
  )
    INTO v_listing
  FROM public.listings
  WHERE id = p_id
    AND lower(status::text) IN ('active', 'sold');

  RETURN v_listing;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_active_listing_for_contact
-- Field list matches api/contact-seller.js. Active only (case-insensitive).
-- MVP residual risk: anyone who can EXECUTE this as anon and who already
-- knows a listing UUID can retrieve that listing's contact_email.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_active_listing_for_contact(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing jsonb;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', id,
    'title', title,
    'price', price,
    'availability', availability,
    'location', location,
    'status', status,
    'contact_email', contact_email
  )
    INTO v_listing
  FROM public.listings
  WHERE id = p_id
    AND lower(status) = 'active';

  RETURN v_listing;
END;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- Default is EXECUTE for PUBLIC; revoke that on every DEFINER function.
-- Grant only to anon (current Vercel client) and service_role (future admin).
-- Do not grant to authenticated. Table privileges are left unchanged.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_listing(text, text, text, text, text, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing(text, text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_listing(text, text, text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.set_listing_image_urls(text, jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.set_listing_image_urls(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.set_listing_image_urls(text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.get_listing_for_manage(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_for_manage(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_listing_for_manage(text) TO service_role;

REVOKE ALL ON FUNCTION public.update_listing_for_manage(text, text, text, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.update_listing_for_manage(text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_listing_for_manage(text, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_listing_sold(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_listing_sold(text) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_listing_sold(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_listing_by_uuid_suffix(text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_by_uuid_suffix(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_listing_by_uuid_suffix(text) TO service_role;

REVOKE ALL ON FUNCTION public.get_public_listing_by_id(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_listing_by_id(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_listing_by_id(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_active_listing_for_contact(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_listing_for_contact(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_active_listing_for_contact(uuid) TO service_role;

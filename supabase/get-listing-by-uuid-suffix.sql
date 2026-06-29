-- Lookup active and sold listings by the first 8 hex characters of listing UUID.
-- Used by /l/<slug>-<suffix> public URLs (api/get-public-listing.js).
--
-- Run in Supabase → SQL → New query.

CREATE OR REPLACE FUNCTION public.get_listing_by_uuid_suffix(suffix text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
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

REVOKE ALL ON FUNCTION public.get_listing_by_uuid_suffix(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listing_by_uuid_suffix(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_listing_by_uuid_suffix(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_by_uuid_suffix(text) TO service_role;

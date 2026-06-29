-- Allow server API (anon key) to list and delete listing images when a seller marks a listing as sold.
-- Run in Supabase → SQL → New query after reviewing existing storage policies:
--   SELECT policyname, cmd, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'objects' AND schemaname = 'storage';

DROP POLICY IF EXISTS "anon_select_listing_images" ON storage.objects;
CREATE POLICY "anon_select_listing_images"
  ON storage.objects
  FOR SELECT
  TO anon
  USING (bucket_id = 'listing-images');

DROP POLICY IF EXISTS "anon_delete_listing_images" ON storage.objects;
CREATE POLICY "anon_delete_listing_images"
  ON storage.objects
  FOR DELETE
  TO anon
  USING (bucket_id = 'listing-images');

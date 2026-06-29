-- Record when a listing was marked as sold (used for future automatic cleanup).
-- Run in Supabase → SQL → New query.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS sold_at timestamptz;

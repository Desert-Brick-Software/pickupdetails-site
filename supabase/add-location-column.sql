-- Add optional pickup area / location to listings
-- Run in Supabase → SQL → New query

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS location text;

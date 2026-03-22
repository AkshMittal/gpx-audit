-- One-time backfill for legacy rows where tracks.data_source IS NULL.
-- Run in Supabase SQL editor (or psql) after review.
--
-- 1) Custom-test cohort (UID prefix from adversarial / fixture imports)
UPDATE public.tracks
SET data_source = 'custom-test'
WHERE data_source IS NULL
  AND track_uid LIKE 'custom-test-%';

-- 2) Remaining NULLs → main Hikr cohort
UPDATE public.tracks
SET data_source = 'hikr_12k'
WHERE data_source IS NULL;

-- Verify
-- SELECT data_source, count(*) FROM public.tracks GROUP BY 1 ORDER BY 1;

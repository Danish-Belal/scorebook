-- Optional monthly / manual cleanup (PRODUCTION_CHECKLIST DB-5)
-- Removes old failed platform_data rows. Run in Neon SQL editor or psql when needed.
-- Adjust interval (e.g. 90 days) for your retention policy.

-- DELETE FROM platform_data
-- WHERE fetch_status = 'error'
--   AND fetched_at < NOW() - INTERVAL '30 days';

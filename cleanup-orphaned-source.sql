-- Check for sources with null source_id
SELECT * FROM pipedream_sources WHERE source_id IS NULL;

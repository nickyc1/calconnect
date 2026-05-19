-- Migration 009: Enable RLS lockdown on all public tables
--
-- Fixes Supabase security warnings:
--   - rls_disabled_in_public
--   - sensitive_columns_exposed
--
-- Strategy: CalConnect is a server-only app. All DB access goes through
-- SUPABASE_SERVICE_ROLE_KEY in Next.js API routes. The anon and authenticated
-- roles should not be able to read or write anything in public.* directly.
--
-- We do two things:
--   1. ENABLE ROW LEVEL SECURITY on every public table (with no policies,
--      which means anon/authenticated are denied; service_role still bypasses
--      RLS as designed).
--   2. REVOKE the SELECT grants previously given to anon/authenticated in
--      migration 001 — belt and suspenders so the public anon key is useless
--      against this schema.

-- 1. Enable RLS on every existing table in public
ALTER TABLE IF EXISTS public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pipedream_sources   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.event_mappings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook_events      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.watch_channels      ENABLE ROW LEVEL SECURITY;
-- connect_tokens already has RLS enabled (migration 006), but ensure it.
ALTER TABLE IF EXISTS public.connect_tokens      ENABLE ROW LEVEL SECURITY;

-- 2. Revoke the broad SELECT grants from migration 001.
--    Service role retains ALL privileges via the GRANT ALL ... TO service_role
--    line in migration 001, so the server keeps working.
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Also make sure no future tables get auto-granted to anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM anon, authenticated;

-- Independent optional tips consent. No customer consent/enrollment backfill.
-- Existing email_opt_in_at remains setup consent; global unsubscribe stays authoritative.
alter table public.activation_profiles
  add column tips_opt_in_at timestamptz;

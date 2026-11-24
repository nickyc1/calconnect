-- Remember manually granted lifetime access across a later paid-plan upgrade.
alter table public.user_billing add column lifetime_entitled boolean not null default false;
update public.user_billing set lifetime_entitled = true where plan = 'lifetime';
-- Service-only serialization. No customer billing changes or email enrollment.
create table public.operation_locks (
  key text primary key, owner uuid not null, expires_at timestamptz not null
);
alter table public.operation_locks enable row level security;
create function public.acquire_operation_lock(lock_key text, lock_owner uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into operation_locks values (lock_key, lock_owner, now() + interval '5 minutes')
  on conflict (key) do update set owner = excluded.owner, expires_at = excluded.expires_at
    where operation_locks.expires_at < now();
  return found;
end $$;
revoke all on function public.acquire_operation_lock(text, uuid) from public, anon, authenticated;
grant execute on function public.acquire_operation_lock(text, uuid) to service_role;
create table public.billing_checkout_attempts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 request_id uuid not null, intent text not null, quantity integer not null,
 session_id text, created_at timestamptz not null default now()
);
alter table public.billing_checkout_attempts enable row level security;

create table public.activation_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 first_live_mirror_at timestamptz, confirmed_at timestamptz,
 dismissed boolean not null default false,
 email_opt_in_at timestamptz, unsubscribed_at timestamptz,
 suppressed boolean not null default false,
 cohort text check (cohort in ('new', 'existing')),
 enrolled_at timestamptz,
 last_email_at timestamptz
);
alter table public.activation_profiles enable row level security;
create table public.activation_support_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), resolved_at timestamptz,
 message text not null check (length(message) between 1 and 2000),
 snapshot jsonb not null
);
create unique index activation_one_open_request on public.activation_support_requests(user_id) where resolved_at is null;
alter table public.activation_support_requests enable row level security;
create table public.lifecycle_outbox (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 step text not null, status text not null default 'review' check(status in ('review','approved','sending','sent','skipped','unknown')),
 created_at timestamptz not null default now(), sent_at timestamptz,
 approved_at timestamptz, provider_id text,
 unique(user_id,step)
);
alter table public.lifecycle_outbox enable row level security;
-- Observe actual live fan-out, never backfill or the empty recurring marker.
create function public.record_first_live_mirror() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if not new.via_backfill and jsonb_typeof(new.mirrored_events::jsonb) = 'array'
    and jsonb_array_length(new.mirrored_events::jsonb) > 0 then
   insert into activation_profiles(user_id, first_live_mirror_at) values(new.user_id, now())
   on conflict(user_id) do update set first_live_mirror_at = coalesce(activation_profiles.first_live_mirror_at, excluded.first_live_mirror_at);
 end if;
 return new;
end $$;
create trigger record_first_live_mirror after insert on public.event_mappings
 for each row execute function public.record_first_live_mirror();
-- Existing successful mirrors are evidence, not permission to send email.
insert into activation_profiles(user_id, first_live_mirror_at)
select user_id, min(created_at) from event_mappings
where not via_backfill and jsonb_typeof(mirrored_events::jsonb) = 'array'
 and jsonb_array_length(mirrored_events::jsonb) > 0 group by user_id
on conflict(user_id) do nothing;
alter table public.lifecycle_outbox add column payload jsonb not null;

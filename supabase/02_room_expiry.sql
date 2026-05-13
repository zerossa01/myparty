-- =====================================================================
-- Migration: room expiry
-- Adds expires_at to rooms (default now() + 24h) and a daily cleanup job.
-- Run AFTER schema.sql.
-- =====================================================================

alter table public.rooms
  add column if not exists expires_at timestamptz
    not null default (now() + interval '24 hours');

create index if not exists rooms_expires_at_idx on public.rooms(expires_at);

-- ---------------------------------------------------------------------
-- Scheduled cleanup with pg_cron
-- Requires the pg_cron extension. Enable it in:
--   Database → Extensions → pg_cron → Enable.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;

-- Drop any prior version of the same job before re-scheduling.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'rave_cleanup_expired_rooms';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
end$$;

-- Run hourly: delete every room that has expired (older than 24h since
-- creation by default, or whatever expires_at says).
select cron.schedule(
  'rave_cleanup_expired_rooms',
  '0 * * * *',  -- every hour, on the hour
  $$ delete from public.rooms where expires_at < now(); $$
);

-- ---------------------------------------------------------------------
-- (Optional) RLS update policy for hosts so they can change video_url.
-- Uncomment if you want hosts to persist the loaded video URL.
-- ---------------------------------------------------------------------
-- drop policy if exists "rooms_update_host" on public.rooms;
-- create policy "rooms_update_host"
--   on public.rooms for update
--   using (auth.uid()::text = host_id)
--   with check (auth.uid()::text = host_id);

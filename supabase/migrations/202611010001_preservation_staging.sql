-- First migration: private preservation/reconciliation area only.
-- Does not activate sync or import financial data automatically.
begin;

create schema if not exists financeapp_private;
revoke all on schema financeapp_private from public, anon, authenticated;

create table public.financeapp_households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  sync_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table financeapp_private.memberships (
  household_id uuid not null references public.financeapp_households(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create function financeapp_private.is_member(target_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from financeapp_private.memberships m
    where m.household_id = target_household
      and m.user_id = (select auth.uid()) and m.active
  );
$$;
revoke all on function financeapp_private.is_member(uuid) from public, anon;
grant usage on schema financeapp_private to authenticated;
grant execute on function financeapp_private.is_member(uuid) to authenticated;

alter table public.financeapp_households enable row level security;
create policy household_member_read on public.financeapp_households
for select to authenticated using (financeapp_private.is_member(id));
revoke all on public.financeapp_households from public, anon, authenticated;
grant select on public.financeapp_households to authenticated;

create table financeapp_private.migration_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.financeapp_households(id),
  state text not null default 'capturing'
    check (state in ('capturing', 'reconciling', 'validated', 'cutover', 'aborted')),
  expected_devices jsonb not null default '[]'::jsonb check (jsonb_typeof(expected_devices) = 'array'),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  unique (household_id, id)
);

create table financeapp_private.source_backups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  migration_run_id uuid not null,
  source_kind text not null check (source_kind in ('iphone', 'sheets', 'apps_script')),
  source_id text not null check (length(source_id) between 1 and 500),
  source_origin text,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  -- Exact envelope text or export manifest; retain original external files too.
  envelope_text text not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  restore_verified_at timestamptz,
  foreign key (household_id, migration_run_id)
    references financeapp_private.migration_runs(household_id, id),
  unique (migration_run_id, source_kind, source_id, sha256),
  unique (household_id, migration_run_id, id)
);

create table financeapp_private.source_records (
  id bigint generated always as identity primary key,
  household_id uuid not null,
  migration_run_id uuid not null,
  source_backup_id uuid not null,
  table_name text not null,
  source_ordinal bigint not null check (source_ordinal >= 0),
  legacy_id text,
  entity_uuid text,
  original_record jsonb not null,
  record_sha256 text not null check (record_sha256 ~ '^[0-9a-f]{64}$'),
  foreign key (household_id, migration_run_id, source_backup_id)
    references financeapp_private.source_backups(household_id, migration_run_id, id),
  unique (source_backup_id, table_name, source_ordinal)
  -- UUID intentionally not unique in staging: preserve duplicates for review.
);

create table financeapp_private.reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  migration_run_id uuid not null,
  table_name text not null,
  entity_key text not null,
  issue_kind text not null,
  source_record_ids bigint[] not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'preserved')),
  resolution jsonb,
  created_at timestamptz not null default now(),
  foreign key (household_id, migration_run_id)
    references financeapp_private.migration_runs(household_id, id),
  check (status = 'open' or resolution is not null)
);

create index source_records_by_uuid on financeapp_private.source_records
  (migration_run_id, table_name, entity_uuid);
create index reconciliation_open on financeapp_private.reconciliation_issues
  (migration_run_id, status);

-- Staging is server/admin-only. No client write or read policies.
alter table financeapp_private.memberships enable row level security;
alter table financeapp_private.migration_runs enable row level security;
alter table financeapp_private.source_backups enable row level security;
alter table financeapp_private.source_records enable row level security;
alter table financeapp_private.reconciliation_issues enable row level security;
revoke all on all tables in schema financeapp_private from public, anon, authenticated;
revoke all on all sequences in schema financeapp_private from public, anon, authenticated;
grant usage on schema financeapp_private to service_role;
grant all on all tables in schema financeapp_private to service_role;
grant all on all sequences in schema financeapp_private to service_role;
grant all on public.financeapp_households to service_role;

commit;

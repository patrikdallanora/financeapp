-- Private, insert-only transport. Never appends to or replaces source_backups.
begin;
create table financeapp_private.backup_archives (
  source_backup_id uuid primary key,
  household_id uuid not null,
  migration_run_id uuid not null,
  chunk_count integer not null check (chunk_count > 0),
  file_bytes bigint not null check (file_bytes > 0),
  expected_records bigint not null check (expected_records >= 0),
  expected_records_sha256 text not null check (expected_records_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (household_id,migration_run_id,source_backup_id)
    references financeapp_private.source_backups(household_id,migration_run_id,id)
);
create index backup_archives_by_household on financeapp_private.backup_archives(household_id,migration_run_id,source_backup_id);
create table financeapp_private.backup_archive_chunks (
  source_backup_id uuid not null references financeapp_private.backup_archives(source_backup_id),
  chunk_index integer not null check (chunk_index >= 0),
  content text not null check (octet_length(content) between 1 and 65536),
  sha256 text not null check (sha256 = encode(sha256(convert_to(content,'UTF8')),'hex')),
  primary key (source_backup_id,chunk_index)
);
create table financeapp_private.backup_archive_receipts (
  source_backup_id uuid primary key references financeapp_private.backup_archives(source_backup_id),
  file_sha256 text not null,
  records_sha256 text not null,
  verified_at timestamptz not null default now()
);

create function financeapp_private.reject_preservation_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Preservation records are immutable'; end;
$$;
revoke all on function financeapp_private.reject_preservation_mutation() from public,anon,authenticated;

create function financeapp_private.guard_archive_chunk()
returns trigger language plpgsql set search_path = '' as $$
declare archive financeapp_private.backup_archives;
begin
  select * into strict archive from financeapp_private.backup_archives where source_backup_id=new.source_backup_id for update;
  if exists(select 1 from financeapp_private.backup_archive_chunks where source_backup_id=new.source_backup_id and chunk_index=new.chunk_index) then
    if exists(select 1 from financeapp_private.backup_archive_chunks where source_backup_id=new.source_backup_id and chunk_index=new.chunk_index and content=new.content and sha256=new.sha256) then return null; end if;
    raise exception 'Existing chunk differs';
  end if;
  if exists(select 1 from financeapp_private.backup_archive_receipts where source_backup_id=new.source_backup_id) then
    raise exception 'Archive already sealed';
  end if;
  if new.chunk_index >= archive.chunk_count then raise exception 'Invalid chunk index'; end if;
  return new;
end;
$$;
revoke all on function financeapp_private.guard_archive_chunk() from public,anon,authenticated;
create trigger archive_chunk_insert before insert on financeapp_private.backup_archive_chunks
for each row execute function financeapp_private.guard_archive_chunk();

create function financeapp_private.verify_archive_receipt()
returns trigger language plpgsql set search_path = '' as $$
declare archive financeapp_private.backup_archives; file_text text; chunks bigint; actual_records bigint; actual_records_hash text; expected_file_hash text;
begin
  select * into strict archive from financeapp_private.backup_archives where source_backup_id=new.source_backup_id for update;
  select count(*),string_agg(content,'' order by chunk_index) into chunks,file_text
    from financeapp_private.backup_archive_chunks where source_backup_id=new.source_backup_id;
  select sha256 into strict expected_file_hash from financeapp_private.source_backups where id=new.source_backup_id;
  if chunks <> archive.chunk_count or octet_length(file_text) <> archive.file_bytes
    or encode(sha256(convert_to(file_text,'UTF8')),'hex') <> expected_file_hash then
    raise exception 'Archive file is incomplete or hash differs';
  end if;
  select count(*),encode(sha256(convert_to(coalesce(string_agg(table_name||chr(9)||source_ordinal::text||chr(9)||original_record::text,chr(10) order by table_name collate "C",source_ordinal),''),'UTF8')),'hex')
    into actual_records,actual_records_hash from financeapp_private.source_records where source_backup_id=new.source_backup_id;
  if actual_records<>archive.expected_records or actual_records_hash<>archive.expected_records_sha256 then
    raise exception 'Archive records are incomplete or differ';
  end if;
  new.file_sha256 := expected_file_hash;
  new.records_sha256 := actual_records_hash;
  new.verified_at := now();
  return new;
end;
$$;
revoke all on function financeapp_private.verify_archive_receipt() from public,anon,authenticated;
create trigger archive_verify_receipt before insert on financeapp_private.backup_archive_receipts
for each row execute function financeapp_private.verify_archive_receipt();

do $$ declare t text; begin
  foreach t in array array['backup_archives','backup_archive_chunks','backup_archive_receipts','source_records'] loop
    execute format('create trigger preservation_immutable before update or delete on financeapp_private.%I for each row execute function financeapp_private.reject_preservation_mutation()',t);
    execute format('create trigger preservation_no_truncate before truncate on financeapp_private.%I for each statement execute function financeapp_private.reject_preservation_mutation()',t);
  end loop;
end $$;
alter table financeapp_private.backup_archives enable row level security;
alter table financeapp_private.backup_archive_chunks enable row level security;
alter table financeapp_private.backup_archive_receipts enable row level security;
revoke all on financeapp_private.backup_archives,financeapp_private.backup_archive_chunks,financeapp_private.backup_archive_receipts from public,anon,authenticated,service_role;
grant select,insert on financeapp_private.backup_archives,financeapp_private.backup_archive_chunks,financeapp_private.backup_archive_receipts to service_role;
-- Row locks in the insert guards need UPDATE privilege; the mutation trigger still rejects updates.
grant update on financeapp_private.backup_archives to service_role;
commit;

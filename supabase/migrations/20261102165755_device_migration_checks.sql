begin;
create table financeapp_private.migration_device_checks (
 household_id uuid not null,
 migration_run_id uuid not null,
 source_device_id uuid not null,
 candidate_sha256 text not null,
 user_id uuid not null references auth.users(id),
 checked_at timestamptz not null default now(),
 primary key(household_id,migration_run_id,source_device_id,candidate_sha256),
 foreign key(household_id,migration_run_id) references financeapp_private.migration_runs(household_id,id)
);
create index migration_device_checks_user on financeapp_private.migration_device_checks(user_id);
alter table financeapp_private.migration_device_checks enable row level security;
revoke all on financeapp_private.migration_device_checks from public,anon,authenticated;
grant select,insert on financeapp_private.migration_device_checks to service_role;
create trigger device_check_immutable before update or delete on financeapp_private.migration_device_checks for each row execute function financeapp_private.reject_preservation_mutation();

create function financeapp_private.migration_status(p_household uuid,p_device uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare import financeapp_private.canonical_imports; run financeapp_private.migration_runs; known boolean;
begin
 if (select auth.uid()) is null or not financeapp_private.is_member(p_household) then raise exception 'Not a household member' using errcode='42501'; end if;
 select * into strict import from financeapp_private.canonical_imports where household_id=p_household order by created_at desc limit 1;
 select * into strict run from financeapp_private.migration_runs where household_id=p_household and id=import.migration_run_id;
 select exists(select 1 from financeapp_private.source_backups b where b.household_id=p_household and b.migration_run_id=import.migration_run_id and b.source_kind='iphone' and b.source_id=p_device::text
  and ((b.restore_verified_at is not null and encode(sha256(convert_to(b.envelope_text,'UTF8')),'hex')=b.sha256)
   or exists(select 1 from financeapp_private.backup_archive_receipts a where a.source_backup_id=b.id and a.file_sha256=b.sha256))) into known;
 return jsonb_build_object('candidateSha256',import.candidate_sha256,'counts',import.manifest->'counts','knownDevice',known,
  'deviceConfirmed',exists(select 1 from financeapp_private.migration_device_checks c where c.household_id=p_household and c.migration_run_id=import.migration_run_id and c.source_device_id=p_device and c.candidate_sha256=import.candidate_sha256),
  'confirmedDevices',(select count(*) from financeapp_private.migration_device_checks c where c.household_id=p_household and c.migration_run_id=import.migration_run_id and c.candidate_sha256=import.candidate_sha256),
  'expectedDevices',jsonb_array_length(run.expected_devices));
end $$;
revoke all on function financeapp_private.migration_status(uuid,uuid) from public,anon;
grant execute on function financeapp_private.migration_status(uuid,uuid) to authenticated;
create function public.financeapp_migration_status(p_household uuid,p_device uuid) returns jsonb language sql security invoker set search_path='' as $$select financeapp_private.migration_status(p_household,p_device)$$;
revoke all on function public.financeapp_migration_status(uuid,uuid) from public,anon;
grant execute on function public.financeapp_migration_status(uuid,uuid) to authenticated;

create function financeapp_private.confirm_migration_device(p_household uuid,p_device uuid,p_candidate text)
returns void language plpgsql security definer set search_path='' as $$
declare status jsonb; import financeapp_private.canonical_imports;
begin
 status:=financeapp_private.migration_status(p_household,p_device);
 if not (status->>'knownDevice')::boolean then raise exception 'Use the original iPhone installed app to confirm'; end if;
 if status->>'candidateSha256' is distinct from p_candidate then raise exception 'Snapshot changed; download again'; end if;
 select * into strict import from financeapp_private.canonical_imports where household_id=p_household and candidate_sha256=p_candidate order by created_at desc limit 1;
 insert into financeapp_private.migration_device_checks(household_id,migration_run_id,source_device_id,candidate_sha256,user_id) values(p_household,import.migration_run_id,p_device,p_candidate,(select auth.uid())) on conflict do nothing;
end $$;
revoke all on function financeapp_private.confirm_migration_device(uuid,uuid,text) from public,anon;
grant execute on function financeapp_private.confirm_migration_device(uuid,uuid,text) to authenticated;
create function public.financeapp_confirm_migration_device(p_household uuid,p_device uuid,p_candidate text) returns void language sql security invoker set search_path='' as $$select financeapp_private.confirm_migration_device(p_household,p_device,p_candidate)$$;
revoke all on function public.financeapp_confirm_migration_device(uuid,uuid,text) from public,anon;
grant execute on function public.financeapp_confirm_migration_device(uuid,uuid,text) to authenticated;
commit;

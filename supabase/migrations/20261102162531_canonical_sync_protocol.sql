begin;
-- Canonical payloads use UUID relations, integer centavos and civil dates.
-- Raw legacy records and all unknown fields remain in private preservation.
create table financeapp_private.sync_clocks (
 household_id uuid primary key references public.financeapp_households(id),
 counter bigint not null default 0 check(counter>=0)
);
create table public.financeapp_records (
 household_id uuid not null references public.financeapp_households(id),
 table_name text not null check(table_name in ('usuarios','cartoes','categorias','subcategorias','lancamentos','faturas','metas')),
 uuid uuid not null,
 payload jsonb not null check(jsonb_typeof(payload)='object' and payload?'uuid' and payload->>'uuid'=uuid::text),
 revision bigint not null,
 updated_at timestamptz not null,
 deleted_at timestamptz,
 primary key(household_id,table_name,uuid)
);
create table financeapp_private.change_log (
 household_id uuid not null references public.financeapp_households(id),
 revision bigint not null,
 table_name text not null,
 uuid uuid not null,
 payload jsonb not null,
 deleted_at timestamptz,
 primary key(household_id,revision)
);
create index records_by_subcategory on public.financeapp_records(household_id,(payload->>'subcategoriaUuid')) where table_name='lancamentos';
create table financeapp_private.mutation_receipts (
 household_id uuid not null references public.financeapp_households(id),
 mutation_id uuid not null,
 user_id uuid not null references auth.users(id),
 device_id uuid not null,
 request_sha256 text not null,
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key(household_id,mutation_id)
);
create index mutation_receipts_by_user on financeapp_private.mutation_receipts(user_id);
create table financeapp_private.identity_aliases (
 household_id uuid not null,
 table_name text not null,
 legacy_uuid uuid not null,
 canonical_uuid uuid not null,
 reason text not null,
 primary key(household_id,table_name,legacy_uuid),
 foreign key(household_id,table_name,canonical_uuid) references public.financeapp_records(household_id,table_name,uuid)
);
create index identity_aliases_target on financeapp_private.identity_aliases(household_id,table_name,canonical_uuid);
create table financeapp_private.canonical_imports (
 household_id uuid not null,
 migration_run_id uuid not null,
 candidate_sha256 text not null,
 manifest jsonb not null,
 decisions jsonb not null,
 created_at timestamptz not null default now(),
 primary key(household_id,migration_run_id),
 foreign key(household_id,migration_run_id) references financeapp_private.migration_runs(household_id,id)
);

create function financeapp_private.validate_canonical_payload() returns trigger
language plpgsql set search_path='' as $$
declare field text; value text;
begin
 if octet_length(new.payload::text)>262144 then raise exception 'Payload too large'; end if;
 for field in select unnest(array['id','usuarioId','cartaoId','categoriaId','subcategoriaId','syncStatus','lastSyncedAt','envioIncerto']) loop
  if new.payload ? field then raise exception 'Local-only field in canonical payload: %',field; end if;
 end loop;
 foreach field in array array['valor','limite','valorAlvo','faturaValorPago'] loop
  if new.payload ? field then
   value:=new.payload->>field;
   if value is null or jsonb_typeof(new.payload->field)<>'number' or value!~'^-?[0-9]+$' or abs(value::numeric)>9007199254740991 then raise exception 'Invalid centavos: %',field; end if;
  end if;
 end loop;
 foreach field in array array['usuarioUuid','cartaoUuid','categoriaUuid','subcategoriaUuid'] loop
  value:=new.payload->>field;
  if value is not null and value<>'' then perform value::uuid; end if;
 end loop;
 foreach field in array array['dataCompetencia','dataPagamento','dataInicio','dataFim'] loop
  value:=new.payload->>field;
  if value is not null and (value!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or value::date::text<>value) then raise exception 'Invalid civil date: %',field; end if;
 end loop;
 foreach field in array array['faturaRef','mesReferencia'] loop
  value:=new.payload->>field;
  if value is not null and (value!~'^[0-9]{4}-[0-9]{2}$' or (value||'-01')::date::text<>value||'-01') then raise exception 'Invalid month: %',field; end if;
 end loop;
 if new.table_name='lancamentos' and (not(new.payload?'valor') or not(new.payload?'dataCompetencia') or coalesce(new.payload->>'tipo','') not in ('receita','despesa') or coalesce(new.payload->>'status','') not in ('pago','pendente')) then raise exception 'Incomplete financial entry'; end if;
 new.deleted_at:=nullif(new.payload->>'deletedAt','')::timestamptz;
 -- Serializes writers BEFORE allocating any cursor, including admin imports.
 perform pg_advisory_xact_lock(hashtextextended(new.household_id::text,0));
 insert into financeapp_private.sync_clocks(household_id,counter) values(new.household_id,1)
 on conflict(household_id) do update set counter=financeapp_private.sync_clocks.counter+1 returning counter into new.revision;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function financeapp_private.validate_canonical_payload() from public,anon,authenticated;
create trigger canonical_validate before insert or update on public.financeapp_records
for each row execute function financeapp_private.validate_canonical_payload();

create function financeapp_private.check_canonical_relations() returns trigger
language plpgsql set search_path='' as $$
declare field text; target text; target_uuid uuid; subcat_category text;
begin
 for field,target in select * from (values ('usuarioUuid','usuarios'),('cartaoUuid','cartoes'),('categoriaUuid','categorias'),('subcategoriaUuid','subcategorias')) x(f,t) loop
  target_uuid:=nullif(new.payload->>field,'')::uuid;
  if target_uuid is not null and not exists(select 1 from public.financeapp_records r where r.household_id=new.household_id and r.table_name=target and r.uuid=target_uuid) then raise exception 'Missing UUID relation: %',field; end if;
 end loop;
 if new.table_name='lancamentos' and new.payload->>'subcategoriaUuid' is not null and new.payload->>'categoriaUuid' is not null then
  select payload->>'categoriaUuid' into subcat_category from public.financeapp_records where household_id=new.household_id and table_name='subcategorias' and uuid=(new.payload->>'subcategoriaUuid')::uuid;
  if subcat_category is distinct from new.payload->>'categoriaUuid' then raise exception 'Subcategory parent differs'; end if;
 end if;
 if new.table_name='subcategorias' and exists(select 1 from public.financeapp_records r where r.household_id=new.household_id and r.table_name='lancamentos' and r.payload->>'subcategoriaUuid'=new.uuid::text and r.payload->>'categoriaUuid' is distinct from new.payload->>'categoriaUuid') then raise exception 'Existing entry category differs from subcategory'; end if;
 return null;
end $$;
revoke all on function financeapp_private.check_canonical_relations() from public,anon,authenticated;
create constraint trigger canonical_relations after insert or update on public.financeapp_records
deferrable initially deferred for each row execute function financeapp_private.check_canonical_relations();

create function financeapp_private.record_canonical_change() returns trigger language plpgsql set search_path='' as $$
begin
 insert into financeapp_private.change_log(household_id,revision,table_name,uuid,payload,deleted_at) values(new.household_id,new.revision,new.table_name,new.uuid,new.payload,new.deleted_at);
 return null;
end $$;
revoke all on function financeapp_private.record_canonical_change() from public,anon,authenticated;
create trigger canonical_change after insert or update on public.financeapp_records for each row execute function financeapp_private.record_canonical_change();
create trigger canonical_no_delete before delete on public.financeapp_records for each row execute function financeapp_private.reject_preservation_mutation();
create trigger canonical_no_truncate before truncate on public.financeapp_records for each statement execute function financeapp_private.reject_preservation_mutation();

create function financeapp_private.apply_mutation(p_household uuid,p_mutation uuid,p_device uuid,p_protocol integer,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare request_hash text; old_receipt financeapp_private.mutation_receipts; change jsonb; existing public.financeapp_records; canonical jsonb:='[]'; conflicts jsonb:='[]'; result jsonb;
begin
 if (select auth.uid()) is null or not financeapp_private.is_member(p_household) then raise exception 'Not a household member' using errcode='42501'; end if;
 if p_protocol<>1 or p_protocol is null then raise exception 'Unsupported sync protocol'; end if;
 if p_mutation is null or p_device is null or p_changes is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes) not between 1 and 500 or octet_length(p_changes::text)>4194304 then raise exception 'Invalid mutation'; end if;
 if (select count(*) from jsonb_array_elements(p_changes))<>(select count(distinct (v->>'table',v->>'uuid')) from jsonb_array_elements(p_changes)v) then raise exception 'Repeated identity in mutation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text,0));
 request_hash:=encode(sha256(convert_to(jsonb_build_object('protocol',p_protocol,'device',p_device,'changes',p_changes)::text,'UTF8')),'hex');
 select * into old_receipt from financeapp_private.mutation_receipts where household_id=p_household and mutation_id=p_mutation;
 if found then
  if old_receipt.user_id<>(select auth.uid()) or old_receipt.request_sha256<>request_hash then raise exception 'Mutation ID reused with different content'; end if;
  return old_receipt.result;
 end if;
 if not coalesce((select sync_enabled from public.financeapp_households where id=p_household),false) then raise exception 'Synchronization paused'; end if;
 for change in select * from jsonb_array_elements(p_changes) loop
  if change->>'table' not in ('usuarios','cartoes','categorias','subcategorias','lancamentos','faturas','metas') or change->>'table' is null or coalesce(change->>'baseRevision','')!~'^[0-9]+$' then raise exception 'Invalid change'; end if;
  select * into existing from public.financeapp_records where household_id=p_household and table_name=change->>'table' and uuid=(change->>'uuid')::uuid;
  if coalesce(existing.revision,0)<>(change->>'baseRevision')::bigint then
   conflicts:=conflicts||jsonb_build_array(jsonb_build_object('table',change->>'table','uuid',change->>'uuid','current',case when existing.uuid is null then null else to_jsonb(existing) end));
  end if;
 end loop;
 if jsonb_array_length(conflicts)>0 then result:=jsonb_build_object('status','conflict','mutationId',p_mutation,'conflicts',conflicts);
 else
  for change in select * from jsonb_array_elements(p_changes) loop
   insert into public.financeapp_records(household_id,table_name,uuid,payload,revision,updated_at) values(p_household,change->>'table',(change->>'uuid')::uuid,change->'payload',0,now())
   on conflict(household_id,table_name,uuid) do update set payload=excluded.payload
   returning * into existing;
   canonical:=canonical||jsonb_build_array(to_jsonb(existing));
  end loop;
  -- Check relations before issuing receipts, rather than only at outer commit.
  set constraints public.canonical_relations immediate;
  set constraints public.canonical_relations deferred;
  result:=jsonb_build_object('status','applied','mutationId',p_mutation,'records',canonical);
 end if;
 insert into financeapp_private.mutation_receipts(household_id,mutation_id,user_id,device_id,request_sha256,result) values(p_household,p_mutation,(select auth.uid()),p_device,request_hash,result);
 return result;
end $$;
revoke all on function financeapp_private.apply_mutation(uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function financeapp_private.apply_mutation(uuid,uuid,uuid,integer,jsonb) to authenticated;
create function public.financeapp_apply_mutation(p_household uuid,p_mutation uuid,p_device uuid,p_protocol integer,p_changes jsonb)
returns jsonb language sql security invoker set search_path='' as $$select financeapp_private.apply_mutation(p_household,p_mutation,p_device,p_protocol,p_changes)$$;
revoke all on function public.financeapp_apply_mutation(uuid,uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.financeapp_apply_mutation(uuid,uuid,uuid,integer,jsonb) to authenticated;

create function financeapp_private.pull_changes(p_household uuid,p_after bigint,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if (select auth.uid()) is null or not financeapp_private.is_member(p_household) then raise exception 'Not a household member' using errcode='42501'; end if;
 if p_after is null or p_after<0 or p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid cursor or limit'; end if;
 if p_after>coalesce((select counter from financeapp_private.sync_clocks where household_id=p_household),0) then raise exception 'Cursor ahead of server'; end if;
 with watermark as (select coalesce((select counter from financeapp_private.sync_clocks where household_id=p_household),0) as head),
 page as (select c.* from financeapp_private.change_log c,watermark w where c.household_id=p_household and c.revision>p_after and c.revision<=w.head order by c.revision limit p_limit),
 tail as (select exists(select 1 from financeapp_private.change_log c,watermark w where c.household_id=p_household and c.revision>coalesce((select max(revision) from page),p_after) and c.revision<=w.head) as more)
 select jsonb_build_object('protocol',1,'householdId',p_household,'tables',jsonb_build_array('usuarios','cartoes','categorias','subcategorias','lancamentos','faturas','metas'),
 'after',p_after,'head',w.head,'next',case when t.more then coalesce((select max(revision) from page),p_after) else w.head end,'more',t.more,
 'records',coalesce((select jsonb_agg(to_jsonb(page) order by revision) from page),'[]'::jsonb)) into result from watermark w,tail t;
 return result;
end $$;
revoke all on function financeapp_private.pull_changes(uuid,bigint,integer) from public,anon;
grant execute on function financeapp_private.pull_changes(uuid,bigint,integer) to authenticated;
create function public.financeapp_pull_changes(p_household uuid,p_after bigint default 0,p_limit integer default 200)
returns jsonb language sql security invoker set search_path='' as $$select financeapp_private.pull_changes(p_household,p_after,p_limit)$$;
revoke all on function public.financeapp_pull_changes(uuid,bigint,integer) from public,anon;
grant execute on function public.financeapp_pull_changes(uuid,bigint,integer) to authenticated;

alter table public.financeapp_records enable row level security;
create policy records_member_read on public.financeapp_records for select to authenticated using(financeapp_private.is_member(household_id));
revoke all on public.financeapp_records from public,anon,authenticated;
grant select on public.financeapp_records to authenticated;
grant select,insert,update on public.financeapp_records to service_role;
do $$ declare t text; begin
 foreach t in array array['sync_clocks','change_log','mutation_receipts','identity_aliases','canonical_imports'] loop
  execute format('alter table financeapp_private.%I enable row level security',t);
  execute format('revoke all on financeapp_private.%I from public,anon,authenticated',t);
  execute format('grant select,insert on financeapp_private.%I to service_role',t);
 end loop;
end $$;
grant update on financeapp_private.sync_clocks to service_role;
create trigger receipt_immutable before update or delete on financeapp_private.mutation_receipts for each row execute function financeapp_private.reject_preservation_mutation();
create trigger change_log_immutable before update or delete on financeapp_private.change_log for each row execute function financeapp_private.reject_preservation_mutation();
commit;

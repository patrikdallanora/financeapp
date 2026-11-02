begin;
create table financeapp_private.push_subscriptions (
 endpoint_sha256 text primary key,
 household_id uuid not null,
 user_id uuid not null,
 device_id uuid not null,
 endpoint text not null check(length(endpoint) between 20 and 4096 and endpoint like 'https://%'),
 p256dh_key text not null check(p256dh_key ~ '^[A-Za-z0-9_-]{80,120}={0,2}$'),
 auth_key text not null check(auth_key ~ '^[A-Za-z0-9_-]{20,40}={0,2}$'),
 active boolean not null default true,
 updated_at timestamptz not null default now(),
 foreign key(household_id,user_id) references financeapp_private.memberships(household_id,user_id),
 check(endpoint_sha256=encode(sha256(convert_to(endpoint,'UTF8')),'hex'))
);
create unique index push_one_active_device on financeapp_private.push_subscriptions(household_id,device_id) where active;
create index push_by_member on financeapp_private.push_subscriptions(household_id,user_id);
create table financeapp_private.notification_deliveries (
 household_id uuid not null references public.financeapp_households(id),
 device_id uuid not null,
 delivery_key text not null check(length(delivery_key) between 1 and 160),
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 status text not null default 'claimed' check(status in ('claimed','sent','failed','uncertain')),
 attempted_at timestamptz not null default now(),
 completed_at timestamptz,
 error_code integer,
 primary key(household_id,device_id,delivery_key)
);
alter table financeapp_private.push_subscriptions enable row level security;
alter table financeapp_private.notification_deliveries enable row level security;
revoke all on financeapp_private.push_subscriptions,financeapp_private.notification_deliveries from public,anon,authenticated;
grant select,insert,update on financeapp_private.push_subscriptions,financeapp_private.notification_deliveries to service_role;

create function public.financeapp_service_memberships(p_user uuid) returns table(household_id uuid,sync_enabled boolean)
language sql stable security invoker set search_path='' as $$select m.household_id,h.sync_enabled from financeapp_private.memberships m join public.financeapp_households h on h.id=m.household_id where m.user_id=p_user and m.active$$;
create function public.financeapp_service_register_push(p_household uuid,p_user uuid,p_device uuid,p_endpoint text,p_p256dh text,p_auth text)
returns void language plpgsql security invoker set search_path='' as $$
declare digest text:=encode(sha256(convert_to(p_endpoint,'UTF8')),'hex');
begin
 if not exists(select 1 from financeapp_private.memberships where household_id=p_household and user_id=p_user and active) then raise exception 'Inactive member'; end if;
 if exists(select 1 from financeapp_private.push_subscriptions where endpoint_sha256=digest and household_id<>p_household) then raise exception 'Endpoint belongs to another household'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_household::text||p_device::text,0));
 update financeapp_private.push_subscriptions set active=false,updated_at=now() where household_id=p_household and device_id=p_device and endpoint_sha256<>digest and active;
 insert into financeapp_private.push_subscriptions(endpoint_sha256,household_id,user_id,device_id,endpoint,p256dh_key,auth_key)
 values(digest,p_household,p_user,p_device,p_endpoint,p_p256dh,p_auth)
 on conflict(endpoint_sha256) do update set user_id=excluded.user_id,device_id=excluded.device_id,p256dh_key=excluded.p256dh_key,auth_key=excluded.auth_key,active=true,updated_at=now();
end $$;
create function public.financeapp_service_push_targets() returns setof financeapp_private.push_subscriptions
language sql stable security invoker set search_path='' as $$select s.* from financeapp_private.push_subscriptions s join financeapp_private.memberships m on m.household_id=s.household_id and m.user_id=s.user_id join public.financeapp_households h on h.id=s.household_id where s.active and m.active and h.sync_enabled$$;
create function public.financeapp_service_claim_notification(p_household uuid,p_device uuid,p_key text,p_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare inserted integer;
begin
 if not exists(select 1 from public.financeapp_service_push_targets() s where s.household_id=p_household and s.device_id=p_device) then return false; end if;
 insert into financeapp_private.notification_deliveries(household_id,device_id,delivery_key,payload_sha256) values(p_household,p_device,p_key,p_hash) on conflict do nothing;
 get diagnostics inserted=row_count;
 return inserted=1;
end $$;
create function public.financeapp_service_finish_notification(p_household uuid,p_device uuid,p_key text,p_status text,p_error integer default null)
returns void language sql security invoker set search_path='' as $$update financeapp_private.notification_deliveries set status=p_status,completed_at=now(),error_code=p_error where household_id=p_household and device_id=p_device and delivery_key=p_key and status='claimed'$$;
create function public.financeapp_service_expire_push(p_endpoint_sha256 text) returns void
language sql security invoker set search_path='' as $$update financeapp_private.push_subscriptions set active=false,updated_at=now() where endpoint_sha256=p_endpoint_sha256$$;
create function public.financeapp_service_disable_device_push(p_household uuid,p_user uuid,p_device uuid) returns void
language sql security invoker set search_path='' as $$update financeapp_private.push_subscriptions set active=false,updated_at=now() where household_id=p_household and user_id=p_user and device_id=p_device$$;
revoke all on function public.financeapp_service_disable_device_push(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.financeapp_service_disable_device_push(uuid,uuid,uuid) to service_role;

revoke all on function public.financeapp_service_memberships(uuid),public.financeapp_service_register_push(uuid,uuid,uuid,text,text,text),public.financeapp_service_push_targets(),public.financeapp_service_claim_notification(uuid,uuid,text,text),public.financeapp_service_finish_notification(uuid,uuid,text,text,integer),public.financeapp_service_expire_push(text) from public,anon,authenticated;
grant execute on function public.financeapp_service_memberships(uuid),public.financeapp_service_register_push(uuid,uuid,uuid,text,text,text),public.financeapp_service_push_targets(),public.financeapp_service_claim_notification(uuid,uuid,text,text),public.financeapp_service_finish_notification(uuid,uuid,text,text,integer),public.financeapp_service_expire_push(text) to service_role;
commit;

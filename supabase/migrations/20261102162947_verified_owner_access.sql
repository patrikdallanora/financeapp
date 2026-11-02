begin;
create table financeapp_private.login_allowlist (
 household_id uuid not null references public.financeapp_households(id),
 email text not null check(email=lower(email) and position('@' in email)>1),
 role text not null check(role in ('owner','member')),
 claimed_user_id uuid references auth.users(id),
 primary key(household_id,email)
);
create index login_allowlist_by_email on financeapp_private.login_allowlist(email);
create index login_allowlist_by_claim on financeapp_private.login_allowlist(claimed_user_id);
alter table financeapp_private.login_allowlist enable row level security;
revoke all on financeapp_private.login_allowlist from public,anon,authenticated;
grant select,insert,update on financeapp_private.login_allowlist to service_role;

-- Only a platform-confirmed email may claim a previously provisioned household.
-- User-editable metadata never supplies permissions or household identifiers.
create function financeapp_private.claim_verified_household_access() returns trigger
language plpgsql security definer set search_path='' as $$
declare allowed financeapp_private.login_allowlist;
begin
 if new.email_confirmed_at is null or new.email is null or coalesce(new.is_anonymous,false) then return new; end if;
 for allowed in select * from financeapp_private.login_allowlist where email=lower(new.email) for update loop
  if allowed.claimed_user_id is not null and allowed.claimed_user_id<>new.id then continue; end if;
  update financeapp_private.login_allowlist set claimed_user_id=new.id where household_id=allowed.household_id and email=allowed.email;
  insert into financeapp_private.memberships(household_id,user_id,role) values(allowed.household_id,new.id,allowed.role)
    on conflict(household_id,user_id) do nothing;
 end loop;
 return new;
end $$;
revoke all on function financeapp_private.claim_verified_household_access() from public,anon,authenticated;
create trigger financeapp_confirmed_email_access after insert or update of email,email_confirmed_at on auth.users
for each row execute function financeapp_private.claim_verified_household_access();
commit;

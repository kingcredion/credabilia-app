-- Fresh project only. No Base44 data or identities are imported.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.account_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  can_sell boolean not null default true,
  can_audit boolean not null default true
);
create table public.user_progress (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  xp bigint not null default 0 check (xp >= 0)
);
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 4 and 120),
  description text not null check (char_length(btrim(description)) between 20 and 4000),
  evidence text not null default '' check (char_length(evidence) <= 2000),
  category text not null check (category in ('Sports','Comics','Art','Entertainment','History')),
  price_cents bigint not null check (price_cents between 100 and 100000000),
  status text not null default 'active' check (status in ('draft','active','sold','archived')),
  created_at timestamptz not null default now()
);
create index listings_active_created on public.listings (status, created_at desc);
create index listings_seller on public.listings (seller_id);
create table public.audits (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  auditor_id uuid not null references public.profiles(id),
  verdict text not null check (verdict in ('authentic','uncertain','concerns')),
  explanation text not null check (char_length(btrim(explanation)) between 20 and 2000),
  created_at timestamptz not null default now(),
  unique (listing_id, auditor_id)
);
create index audits_owner on public.audits (auditor_id);
create table public.reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  audit_id uuid not null unique references public.audits(id),
  xp integer not null check (xp = 5),
  created_at timestamptz not null default now()
);
create index reward_events_owner on public.reward_events (user_id);

alter table public.profiles enable row level security;
alter table public.account_permissions enable row level security;
alter table public.user_progress enable row level security;
alter table public.listings enable row level security;
alter table public.audits enable row level security;
alter table public.reward_events enable row level security;
revoke all on public.profiles, public.account_permissions, public.user_progress, public.listings, public.audits, public.reward_events from anon, authenticated;
grant select on public.profiles, public.account_permissions, public.user_progress, public.listings, public.audits, public.reward_events to authenticated;
grant select on public.listings to anon;
create policy profile_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy permissions_self on public.account_permissions for select to authenticated using (user_id = (select auth.uid()));
create policy progress_self on public.user_progress for select to authenticated using (user_id = (select auth.uid()));
create policy listings_visible on public.listings for select to anon, authenticated using (status = 'active' or seller_id = (select auth.uid()));
create policy audits_self on public.audits for select to authenticated using (auditor_id = (select auth.uid()));
create policy rewards_self on public.reward_events for select to authenticated using (user_id = (select auth.uid()));

create function public.bootstrap_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Collector'), 100));
  -- Never derive privileges, balances, or XP from user-editable metadata.
  insert into public.account_permissions(user_id) values (new.id);
  insert into public.user_progress(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.bootstrap_account() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.bootstrap_account();

create function public.create_listing(p_title text, p_description text, p_category text, p_price_cents bigint, p_evidence text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); new_id uuid; permitted boolean;
begin
  if actor is null then raise exception 'Sign in to create a listing' using errcode = '42501'; end if;
  select can_sell into permitted from public.account_permissions where user_id = actor for share;
  if permitted is distinct from true then raise exception 'Selling permission required' using errcode = '42501'; end if;
  insert into public.listings(seller_id,title,description,category,price_cents,evidence)
    values (actor,btrim(p_title),btrim(p_description),p_category,p_price_cents,btrim(coalesce(p_evidence,''))) returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.create_listing(text,text,text,bigint,text) from public, anon;
grant execute on function public.create_listing(text,text,text,bigint,text) to authenticated;

create function public.submit_audit(p_listing_id uuid, p_verdict text, p_explanation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); item public.listings; new_id uuid; permitted boolean;
begin
  if actor is null then raise exception 'Sign in to submit an audit' using errcode = '42501'; end if;
  select can_audit into permitted from public.account_permissions where user_id = actor for share;
  if permitted is distinct from true then raise exception 'Auditing permission required' using errcode = '42501'; end if;
  select * into item from public.listings where id = p_listing_id for share;
  if not found or item.status <> 'active' then raise exception 'Listing is not available for audit'; end if;
  if item.seller_id = actor then raise exception 'You cannot audit your own listing' using errcode = '42501'; end if;
  insert into public.audits(listing_id,auditor_id,verdict,explanation)
    values (p_listing_id,actor,p_verdict,btrim(p_explanation))
    on conflict (listing_id,auditor_id) do nothing returning id into new_id;
  if new_id is null then return jsonb_build_object('xp_earned',0,'already_submitted',true); end if;
  -- Audit, reward receipt, and XP update commit or roll back as one transaction.
  insert into public.reward_events(user_id,audit_id,xp) values (actor,new_id,5);
  update public.user_progress set xp = xp + 5 where user_id = actor;
  if not found then raise exception 'Account progress missing'; end if;
  return jsonb_build_object('xp_earned',5,'already_submitted',false);
end;
$$;
revoke all on function public.submit_audit(uuid,text,text) from public, anon;
grant execute on function public.submit_audit(uuid,text,text) to authenticated;

create function public.browse_listings()
returns table(id uuid,seller_id uuid,seller_name text,title text,description text,evidence text,category text,price_cents bigint,status text,created_at timestamptz,audit_count bigint)
language sql stable security definer set search_path = '' as $$
  select l.id,l.seller_id,p.display_name,l.title,l.description,l.evidence,l.category,l.price_cents,l.status,l.created_at,
    (select count(*) from public.audits a where a.listing_id = l.id)
  from public.listings l join public.profiles p on p.id = l.seller_id
  where l.status = 'active'
  order by l.created_at desc, l.id limit 100;
$$;
revoke all on function public.browse_listings() from public;
grant execute on function public.browse_listings() to anon, authenticated;

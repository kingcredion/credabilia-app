begin;

-- Real checkout replaces the placeholder free "purchase" -- leaving it callable would let
-- anyone claim any item for free by calling the RPC directly, bypassing Stripe entirely.
drop function public.simulate_purchase(uuid);

-- Seller Stripe Connect accounts ----------------------------------------------------

create table public.stripe_accounts(
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stripe_accounts enable row level security;
revoke all on public.stripe_accounts from public,anon,authenticated;
grant select on public.stripe_accounts to authenticated;
create policy stripe_accounts_self on public.stripe_accounts for select to authenticated
using (user_id=(select auth.uid()));

create function public.save_stripe_account(p_stripe_account_id text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  insert into public.stripe_accounts(user_id,stripe_account_id) values(auth.uid(),p_stripe_account_id)
    on conflict (user_id) do nothing;
end;$$;
revoke all on function public.save_stripe_account(text) from public,anon;
grant execute on function public.save_stripe_account(text) to authenticated;

-- Only Stripe's own verified truth (via the webhook or a live status check) can ever
-- flip charges_enabled/details_submitted -- a user can never self-report "I'm onboarded".
create function public.update_stripe_account_status(p_stripe_account_id text, p_charges_enabled boolean, p_details_submitted boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  update public.stripe_accounts set charges_enabled=p_charges_enabled, details_submitted=p_details_submitted, updated_at=now()
    where stripe_account_id=p_stripe_account_id;
end;$$;
revoke all on function public.update_stripe_account_status(text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.update_stripe_account_status(text,boolean,boolean) to service_role;

-- Listings gain a "pending" status for an in-progress checkout ----------------------

do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.listings'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.listings drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.listings add constraint listings_status_check
  check (status in ('draft','active','pending','sold','archived'));

-- Checkout reservation layer ---------------------------------------------------------

create table public.checkout_sessions(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  price_cents bigint not null,
  stripe_checkout_session_id text,
  status text not null default 'pending' check (status in ('pending','completed','expired','canceled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz
);
create unique index checkout_sessions_listing_pending on public.checkout_sessions(listing_id) where status='pending';
create unique index checkout_sessions_stripe_id on public.checkout_sessions(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create index checkout_sessions_buyer on public.checkout_sessions(buyer_id);
alter table public.checkout_sessions enable row level security;
revoke all on public.checkout_sessions from public,anon,authenticated;
grant select on public.checkout_sessions to authenticated;
create policy checkout_sessions_participant on public.checkout_sessions for select to authenticated
using (buyer_id=(select auth.uid()) or seller_id=(select auth.uid()));

create function public.reserve_listing_checkout(p_listing_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.listings; seller_account public.stripe_accounts; new_id uuid; updated integer;
begin
  if actor is null then raise exception 'Sign in to buy this item' using errcode='42501'; end if;

  -- Self-heal a listing stuck on 'pending' from an abandoned/expired checkout -- no cron needed.
  update public.checkout_sessions set status='expired' where listing_id=p_listing_id and status='pending' and expires_at<now();
  update public.listings set status='active' where id=p_listing_id and status='pending'
    and not exists(select 1 from public.checkout_sessions where listing_id=p_listing_id and status='pending');

  select * into item from public.listings where id=p_listing_id for update;
  if not found or item.status<>'active' then raise exception 'This item is not available to buy.'; end if;
  if item.seller_id=actor then raise exception 'You cannot buy your own listing.'; end if;

  select * into seller_account from public.stripe_accounts where user_id=item.seller_id;
  if not found or not seller_account.charges_enabled then raise exception 'This seller has not finished payment setup yet.'; end if;

  insert into public.checkout_sessions(listing_id,buyer_id,seller_id,price_cents,expires_at)
    values(p_listing_id,actor,item.seller_id,item.price_cents,now()+interval '30 minutes') returning id into new_id;

  update public.listings set status='pending' where id=p_listing_id and status='active';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'This item was just reserved by someone else.'; end if;

  return jsonb_build_object('checkout_session_id',new_id,'price_cents',item.price_cents,'stripe_account_id',seller_account.stripe_account_id,'title',item.title);
end;$$;
revoke all on function public.reserve_listing_checkout(uuid) from public,anon;
grant execute on function public.reserve_listing_checkout(uuid) to authenticated;

create function public.attach_stripe_checkout_session(p_checkout_session_id uuid, p_stripe_session_id text) returns void
language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
  update public.checkout_sessions set stripe_checkout_session_id=p_stripe_session_id
    where id=p_checkout_session_id and buyer_id=auth.uid() and status='pending';
  get diagnostics updated = row_count;
  if updated=0 then raise exception 'Checkout session not found.'; end if;
end;$$;
revoke all on function public.attach_stripe_checkout_session(uuid,text) from public,anon;
grant execute on function public.attach_stripe_checkout_session(uuid,text) to authenticated;

create function public.cancel_checkout_session(p_stripe_session_id text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id and buyer_id=auth.uid() for update;
  if not found or target.status<>'pending' then return; end if;
  update public.checkout_sessions set status='canceled' where id=target.id;
  update public.listings set status='active' where id=target.listing_id and status='pending';
end;$$;
revoke all on function public.cancel_checkout_session(text) from public,anon;
grant execute on function public.cancel_checkout_session(text) to authenticated;

-- Called by the Stripe webhook and by the buyer's own return-page reconciliation.
-- Idempotent by design: safe to call twice for the same session (webhook retries,
-- or the webhook and the return page racing each other).
create function public.finalize_checkout_session(p_stripe_session_id text, p_stripe_payment_intent_id text) returns uuid
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions; new_id uuid; fee bigint;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id for update;
  if not found then raise exception 'Checkout session not found.'; end if;

  if target.status='completed' then
    select id into new_id from public.purchases where listing_id=target.listing_id and buyer_id=target.buyer_id;
    return new_id;
  end if;
  if target.status<>'pending' then raise exception 'This checkout session is no longer active.'; end if;

  fee:=round(target.price_cents*0.08);
  insert into public.purchases(listing_id,buyer_id,seller_id,price_cents,stripe_checkout_session_id,stripe_payment_intent_id,platform_fee_cents)
    values(target.listing_id,target.buyer_id,target.seller_id,target.price_cents,p_stripe_session_id,p_stripe_payment_intent_id,fee)
    returning id into new_id;

  update public.listings set status='sold' where id=target.listing_id and status='pending';
  update public.checkout_sessions set status='completed', completed_at=now() where id=target.id;

  return new_id;
end;$$;
revoke all on function public.finalize_checkout_session(text,text) from public,anon,authenticated;
grant execute on function public.finalize_checkout_session(text,text) to service_role;

create function public.expire_checkout_session(p_stripe_session_id text) returns void
language plpgsql security definer set search_path='' as $$
declare target public.checkout_sessions;
begin
  select * into target from public.checkout_sessions where stripe_checkout_session_id=p_stripe_session_id for update;
  if not found or target.status<>'pending' then return; end if;
  update public.checkout_sessions set status='expired' where id=target.id;
  update public.listings set status='active' where id=target.listing_id and status='pending';
end;$$;
revoke all on function public.expire_checkout_session(text) from public,anon,authenticated;
grant execute on function public.expire_checkout_session(text) to service_role;

-- Purchases gain real Stripe bookkeeping ----------------------------------------------

alter table public.purchases
  add column stripe_checkout_session_id text unique,
  add column stripe_payment_intent_id text,
  add column platform_fee_cents bigint not null default 0,
  add column seller_payout_cents bigint generated always as (price_cents-platform_fee_cents) stored;

-- Surface seller payment-readiness to buyers -------------------------------------------

create or replace function public.browse_listings_with_certificates() returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object('attributes',l.attributes,'tags',l.tags,'seller_charges_enabled',coalesce(sa.charges_enabled,false)) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_listings_with_media()) with ordinality as items(item,position)
join public.listings l on l.id=(item->>'id')::uuid
left join public.stripe_accounts sa on sa.user_id=l.seller_id;
$$;
revoke all on function public.browse_listings_with_certificates() from public;
grant execute on function public.browse_listings_with_certificates() to anon,authenticated;

commit;

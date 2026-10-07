-- A test account for Apple's App Review team. They type appreview@credabilia.com into the normal email box and, only while this switch is ON, the
-- review-sign-in function signs them straight in with no code. The switch ships OFF and is turned on just for the review period.
--
-- Even when the switch is on, this account is walled in on the server:
--   * anything it lists goes to 'needs_review' (visible only to itself, never to buyers);
--   * it cannot start a checkout, place a bid or send a buy request, so it can never spend real money or bother real sellers.
create table public.app_review_access(
  only_row boolean primary key default true check(only_row),
  enabled boolean not null default false,
  email text not null default 'appreview@credabilia.com'
);
insert into public.app_review_access default values;
alter table public.app_review_access enable row level security;
revoke all on public.app_review_access from public, anon, authenticated;

-- True when this user is the review account. Not gated on the switch: the walls apply to that account whether or not sign-in is currently open.
create function public.is_app_review_account(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u join public.app_review_access a on lower(u.email) = lower(a.email) where u.id = p_user)
$$;
revoke all on function public.is_app_review_account(uuid) from public, anon, authenticated;

create function public.keep_review_listings_private() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and public.is_app_review_account(new.seller_id) then
    new.status := 'needs_review';
    new.needs_review_reason := coalesce(new.needs_review_reason, 'Test account listing: never shown to buyers.');
  end if;
  return new;
end;
$$;
revoke all on function public.keep_review_listings_private() from public, anon, authenticated;
create trigger keep_review_listings_private before insert or update of status on public.listings
for each row execute function public.keep_review_listings_private();

-- tg_argv[0] is the column holding the buyer/bidder
create function public.block_review_account_buying() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_app_review_account((to_jsonb(new) ->> tg_argv[0])::uuid) then
    raise exception 'The test account cannot buy, bid or send buy requests.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.block_review_account_buying() from public, anon, authenticated;
create trigger block_review_checkout before insert on public.checkout_sessions
for each row execute function public.block_review_account_buying('buyer_id');
create trigger block_review_bids before insert on public.bids
for each row execute function public.block_review_account_buying('bidder_id');
create trigger block_review_buy_requests before insert on public.availability_requests
for each row execute function public.block_review_account_buying('buyer_id');

begin;

-- Operator ban, and blocking of a banned person's cards and bank accounts.
--
-- Stripe gives every card and bank account a stable fingerprint. We record the ones each member pays with (buyers) or is paid to
-- (sellers). When the operator bans someone, those fingerprints are blocked: the same card or bank account turning up on another
-- account is held for review instead of being paid out. This makes starting over costly; it cannot stop someone with a brand-new
-- card, bank account and email.

create table public.payment_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('card','bank')),
  fingerprint text not null check (char_length(fingerprint) between 6 and 120),
  created_at timestamptz not null default now(),
  unique (user_id, kind, fingerprint)
);
create index payment_fingerprints_lookup on public.payment_fingerprints(kind, fingerprint);
alter table public.payment_fingerprints enable row level security;
revoke all on public.payment_fingerprints from public,anon,authenticated;

create table public.blocked_fingerprints (
  kind text not null check (kind in ('card','bank')),
  fingerprint text not null,
  banned_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (kind, fingerprint)
);
alter table public.blocked_fingerprints enable row level security;
revoke all on public.blocked_fingerprints from public,anon,authenticated;

-- A single order can be held for a human even though its seller is fine (a payment from a blocked card).
alter table public.purchases add column review_hold boolean not null default false;

-- Webhooks (service_role only) report what Stripe says. A bank match flags the seller's payouts; a card match holds that one order.
create function public.record_payment_fingerprint(p_user_id uuid, p_kind text, p_fingerprint text, p_purchase_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare blocked boolean;
begin
  if p_kind not in ('card','bank') or p_fingerprint is null or char_length(p_fingerprint)<6 then raise exception 'Invalid fingerprint.'; end if;
  insert into public.payment_fingerprints(user_id,kind,fingerprint) values(p_user_id,p_kind,p_fingerprint) on conflict do nothing;
  select exists(select 1 from public.blocked_fingerprints b where b.kind=p_kind and b.fingerprint=p_fingerprint and b.banned_user_id is distinct from p_user_id) into blocked;
  if blocked then
    if p_kind='bank' then update public.profiles set payout_review=true where id=p_user_id; end if;
    if p_purchase_id is not null then update public.purchases set review_hold=true where id=p_purchase_id and buyer_id=p_user_id; end if;
  end if;
  return jsonb_build_object('blocked',blocked);
end;$$;
revoke all on function public.record_payment_fingerprint(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_payment_fingerprint(uuid,text,text,uuid) to service_role;

-- Ban: blocks sign-in and kills open sessions, takes their listings down, ends open buy requests, freezes their payouts and blocks the
-- cards and bank accounts they used. A signed-in browser can keep working until its short-lived token expires (about an hour).
create function public.admin_ban_user(p_user_id uuid, p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare clean text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_user_id=auth.uid() or exists(select 1 from public.operators where user_id=p_user_id) then raise exception 'You cannot ban an operator.'; end if;
  clean:=nullif(btrim(coalesce(p_reason,'')),'');
  if clean is null then raise exception 'Give a reason for the ban.'; end if;
  update public.profiles set banned_at=now(), ban_reason=left(clean,500), payout_review=true where id=p_user_id;
  if not found then raise exception 'Member not found.'; end if;
  update public.listings set status='archived' where seller_id=p_user_id and status in ('active','pending','needs_review');
  update public.checkout_sessions set status='expired' where seller_id=p_user_id and status='pending';
  update public.availability_requests set status='declined', responded_at=now() where (seller_id=p_user_id or buyer_id=p_user_id) and status in ('pending','confirmed');
  insert into public.blocked_fingerprints(kind,fingerprint,banned_user_id,reason)
    select kind,fingerprint,p_user_id,left(clean,500) from public.payment_fingerprints where user_id=p_user_id on conflict do nothing;
  update auth.users set banned_until='2999-01-01'::timestamptz where id=p_user_id;
  delete from auth.sessions where user_id=p_user_id;
end;$$;
revoke all on function public.admin_ban_user(uuid,text) from public,anon;
grant execute on function public.admin_ban_user(uuid,text) to authenticated;

-- Lift a ban (listings stay archived; the member can relist). Their fingerprints are unblocked too.
create function public.admin_unban_user(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.profiles set banned_at=null, ban_reason=null, payout_review=false where id=p_user_id;
  if not found then raise exception 'Member not found.'; end if;
  delete from public.blocked_fingerprints where banned_user_id=p_user_id;
  update auth.users set banned_until=null where id=p_user_id;
end;$$;
revoke all on function public.admin_unban_user(uuid) from public,anon;
grant execute on function public.admin_unban_user(uuid) to authenticated;

-- Only members who are banned or under payout review (so the admin member list can show their status).
create function public.admin_member_flags() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'banned_at',p.banned_at,'ban_reason',p.ban_reason,'payout_review',p.payout_review))
    from public.profiles p where p.banned_at is not null or p.payout_review),'[]'::jsonb);
end;$$;
revoke all on function public.admin_member_flags() from public,anon;
grant execute on function public.admin_member_flags() to authenticated;

-- A held order is never paid out automatically, and the seller sees it as "under review".
create or replace function public.due_releases() returns setof public.purchases
language sql stable security definer set search_path='' as $$
  select p.* from public.purchases p join public.profiles s on s.id=p.seller_id
  where p.escrow_status='held' and not p.review_hold and not s.payout_review and s.banned_at is null
    and not public.has_open_dispute(p.id)
    and ((p.release_after is not null and p.release_after<=now())
      or (p.delivered_at is null and p.fulfillment_method='ship' and p.shipped_at is not null and p.shipped_at<now()-interval '21 days' and p.tracking_status='TRANSIT'));
$$;
revoke all on function public.due_releases() from public,anon,authenticated;
grant execute on function public.due_releases() to service_role;

create or replace function public.my_payout_status() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'purchase_id',p.id,'role',case when p.buyer_id=auth.uid() then 'buyer' else 'seller' end,
    'fulfillment_method',p.fulfillment_method,'escrow_status',p.escrow_status,
    'delivered_at',p.delivered_at,'release_after',p.release_after,'hold_tier',p.hold_tier,
    'under_review',p.seller_id=auth.uid() and p.escrow_status='held' and (p.review_hold or (p.delivered_at is not null and p.release_after is null)),
    'has_open_dispute',public.has_open_dispute(p.id),
    'can_release_early',p.buyer_id=auth.uid() and p.escrow_status='held' and not p.review_hold and p.delivered_at is not null and p.release_after>now()
      and not public.has_open_dispute(p.id)
      and coalesce((public.seller_payout_tier(p.seller_id,p.price_cents,p.fulfillment_method='pickup')->>'early_release')::boolean,false),
    'handoff_verified_at',p.handoff_verified_at,
    'pickup_code',case when p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null then p.pickup_code else null end,
    'pickup_attempts_left',case when p.seller_id=auth.uid() and p.fulfillment_method='pickup' then greatest(0,5-p.pickup_code_attempts) else null end
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p where p.buyer_id=auth.uid() or p.seller_id=auth.uid();
$$;
revoke all on function public.my_payout_status() from public,anon;
grant execute on function public.my_payout_status() to authenticated;

-- Operator: clear the hold on one order after looking into it.
create function public.admin_clear_review_hold(p_purchase_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.purchases set review_hold=false where id=p_purchase_id;
  if not found then raise exception 'Purchase not found.'; end if;
end;$$;
revoke all on function public.admin_clear_review_hold(uuid) from public,anon;
grant execute on function public.admin_clear_review_hold(uuid) to authenticated;

commit;

begin;

-- Inspect before you accept.
--
-- Pickup: the buyer must inspect the item at the meetup and accept it in the app before the 6-digit handoff code is revealed. If
-- something is wrong they say so instead, the code stays hidden, and a refund request is opened. Shipped orders: during the
-- inspection window the buyer can accept with the same checklist ("looks good"). Either way we keep a dated record of what the
-- buyer confirmed, and the operator sees it on a dispute. It does not block a refund request (fraud and misdescription can still
-- be raised); it is the record the operator weighs.

alter table public.purchases
  add column inspection_accepted_at timestamptz,
  add column inspection_checks jsonb,
  add column inspection_issue text,
  add column inspection_issue_at timestamptz;

-- The checklist the buyer ticked. Only known keys, only true values, and "matches the photos" is always required.
create function public.clean_inspection_checks(p_checks jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; cleaned jsonb:='{}'::jsonb;
begin
  if p_checks is null or jsonb_typeof(p_checks)<>'object' then raise exception 'Confirm each item on the checklist.'; end if;
  for k in select jsonb_object_keys(p_checks) loop
    if k not in ('certificate_matches','matches_photos','signature_ok') then raise exception 'Unknown checklist item.'; end if;
    if jsonb_typeof(p_checks->k)<>'boolean' then raise exception 'Invalid checklist.'; end if;
    if (p_checks->k)::text='true' then cleaned:=cleaned||jsonb_build_object(k,true); else raise exception 'Confirm every item, or tell us what is wrong instead.'; end if;
  end loop;
  if not (cleaned ? 'matches_photos') then raise exception 'Confirm the item matches the listing photos.'; end if;
  return cleaned;
end;$$;
revoke all on function public.clean_inspection_checks(jsonb) from public,anon,authenticated;

-- Pickup: the buyer accepts the item in person. This is what unlocks the handoff code.
create function public.accept_pickup_inspection(p_purchase_id uuid, p_checks jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; cleaned jsonb;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and buyer_id=actor and fulfillment_method='pickup' for update;
  if not found then raise exception 'Purchase not found.'; end if;
  if purchase.escrow_status<>'held' or purchase.handoff_verified_at is not null then raise exception 'This handoff is already complete.'; end if;
  if public.has_open_dispute(p_purchase_id) then raise exception 'This order has an open refund request.'; end if;
  if purchase.inspection_accepted_at is not null then return jsonb_build_object('ok',true,'already',true); end if;
  cleaned:=public.clean_inspection_checks(p_checks);
  update public.purchases set inspection_accepted_at=now(), inspection_checks=cleaned, inspection_issue=null, inspection_issue_at=null where id=p_purchase_id;
  return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.accept_pickup_inspection(uuid,jsonb) from public,anon;
grant execute on function public.accept_pickup_inspection(uuid,jsonb) to authenticated;

-- Pickup: something is wrong at the meetup. The code stays hidden and a refund request is opened for the operator and seller.
create function public.reject_pickup_inspection(p_purchase_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; clean text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(coalesce(p_reason,''));
  if clean='' or length(clean)>1800 then raise exception 'Tell us what is wrong, in 1 to 1800 characters.'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and buyer_id=actor and fulfillment_method='pickup' for update;
  if not found then raise exception 'Purchase not found.'; end if;
  if purchase.escrow_status<>'held' or purchase.handoff_verified_at is not null then raise exception 'This handoff is already complete.'; end if;
  if purchase.inspection_accepted_at is not null then raise exception 'You already accepted this item. If something is wrong, request a refund from your purchase.'; end if;
  update public.purchases set inspection_issue=clean, inspection_issue_at=now() where id=p_purchase_id;
  perform public.request_refund(p_purchase_id,'Problem found at the pickup inspection: '||clean);
  return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.reject_pickup_inspection(uuid,text) from public,anon;
grant execute on function public.reject_pickup_inspection(uuid,text) to authenticated;

-- Shipped order: the buyer says it looks good. Records the checklist; for sellers whose tier allows it, payment is released at the
-- next hourly sweep, otherwise it still waits out the hold.
create function public.accept_delivery(p_purchase_id uuid, p_checks jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; cleaned jsonb; t jsonb; early boolean; new_release timestamptz;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and buyer_id=actor and fulfillment_method='ship' for update;
  if not found then raise exception 'Purchase not found.'; end if;
  if purchase.escrow_status<>'held' or purchase.delivered_at is null then raise exception 'This order is not waiting on a payout.'; end if;
  if public.has_open_dispute(p_purchase_id) then raise exception 'This order has an open refund request.'; end if;
  cleaned:=public.clean_inspection_checks(p_checks);
  t:=public.seller_payout_tier(purchase.seller_id,purchase.price_cents,false);
  early:=coalesce((t->>'early_release')::boolean,false);
  new_release:=case when early and not purchase.review_hold then least(coalesce(purchase.release_after,now()),now()) else purchase.release_after end;
  update public.purchases set inspection_accepted_at=coalesce(inspection_accepted_at,now()), inspection_checks=cleaned, release_after=new_release where id=p_purchase_id;
  return jsonb_build_object('ok',true,'released_early',early and not purchase.review_hold,'release_after',new_release);
end;$$;
revoke all on function public.accept_delivery(uuid,jsonb) from public,anon;
grant execute on function public.accept_delivery(uuid,jsonb) to authenticated;

-- release_early is replaced by accept_delivery (same rules, plus the checklist record).
drop function public.release_early(uuid);

-- complete_pickup now requires the buyer's in-person acceptance first (before the code is even checked).
create or replace function public.complete_pickup(p_purchase_id uuid, p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); purchase public.purchases; clean text; fresh public.purchases;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and seller_id=actor and fulfillment_method='pickup' for update;
  if not found then raise exception 'Sale not found.'; end if;
  if purchase.escrow_status<>'held' or purchase.handoff_verified_at is not null then raise exception 'This handoff is already complete.'; end if;
  if public.has_open_dispute(p_purchase_id) then raise exception 'This order has an open refund request.'; end if;
  if purchase.inspection_accepted_at is null then raise exception 'The buyer has not accepted the item yet. They inspect it first, then give you the code.'; end if;
  if purchase.pickup_code_attempts>=5 then raise exception 'Too many wrong codes. Contact support.'; end if;
  clean:=regexp_replace(coalesce(p_code,''),'\s','','g');
  if purchase.pickup_code is null or clean<>purchase.pickup_code then
    update public.purchases set pickup_code_attempts=pickup_code_attempts+1 where id=p_purchase_id;
    return jsonb_build_object('ok',false,'attempts_left',greatest(0,4-purchase.pickup_code_attempts));
  end if;
  update public.purchases set handoff_verified_at=now(), seller_marked_picked_up_at=now(), buyer_confirmed_pickup_at=now() where id=p_purchase_id;
  perform public.schedule_payout(p_purchase_id);
  select * into fresh from public.purchases where id=p_purchase_id;
  return jsonb_build_object('ok',true,'release_after',fresh.release_after,'hold_tier',fresh.hold_tier);
end;$$;

-- The code is only shown to the buyer after they accept the item; the seller sees whether the buyer has inspected yet.
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
    'inspection_accepted_at',p.inspection_accepted_at,'inspection_issue_at',p.inspection_issue_at,
    'handoff_verified_at',p.handoff_verified_at,
    'pickup_code',case when p.buyer_id=auth.uid() and p.fulfillment_method='pickup' and p.escrow_status='held' and p.handoff_verified_at is null and p.inspection_accepted_at is not null then p.pickup_code else null end,
    'pickup_attempts_left',case when p.seller_id=auth.uid() and p.fulfillment_method='pickup' then greatest(0,5-p.pickup_code_attempts) else null end
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p where p.buyer_id=auth.uid() or p.seller_id=auth.uid();
$$;
revoke all on function public.my_payout_status() from public,anon;
grant execute on function public.my_payout_status() to authenticated;

create or replace function public.admin_purchase_evidence(p_purchase_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.purchases;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into p from public.purchases where id=p_purchase_id;
  if not found then raise exception 'Purchase not found.'; end if;
  return jsonb_build_object('fulfillment_method',p.fulfillment_method,'shipped_at',p.shipped_at,'tracking_number',p.tracking_number,
    'tracking_status',p.tracking_status,'delivered_at',p.delivered_at,'release_after',p.release_after,'hold_tier',p.hold_tier,
    'handoff_verified_at',p.handoff_verified_at,'escrow_status',p.escrow_status,
    'inspection_accepted_at',p.inspection_accepted_at,'inspection_checks',p.inspection_checks,'inspection_issue',p.inspection_issue);
end;$$;
revoke all on function public.admin_purchase_evidence(uuid) from public,anon;
grant execute on function public.admin_purchase_evidence(uuid) to authenticated;

commit;

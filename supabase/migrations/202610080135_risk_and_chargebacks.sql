-- Risk tags, the pre-purchase authenticity notice, card chargebacks, operator order notes, and the seller's authenticity statement.
-- Everything here is internal: no client role can read these tables; they are reached only through the functions below.
begin;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 1. The notice a buyer sees (and taps through) before paying for an item whose certificate has not been checked with the issuer.
--    The wording lives here, not in the browser, so the buyer sees exactly what we later quote as evidence in a dispute.
-- ---------------------------------------------------------------------------------------------------------------------------
create table public.disclosure_versions (
  version text not null,
  certificate_state text not null check (certificate_state in ('none','seller_reported','issuer_checked')),
  body text not null,
  primary key (version, certificate_state)
);
alter table public.disclosure_versions enable row level security;
revoke all on public.disclosure_versions from public,anon,authenticated;

insert into public.disclosure_versions(version,certificate_state,body) values
 ('cert-2026-10-08','none',
  'This item has no certificate of authenticity. Credabilia does not authenticate items, and the credibility score and any AI opinion are opinions, not guarantees. Review the photos, the credibility score and the evidence notes before you buy. By continuing you confirm you have read this.'),
 ('cert-2026-10-08','seller_reported',
  'The seller entered certificate details for this item. Credabilia has not checked them with the issuer and does not authenticate items. Use the issuer lookup link on the item page to check the certificate yourself, and review the credibility score and evidence notes before you buy. By continuing you confirm you have read this.');

-- ---------------------------------------------------------------------------------------------------------------------------
-- 2. One row per checkout: how risky it looked, which notice was shown and whether the buyer confirmed it.
-- ---------------------------------------------------------------------------------------------------------------------------
create table public.checkout_risk (
  checkout_session_id uuid primary key references public.checkout_sessions(id) on delete cascade,
  listing_id uuid not null,
  buyer_id uuid,
  seller_id uuid,
  level text not null check (level in ('normal','elevated','high')),
  flags text[] not null default '{}',
  certificate_state text not null,
  disclosure_version text,
  disclosure_acknowledged_at timestamptz,
  signature_required boolean not null default false,
  require_3ds boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.checkout_risk enable row level security;
revoke all on public.checkout_risk from public,anon,authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 3. Card chargebacks reported by Stripe, and the operator's notes on any order.
-- ---------------------------------------------------------------------------------------------------------------------------
create table public.payment_disputes (
  stripe_dispute_id text primary key,
  purchase_id uuid references public.purchases(id) on delete set null,
  stripe_payment_intent_id text,
  amount_cents bigint,
  reason text,
  status text not null,
  evidence_due_by timestamptz,
  seller_already_paid boolean not null default false,
  transfer_reversed boolean not null default false,
  evidence_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_disputes_purchase on public.payment_disputes(purchase_id);
alter table public.payment_disputes enable row level security;
revoke all on public.payment_disputes from public,anon,authenticated;

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index order_notes_purchase on public.order_notes(purchase_id, created_at);
alter table public.order_notes enable row level security;
revoke all on public.order_notes from public,anon,authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 4. The seller's statement that the item is authentic and any certificate they attach is genuine.
-- ---------------------------------------------------------------------------------------------------------------------------
alter table public.listings add column authenticity_attested_at timestamptz, add column authenticity_attestation_version text;

create function public.attest_listing_authenticity(p_listing_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='28000'; end if;
  update public.listings set authenticity_attested_at=now(), authenticity_attestation_version='seller-2026-10-08'
    where id=p_listing_id and seller_id=auth.uid() and authenticity_attested_at is null;
end;$$;
revoke all on function public.attest_listing_authenticity(uuid) from public,anon;
grant execute on function public.attest_listing_authenticity(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 5. Risk profile for one prospective purchase. Thresholds are plain numbers here so they are easy to tune.
--    The certificate states are 'none' and 'seller_reported' today; 'issuer_checked' is reserved for when a lookup is confirmed.
-- ---------------------------------------------------------------------------------------------------------------------------
create function public.checkout_risk_profile(p_listing_id uuid, p_buyer_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  l public.listings; state text; is_signed boolean; tier text; prior integer; flags text[]:='{}'; pts integer:=0; lvl text;
  high_value_cents constant bigint:=50000; first_buy_cents constant bigint:=25000;
begin
  select * into l from public.listings where id=p_listing_id;
  if not found then raise exception 'Listing not found.'; end if;
  state:=case when l.certificate_issuer is null and not exists(select 1 from public.listing_media m where m.listing_id=l.id and m.kind='certificate')
              then 'none' else 'seller_reported' end;
  is_signed:=exists(select 1 from public.listing_media m where m.listing_id=l.id and m.kind='signature') or l.signature_ai_label is not null;
  tier:=public.seller_payout_tier(l.seller_id,l.price_cents,false)->>'tier';
  select count(*) into prior from public.purchases where buyer_id=p_buyer_id;

  if l.price_cents>=high_value_cents then flags:=array_append(flags,'high_value'); pts:=pts+2; end if;
  if state='none' then flags:=array_append(flags,'no_certificate'); pts:=pts+2;
  elsif state='seller_reported' then flags:=array_append(flags,'cert_unchecked'); pts:=pts+1; end if;
  if is_signed and state<>'issuer_checked' then flags:=array_append(flags,'signed_unverified'); pts:=pts+1; end if;
  if tier in ('new','flagged') then flags:=array_append(flags,'new_seller'); pts:=pts+1; end if;
  if prior=0 and l.price_cents>=first_buy_cents then flags:=array_append(flags,'new_buyer_high_value'); pts:=pts+2; end if;
  if l.authenticity_attested_at is null then flags:=array_append(flags,'no_seller_attestation'); end if;

  lvl:=case when pts>=4 then 'high' when pts>=2 then 'elevated' else 'normal' end;
  return jsonb_build_object(
    'price_cents',l.price_cents,'certificate_state',state,'signed',is_signed,'seller_tier',tier,'prior_purchases',prior,
    'flags',to_jsonb(flags),'level',lvl,
    'requires_disclosure',state<>'issuer_checked','disclosure_version','cert-2026-10-08',
    'signature_required',l.price_cents>=high_value_cents,
    'require_3ds',l.price_cents>=high_value_cents or lvl='high');
end;$$;
revoke all on function public.checkout_risk_profile(uuid,uuid) from public,anon,authenticated;
grant execute on function public.checkout_risk_profile(uuid,uuid) to service_role;

-- What the buyer's checkout screen shows: whether a notice is needed and its exact wording.
create function public.checkout_disclosure(p_listing_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p jsonb; body text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='28000'; end if;
  p:=public.checkout_risk_profile(p_listing_id,auth.uid());
  select d.body into body from public.disclosure_versions d where d.version=p->>'disclosure_version' and d.certificate_state=p->>'certificate_state';
  return jsonb_build_object('requires_acknowledgement',(p->>'requires_disclosure')::boolean and body is not null,
    'version',p->>'disclosure_version','certificate_state',p->>'certificate_state','text',body);
end;$$;
revoke all on function public.checkout_disclosure(uuid) from public,anon;
grant execute on function public.checkout_disclosure(uuid) to authenticated;

-- Saved by the checkout function once the item is reserved.
create function public.record_checkout_risk(p_checkout_session_id uuid, p_profile jsonb, p_acknowledged boolean) returns void
language plpgsql security definer set search_path='' as $$
declare cs public.checkout_sessions;
begin
  select * into cs from public.checkout_sessions where id=p_checkout_session_id;
  if not found then raise exception 'Checkout session not found.'; end if;
  insert into public.checkout_risk(checkout_session_id,listing_id,buyer_id,seller_id,level,flags,certificate_state,disclosure_version,disclosure_acknowledged_at,signature_required,require_3ds)
  values(cs.id,cs.listing_id,cs.buyer_id,cs.seller_id,p_profile->>'level',
    coalesce(array(select jsonb_array_elements_text(p_profile->'flags')),'{}'),
    p_profile->>'certificate_state',case when coalesce((p_profile->>'requires_disclosure')::boolean,false) then p_profile->>'disclosure_version' end,
    case when p_acknowledged then now() end,coalesce((p_profile->>'signature_required')::boolean,false),coalesce((p_profile->>'require_3ds')::boolean,false))
  on conflict (checkout_session_id) do update set level=excluded.level,flags=excluded.flags,certificate_state=excluded.certificate_state,
    disclosure_version=excluded.disclosure_version,disclosure_acknowledged_at=excluded.disclosure_acknowledged_at,
    signature_required=excluded.signature_required,require_3ds=excluded.require_3ds;
end;$$;
revoke all on function public.record_checkout_risk(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.record_checkout_risk(uuid,jsonb,boolean) to service_role;

-- Safe, short labels for Stripe's payment record (never names, addresses or free text).
create function public.checkout_stripe_tags(p_checkout_session_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'order_ref',r.checkout_session_id,'listing_id',r.listing_id,'seller_id',r.seller_id,'buyer_id',r.buyer_id,
    'risk_level',r.level,'risk_flags',array_to_string(r.flags,','),'certificate_state',r.certificate_state,
    'disclosure_version',coalesce(r.disclosure_version,'none'),'disclosure_acknowledged',(r.disclosure_acknowledged_at is not null)::text,
    'signature_required',r.signature_required::text,'seller_tier',(public.seller_payout_tier(r.seller_id,s.price_cents,false)->>'tier'))
  from public.checkout_risk r join public.checkout_sessions s on s.id=r.checkout_session_id where r.checkout_session_id=p_checkout_session_id;
$$;
revoke all on function public.checkout_stripe_tags(uuid) from public,anon,authenticated;
grant execute on function public.checkout_stripe_tags(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 6. A payment dispute (chargeback) is a held order. If the seller was already paid, all of their payouts are frozen for review.
-- ---------------------------------------------------------------------------------------------------------------------------
create function public.record_stripe_dispute(p_dispute jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pur public.purchases; was_paid boolean:=false; open_status boolean; due timestamptz;
begin
  if coalesce(p_dispute->>'id','')='' then raise exception 'Dispute id missing.'; end if;
  select * into pur from public.purchases where stripe_payment_intent_id=p_dispute->>'payment_intent' limit 1;
  was_paid:=found and pur.escrow_status='released';
  open_status:=(p_dispute->>'status') in ('needs_response','under_review','warning_needs_response','warning_under_review');
  due:=case when (p_dispute->>'evidence_due_by') ~ '^[0-9]+$' then to_timestamp((p_dispute->>'evidence_due_by')::bigint) end;

  insert into public.payment_disputes(stripe_dispute_id,purchase_id,stripe_payment_intent_id,amount_cents,reason,status,evidence_due_by,seller_already_paid)
  values(p_dispute->>'id',pur.id,p_dispute->>'payment_intent',nullif(p_dispute->>'amount','')::bigint,p_dispute->>'reason',p_dispute->>'status',due,was_paid)
  on conflict (stripe_dispute_id) do update set status=excluded.status,reason=excluded.reason,evidence_due_by=coalesce(excluded.evidence_due_by,public.payment_disputes.evidence_due_by),
    purchase_id=coalesce(public.payment_disputes.purchase_id,excluded.purchase_id),updated_at=now();
  if pur.id is not null then
    if open_status or (p_dispute->>'status')='lost' then update public.purchases set review_hold=true where id=pur.id; end if;
    -- A lost dispute, or one on an order the seller was already paid for, freezes that seller's other payouts until a person looks.
    if (p_dispute->>'status')='lost' or (open_status and was_paid) then update public.profiles set payout_review=true where id=pur.seller_id; end if;
  end if;
  return jsonb_build_object('purchase_id',pur.id,'seller_id',pur.seller_id,'seller_already_paid',was_paid,'transfer_id',pur.stripe_transfer_id,'open',open_status);
end;$$;
revoke all on function public.record_stripe_dispute(jsonb) from public,anon,authenticated;
grant execute on function public.record_stripe_dispute(jsonb) to service_role;

create function public.mark_dispute_progress(p_stripe_dispute_id text, p_evidence_saved boolean, p_transfer_reversed boolean) returns void
language sql security definer set search_path='' as $$
  update public.payment_disputes set evidence_saved_at=case when p_evidence_saved then now() else evidence_saved_at end,
    transfer_reversed=transfer_reversed or p_transfer_reversed, updated_at=now() where stripe_dispute_id=p_stripe_dispute_id;
$$;
revoke all on function public.mark_dispute_progress(text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.mark_dispute_progress(text,boolean,boolean) to service_role;

-- Everything we can say to the card issuer about one order, from our own records.
create function public.dispute_evidence_packet(p_purchase_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.purchases; l public.listings; r public.checkout_risk; d text; buyer_email text; buyer_name text; msgs integer; reqs integer;
begin
  select * into p from public.purchases where id=p_purchase_id;
  if not found then raise exception 'Purchase not found.'; end if;
  select * into l from public.listings where id=p.listing_id;
  select * into r from public.checkout_risk where checkout_session_id=(select id from public.checkout_sessions where stripe_checkout_session_id=p.stripe_checkout_session_id);
  if r.disclosure_version is not null then
    select body into d from public.disclosure_versions where version=r.disclosure_version and certificate_state=r.certificate_state;
  end if;
  select email into buyer_email from auth.users where id=p.buyer_id;
  select display_name into buyer_name from public.profiles where id=p.buyer_id;
  select count(*) into msgs from public.messages where conversation_id=p.conversation_id and sender_id=p.buyer_id;
  select count(*) into reqs from public.refund_requests where purchase_id=p.id;
  return jsonb_build_object(
    'title',l.title,'description',l.description,'category',l.category,'price_cents',p.price_cents,
    'certificate_state',coalesce(r.certificate_state,'unknown'),'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,
    'credibility_note','Credabilia shows an item credibility score and evidence notes on every listing; they are opinions, not guarantees.',
    'disclosure_text',d,'disclosure_version',r.disclosure_version,'disclosure_acknowledged_at',r.disclosure_acknowledged_at,
    'seller_attested_at',l.authenticity_attested_at,
    'fulfillment_method',p.fulfillment_method,'shipping_address',p.shipping_address,'shipping_provider',p.shipping_provider,'shipping_service',p.shipping_service,
    'tracking_number',p.tracking_number,'shipped_at',p.shipped_at,'delivered_at',p.delivered_at,'tracking_status',p.tracking_status,
    'signature_required',coalesce(r.signature_required,false),'inspection_accepted_at',p.inspection_accepted_at,'handoff_verified_at',p.handoff_verified_at,
    'buyer_email',buyer_email,'buyer_name',buyer_name,'buyer_message_count',msgs,'refund_request_count',reqs,'purchased_at',p.created_at);
end;$$;
revoke all on function public.dispute_evidence_packet(uuid) from public,anon,authenticated;
grant execute on function public.dispute_evidence_packet(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------------------
-- 7. Operator view: orders worth a second look, with their notes. Notes are never shown to buyers or sellers.
-- ---------------------------------------------------------------------------------------------------------------------------
create function public.admin_order_risk_queue() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row order by (row->>'created_at') desc) from (
    select jsonb_build_object(
      'purchase_id',p.id,'title',l.title,'price_cents',p.price_cents,'created_at',p.created_at,'escrow_status',p.escrow_status,
      'review_hold',p.review_hold,'delivered_at',p.delivered_at,'release_after',p.release_after,'fulfillment_method',p.fulfillment_method,
      'level',coalesce(r.level,'normal'),'flags',coalesce(to_jsonb(r.flags),'[]'::jsonb),'certificate_state',r.certificate_state,
      'disclosure_acknowledged',(r.disclosure_acknowledged_at is not null),'signature_required',coalesce(r.signature_required,false),
      'seller_name',(select display_name from public.profiles where id=p.seller_id),'buyer_name',(select display_name from public.profiles where id=p.buyer_id),
      'disputes',coalesce((select jsonb_agg(jsonb_build_object('id',d.stripe_dispute_id,'status',d.status,'reason',d.reason,'amount_cents',d.amount_cents,
        'evidence_due_by',d.evidence_due_by,'seller_already_paid',d.seller_already_paid,'transfer_reversed',d.transfer_reversed,'evidence_saved',d.evidence_saved_at is not null))
        from public.payment_disputes d where d.purchase_id=p.id),'[]'::jsonb),
      'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'note',n.note,'created_at',n.created_at,'author',(select display_name from public.profiles where id=n.author_id)) order by n.created_at)
        from public.order_notes n where n.purchase_id=p.id),'[]'::jsonb)) as row
    from public.purchases p
    join public.listings l on l.id=p.listing_id
    left join public.checkout_risk r on r.checkout_session_id=(select id from public.checkout_sessions c where c.stripe_checkout_session_id=p.stripe_checkout_session_id)
    where p.review_hold or r.level in ('elevated','high') or exists(select 1 from public.payment_disputes d where d.purchase_id=p.id)
       or exists(select 1 from public.order_notes n where n.purchase_id=p.id)
    order by p.created_at desc limit 100) q),'[]'::jsonb);
end;$$;
revoke all on function public.admin_order_risk_queue() from public,anon;
grant execute on function public.admin_order_risk_queue() to authenticated;

create function public.admin_add_order_note(p_purchase_id uuid, p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if not exists(select 1 from public.purchases where id=p_purchase_id) then raise exception 'Purchase not found.'; end if;
  insert into public.order_notes(purchase_id,author_id,note) values(p_purchase_id,auth.uid(),btrim(p_note));
end;$$;
revoke all on function public.admin_add_order_note(uuid,text) from public,anon;
grant execute on function public.admin_add_order_note(uuid,text) to authenticated;

commit;

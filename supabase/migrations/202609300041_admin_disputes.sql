begin;

-- Operator-facing dispute queue. Today the only way to resolve a 'contested' refund request is
-- by hand-editing the database -- process-refund/handler.js's own comment already documents this
-- as a trusted third caller ("the platform operator triggering it via net.http_post + the service
-- role key while resolving a contested case from SQL"). These two RPCs replace that manual-SQL
-- step with a real UI action, reusing the exact net.http_post + service_role_key trigger pattern
-- already used by the escrow/auction cron jobs (202609250019_escrow_release_schedule.sql,
-- 202609300036_auction_close_schedule.sql) -- no Stripe-calling code is touched.

create function public.admin_list_refund_requests(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'purchase_id',r.purchase_id,'listing_id',l.id,'title',l.title,'price_cents',pu.price_cents,
    'buyer_id',r.buyer_id,'buyer_name',bp.display_name,'seller_id',r.seller_id,'seller_name',sp.display_name,
    'reason',r.reason,'status',r.status,'seller_response',r.seller_response,'resolution_note',r.resolution_note,
    'offered_amount_cents',r.offered_amount_cents,'created_at',r.created_at,'resolved_at',r.resolved_at
  ) order by r.created_at desc) from public.refund_requests r
  join public.purchases pu on pu.id=r.purchase_id
  join public.listings l on l.id=pu.listing_id
  join public.profiles bp on bp.id=r.buyer_id
  join public.profiles sp on sp.id=r.seller_id
  where p_status is null or r.status=p_status),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_refund_requests(text) from public,anon;
grant execute on function public.admin_list_refund_requests(text) to authenticated;

-- p_action: 'approve' (full, or partial when p_amount_cents is given -- moves straight to
-- 'accepted' then triggers the real Stripe refund the same way a seller's own accept does) or
-- 'deny'. Approving from any status, including 'contested' (which nothing else can move), is the
-- whole point of this function.
create function public.admin_resolve_refund_request(p_request_id uuid, p_action text, p_amount_cents bigint default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare request public.refund_requests; purchase public.purchases; clean_note text; service_key text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_action not in ('approve','deny') then raise exception 'Invalid action.'; end if;
  select * into request from public.refund_requests where id=p_request_id for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status in ('refunded','denied') then raise exception 'This request has already been resolved.'; end if;

  clean_note:=nullif(btrim(coalesce(p_note,'')),'');
  if clean_note is not null and length(clean_note)>2000 then raise exception 'Keep the note under 2000 characters.'; end if;

  if p_action='deny' then
    update public.refund_requests set status='denied', resolution_note=clean_note, resolved_at=now() where id=p_request_id;
    return jsonb_build_object('id',p_request_id,'status','denied');
  end if;

  select * into purchase from public.purchases where id=request.purchase_id;
  if p_amount_cents is not null and (p_amount_cents<=0 or p_amount_cents>=purchase.price_cents) then
    raise exception 'Enter a partial amount less than the item price.';
  end if;

  update public.refund_requests set status='accepted', offered_amount_cents=p_amount_cents, resolution_note=clean_note where id=p_request_id;

  select decrypted_secret into service_key from vault.decrypted_secrets where name='service_role_key';
  if service_key is not null then
    perform net.http_post(
      url:='https://zedgmuovulbyclprokub.supabase.co/functions/v1/process-refund',
      headers:=jsonb_build_object('Authorization','Bearer '||service_key,'Content-Type','application/json'),
      body:=jsonb_build_object('refund_request_id',p_request_id),
      timeout_milliseconds:=10000
    );
  end if;
  return jsonb_build_object('id',p_request_id,'status','accepted');
end;$$;
revoke all on function public.admin_resolve_refund_request(uuid,text,bigint,text) from public,anon;
grant execute on function public.admin_resolve_refund_request(uuid,text,bigint,text) to authenticated;

commit;

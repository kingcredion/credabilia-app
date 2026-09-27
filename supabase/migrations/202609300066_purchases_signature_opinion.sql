begin;

-- my_purchases() never carried signature_ai_label/signature_ai_note, so a buyer's owned-item view
-- (about to start showing the signature close-up + AI opinion, same as the audit queue already
-- does) would always read "no opinion recorded" even when one exists. Everything else here is
-- byte-identical to 202609300064_conversations.sql's my_purchases().
create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'signature_ai_label',l.signature_ai_label,'signature_ai_note',l.signature_ai_note,
    'purchased_at',p.created_at,'shipping_cost_cents',p.shipping_cost_cents,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'insured',p.insured,'insurance_cost_cents',p.insurance_cost_cents,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'fulfillment_method',p.fulfillment_method,'seller_marked_picked_up_at',p.seller_marked_picked_up_at,'buyer_confirmed_pickup_at',p.buyer_confirmed_pickup_at,
    'pickup_station',case when p.fulfillment_method='pickup' then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
    'conversation_id',p.conversation_id,
    'message_count',(select count(*)::int from public.messages where conversation_id=p.conversation_id),
    'my_rating',sr.rating,'my_rating_comment',sr.comment,
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  left join public.seller_ratings sr on sr.purchase_id=p.id
  left join public.pickup_stations ps on ps.id=p.pickup_station_id
  where p.buyer_id=auth.uid();
$$;

commit;

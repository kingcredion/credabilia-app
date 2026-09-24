begin;

-- Hotfix: 202609300060_pickup_escrow.sql's create or replace of my_sales()/my_purchases() was
-- based on an older body and accidentally dropped the refund/return fields
-- (202609280024_refund_partial_and_return.sql) and the buyer's own seller-rating fields
-- (202609300034_seller_ratings.sql) that later migrations had already added. Restoring the full
-- field set here, keeping the new pickup fields alongside them.

create or replace function public.my_sales() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',p.price_cents,
    'created_at',p.created_at,'shipping_address',p.shipping_address,
    'shipping_cost_cents',p.shipping_cost_cents,'seller_shipping_charge_cents',p.seller_shipping_charge_cents,
    'shippo_transaction_id',p.shippo_transaction_id,'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,
    'tracking_status',p.tracking_status,'label_url',p.label_url,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'funds_released_at',p.funds_released_at,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'fulfillment_method',p.fulfillment_method,'seller_marked_picked_up_at',p.seller_marked_picked_up_at,'buyer_confirmed_pickup_at',p.buyer_confirmed_pickup_at,
    'pickup_station',case when p.fulfillment_method='pickup' then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  left join public.refund_requests r on r.purchase_id=p.id
  left join public.pickup_stations ps on ps.id=p.pickup_station_id
  where p.seller_id=auth.uid();
$$;

create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,'shipping_cost_cents',p.shipping_cost_cents,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'escrow_status',p.escrow_status,'insured',p.insured,'insurance_cost_cents',p.insurance_cost_cents,
    'refund_status',r.status,'refund_reason',r.reason,'refund_seller_response',r.seller_response,'refund_request_id',r.id,
    'offered_amount_cents',r.offered_amount_cents,
    'return_tracking_number',r.return_tracking_number,'return_tracking_url',r.return_tracking_url,'return_label_url',r.return_label_url,
    'return_shipped_at',r.return_shipped_at,'return_tracking_status',r.return_tracking_status,
    'fulfillment_method',p.fulfillment_method,'seller_marked_picked_up_at',p.seller_marked_picked_up_at,'buyer_confirmed_pickup_at',p.buyer_confirmed_pickup_at,
    'pickup_station',case when p.fulfillment_method='pickup' then jsonb_build_object('id',ps.id,'jurisdiction',ps.jurisdiction,'city',ps.city,'state',ps.state,'country',ps.country,'notes',ps.notes) else null end,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
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

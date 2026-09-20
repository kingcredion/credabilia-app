begin;

-- Per-purchase messaging ------------------------------------------------------------------
-- Scoped to one purchase at a time (not a general inbox) so a thread is always about a
-- specific item -- no topic-picking, no hunting for context.

create table public.messages(
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  sender_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index messages_purchase on public.messages(purchase_id, created_at);
alter table public.messages enable row level security;
-- No direct table grants at all -- every read/write goes through the RPCs below, same as
-- storefronts/dashboard/shipping.
revoke all on public.messages from public,anon,authenticated;

create function public.send_message(p_purchase_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text; new_id uuid; new_created timestamptz; sender_name text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>2000 then raise exception 'Write a message between 1 and 2000 characters.'; end if;
  if not exists(select 1 from public.purchases where id=p_purchase_id and (buyer_id=actor or seller_id=actor)) then
    raise exception 'Purchase not found.';
  end if;
  insert into public.messages(purchase_id,sender_id,body) values(p_purchase_id,actor,clean) returning id,created_at into new_id,new_created;
  select display_name into sender_name from public.profiles where id=actor;
  return jsonb_build_object('id',new_id,'body',clean,'created_at',new_created,'sender_id',actor,'sender_name',sender_name);
end;$$;
revoke all on function public.send_message(uuid,text) from public,anon;
grant execute on function public.send_message(uuid,text) to authenticated;

create function public.get_messages(p_purchase_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.purchases where id=p_purchase_id and (buyer_id=actor or seller_id=actor)) then
    raise exception 'Purchase not found.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'body',m.body,'created_at',m.created_at,'sender_id',m.sender_id,'sender_name',p.display_name
  ) order by m.created_at) from public.messages m join public.profiles p on p.id=m.sender_id where m.purchase_id=p_purchase_id),'[]'::jsonb);
end;$$;
revoke all on function public.get_messages(uuid) from public,anon;
grant execute on function public.get_messages(uuid) to authenticated;

-- Sold/purchased views now surface message activity without a separate round trip ------------

create or replace function public.my_sales() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'listing_id',l.id,'title',l.title,'category',l.category,'price_cents',p.price_cents,
    'created_at',p.created_at,'shipping_address',p.shipping_address,
    'shippo_transaction_id',p.shippo_transaction_id,'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,
    'tracking_status',p.tracking_status,'label_url',p.label_url,'shipped_at',p.shipped_at,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id and m.kind='item'),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.seller_id=auth.uid();
$$;

create or replace function public.my_purchases() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'purchase_id',p.id,'title',l.title,'description',l.description,'category',l.category,'evidence',l.evidence,
    'price_cents',l.price_cents,'attributes',l.attributes,'tags',l.tags,
    'certificate_issuer',l.certificate_issuer,'certificate_number',l.certificate_number,'certificate_company',l.certificate_company,
    'purchased_at',p.created_at,
    'tracking_number',p.tracking_number,'tracking_url',p.tracking_url,'tracking_status',p.tracking_status,'shipped_at',p.shipped_at,
    'message_count',(select count(*)::int from public.messages where purchase_id=p.id),
    'media',coalesce((select jsonb_agg(jsonb_build_object('path',m.path,'kind',m.kind) order by m.position) from public.listing_media m where m.listing_id=l.id),'[]'::jsonb)
  ) order by p.created_at desc),'[]'::jsonb)
  from public.purchases p join public.listings l on l.id=p.listing_id
  where p.buyer_id=auth.uid();
$$;

commit;

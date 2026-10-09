begin;

-- The operator's Reports tab only said "listing · reported by …": no title, seller or link, so a listing report could not be acted on without
-- hunting for it. Every report now carries what it is about: the listing (title, price, status, seller), the member (name, storefront, whether
-- banned or deleted), or the message (text, who sent it, which listing the conversation is about). Operator-only, same as before.
create or replace function public.admin_list_reports(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'reporter_id',r.reporter_id,'reporter_name',p.display_name,'target_type',r.target_type,'target_id',r.target_id,
    'reason',r.reason,'details',r.details,'status',r.status,'resolution_note',r.resolution_note,
    'created_at',r.created_at,'resolved_at',r.resolved_at,
    'review',case when r.target_type='review' then (select jsonb_build_object('rating',sr.rating,'comment',sr.comment,'reviewer_name',bp.display_name,'seller_name',sp.display_name,
        'hidden',sr.hidden_at is not null,'item_title',l.title,'created_at',sr.created_at)
      from public.seller_ratings sr join public.profiles bp on bp.id=sr.buyer_id join public.profiles sp on sp.id=sr.seller_id
      join public.purchases pu on pu.id=sr.purchase_id join public.listings l on l.id=pu.listing_id where sr.id=r.target_id) else null end,
    'listing',case when r.target_type='listing' then (select jsonb_build_object('id',l.id,'title',l.title,'price_cents',l.price_cents,'status',l.status,'category',l.category,
        'seller_id',l.seller_id,'seller_name',sp.display_name,'seller_slug',sp.slug)
      from public.listings l join public.profiles sp on sp.id=l.seller_id where l.id=r.target_id) else null end,
    'member',case when r.target_type='user' then (select jsonb_build_object('id',up.id,'name',up.display_name,'slug',up.slug,'banned',up.banned_at is not null,'deleted',up.deleted_at is not null)
      from public.profiles up where up.id=r.target_id) else null end,
    'message',case when r.target_type='message' then (select jsonb_build_object('body',m.body,'sent_at',m.created_at,'sender_id',m.sender_id,'sender_name',mp.display_name,
        'listing_id',l.id,'listing_title',l.title)
      from public.messages m join public.profiles mp on mp.id=m.sender_id join public.conversations c on c.id=m.conversation_id join public.listings l on l.id=c.listing_id where m.id=r.target_id) else null end
  ) order by r.created_at desc) from public.reports r join public.profiles p on p.id=r.reporter_id
  where p_status is null or r.status=p_status),'[]'::jsonb);
end;$$;

commit;

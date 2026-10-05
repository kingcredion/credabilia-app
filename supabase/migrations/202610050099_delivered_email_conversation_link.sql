begin;

-- The Item Delivered email now sends the buyer straight to the order's conversation, where the inspection checklist is waiting.
-- Same function as 202610050095, plus conversation_url in the event.
create or replace function public.update_tracking_status(p_tracking_number text, p_tracking_status text) returns void
language plpgsql security definer set search_path='' as $$
declare purchase public.purchases; item_title text;
begin
  for purchase in select * from public.purchases where tracking_number=p_tracking_number loop
    update public.purchases set tracking_status=p_tracking_status where id=purchase.id;
    if p_tracking_status='DELIVERED' and purchase.tracking_status is distinct from 'DELIVERED' then
      select title into item_title from public.listings where id=purchase.listing_id;
      perform public.notify_klaviyo_user(purchase.buyer_id,'Item Delivered',jsonb_build_object(
        'listing_id',purchase.listing_id,'title',item_title,'tracking_url',purchase.tracking_url,
        'conversation_url',case when purchase.conversation_id is not null then 'https://credabilia.com/?conversation='||purchase.conversation_id else null end));
      perform public.schedule_payout(purchase.id);
    end if;
  end loop;
end;$$;

commit;

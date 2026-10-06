begin;

-- A buy request puts a fixed-price listing on hold ('pending') while the seller answers, for 24 hours. When the request expired unanswered nothing put the
-- listing back for sale: the only cleanup ran when someone made a NEW request, but a held listing is hidden from browsing, so nobody could. The listing
-- stayed hidden for good. This sweep (run every 10 minutes, see the schedule migration) expires old requests and returns the listing to sale.
-- Auctions are left alone: their winner's 48 hours are handled by settle_ended_auctions. A checkout that was started but abandoned is given an hour of
-- grace past its own 30-minute window before it is expired, in case Stripe's confirmation of a payment is late.
create function public.release_expired_holds() returns integer
language plpgsql security definer set search_path='' as $$
declare released integer:=0;
begin
  update public.checkout_sessions set status='expired' where status='pending' and expires_at<now()-interval '1 hour';
  update public.availability_requests set status='expired'
    where status in ('pending','confirmed') and not coalesce(auction_award,false) and expires_at<now();
  with freed as (
    update public.listings l set status='active'
      where l.status='pending' and l.listing_type<>'auction'
        and not exists(select 1 from public.availability_requests r where r.listing_id=l.id and r.status in ('pending','confirmed') and r.expires_at>=now())
        and not exists(select 1 from public.checkout_sessions c where c.listing_id=l.id and c.status='pending')
        and not exists(select 1 from public.purchases p where p.listing_id=l.id and p.escrow_status<>'refunded')
      returning l.id)
  select count(*) into released from freed;
  return released;
end;$$;
revoke all on function public.release_expired_holds() from public,anon,authenticated;
grant execute on function public.release_expired_holds() to service_role;

commit;

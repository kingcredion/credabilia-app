begin;

-- Operator alerts via Klaviyo -- no SMTP/email-provider code exists anywhere in this repo, so
-- notify_klaviyo() (202609300038/39) is the only channel that already reaches a real inbox.
-- report_content() already fires its own event (202609300043_reports_and_blocks.sql). This
-- migration wires the other two trigger points: a dispute going 'contested' (the one state
-- nothing else in the app can move forward), and a user's first support message in a rolling
-- window (guarded so an active back-and-forth doesn't spam the operator on every line).
-- Firing the Klaviyo event is only half the job -- David still needs to create a Flow in
-- Klaviyo's own dashboard (outside this repo) that turns each event name into an email to
-- kingcredion@credabilia.com.

create or replace function public.respond_to_refund_request(p_request_id uuid, p_accept boolean, p_response text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); request public.refund_requests; clean text; new_status text; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into request from public.refund_requests where id=p_request_id and seller_id=actor for update;
  if not found then raise exception 'Refund request not found.'; end if;
  if request.status<>'pending' then raise exception 'This request has already been responded to.'; end if;

  clean:=nullif(btrim(coalesce(p_response,'')),'');
  if clean is not null and length(clean)>2000 then raise exception 'Keep your response under 2000 characters.'; end if;
  new_status:=case when p_accept then 'accepted' else 'contested' end;

  update public.refund_requests set status=new_status, seller_response=clean where id=p_request_id;
  if new_status='contested' then
    select l.title into item_title from public.purchases p join public.listings l on l.id=p.listing_id where p.id=request.purchase_id;
    perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: New Dispute',jsonb_build_object('refund_request_id',p_request_id,'title',item_title,'seller_response',clean));
  end if;
  return jsonb_build_object('id',p_request_id,'status',new_status,'seller_response',clean);
end;$$;

-- consume_support_message() already runs right before every send_support_message() call and
-- tracks a rolling 1-hour window/attempt-count per user -- reuse that same window as the "is this
-- a brand new conversation" signal instead of tracking a second piece of state.
create or replace function public.send_support_message(p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text; new_id uuid; new_created timestamptz; first_in_window boolean;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>2000 then raise exception 'Write a message between 1 and 2000 characters.'; end if;
  select attempts=1 into first_in_window from public.support_message_usage where user_id=actor;
  insert into public.support_messages(user_id,role,body) values(actor,'user',clean) returning id,created_at into new_id,new_created;
  if coalesce(first_in_window,true) then
    perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: New Support Message',jsonb_build_object('user_id',actor,'body',clean));
  end if;
  return jsonb_build_object('id',new_id,'role','user','body',clean,'created_at',new_created);
end;$$;

commit;

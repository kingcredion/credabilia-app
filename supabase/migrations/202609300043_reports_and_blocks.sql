begin;

-- Reporting a listing/user/message and blocking another user -- both entirely new surfaces,
-- required for app-store review of a marketplace with in-app messaging (Apple 1.2/5.1.1, Google
-- Play's UGC policy). Same RLS-via-RPC lockdown as every other table in this app.

create table public.reports(
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('listing','user','message')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 200),
  details text check (details is null or char_length(details)<=2000),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index reports_status on public.reports(status, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from public,anon,authenticated;

create function public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean_reason text; clean_details text; new_id uuid; new_created timestamptz;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_target_type not in ('listing','user','message') then raise exception 'Invalid report type.'; end if;
  clean_reason:=btrim(p_reason);
  if clean_reason='' or length(clean_reason)>200 then raise exception 'Choose a reason.'; end if;
  clean_details:=nullif(btrim(coalesce(p_details,'')),'');
  if clean_details is not null and length(clean_details)>2000 then raise exception 'Keep details under 2000 characters.'; end if;
  insert into public.reports(reporter_id,target_type,target_id,reason,details) values(actor,p_target_type,p_target_id,clean_reason,clean_details)
    returning id,created_at into new_id,new_created;
  perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: New Report',jsonb_build_object('target_type',p_target_type,'target_id',p_target_id,'reason',clean_reason));
  return jsonb_build_object('id',new_id,'created_at',new_created);
end;$$;
revoke all on function public.report_content(text,uuid,text,text) from public,anon;
grant execute on function public.report_content(text,uuid,text,text) to authenticated;

create function public.admin_list_reports(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',r.id,'reporter_id',r.reporter_id,'reporter_name',p.display_name,'target_type',r.target_type,'target_id',r.target_id,
    'reason',r.reason,'details',r.details,'status',r.status,'resolution_note',r.resolution_note,
    'created_at',r.created_at,'resolved_at',r.resolved_at
  ) order by r.created_at desc) from public.reports r join public.profiles p on p.id=r.reporter_id
  where p_status is null or r.status=p_status),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_reports(text) from public,anon;
grant execute on function public.admin_list_reports(text) to authenticated;

create function public.admin_resolve_report(p_report_id uuid, p_status text, p_note text default null, p_remove_listing boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare report public.reports; clean_note text;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_status not in ('resolved','dismissed') then raise exception 'Invalid status.'; end if;
  select * into report from public.reports where id=p_report_id for update;
  if not found then raise exception 'Report not found.'; end if;
  clean_note:=nullif(btrim(coalesce(p_note,'')),'');
  update public.reports set status=p_status, resolution_note=clean_note, resolved_at=now() where id=p_report_id;
  if p_remove_listing and report.target_type='listing' then
    update public.listings set status='archived' where id=report.target_id;
  end if;
  return jsonb_build_object('id',p_report_id,'status',p_status);
end;$$;
revoke all on function public.admin_resolve_report(uuid,text,text,boolean) from public,anon;
grant execute on function public.admin_resolve_report(uuid,text,text,boolean) to authenticated;

-- Blocking: once either side has blocked the other, send_message refuses new messages between
-- them. Existing threads/history are untouched -- this only stops new contact.
create table public.blocks(
  blocker_id uuid not null references public.profiles(id),
  blocked_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check (blocker_id<>blocked_id)
);
alter table public.blocks enable row level security;
revoke all on public.blocks from public,anon,authenticated;

create function public.block_user(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_user_id=actor then raise exception 'You cannot block yourself.'; end if;
  insert into public.blocks(blocker_id,blocked_id) values(actor,p_user_id) on conflict do nothing;
end;$$;
revoke all on function public.block_user(uuid) from public,anon;
grant execute on function public.block_user(uuid) to authenticated;

create function public.unblock_user(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  delete from public.blocks where blocker_id=auth.uid() and blocked_id=p_user_id;
end;$$;
revoke all on function public.unblock_user(uuid) from public,anon;
grant execute on function public.unblock_user(uuid) to authenticated;

create function public.my_blocked_users() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id',b.blocked_id,'display_name',p.display_name) order by b.created_at desc),'[]'::jsonb)
  from public.blocks b join public.profiles p on p.id=b.blocked_id where b.blocker_id=auth.uid();
$$;
revoke all on function public.my_blocked_users() from public,anon;
grant execute on function public.my_blocked_users() to authenticated;

-- send_message now refuses if either party has blocked the other.
create or replace function public.send_message(p_purchase_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); clean text; new_id uuid; new_created timestamptz; sender_name text;
  purchase public.purchases; recipient uuid; item_title text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>2000 then raise exception 'Write a message between 1 and 2000 characters.'; end if;
  select * into purchase from public.purchases where id=p_purchase_id and (buyer_id=actor or seller_id=actor);
  if not found then raise exception 'Purchase not found.'; end if;
  recipient:=case when purchase.buyer_id=actor then purchase.seller_id else purchase.buyer_id end;
  if exists(select 1 from public.blocks where (blocker_id=actor and blocked_id=recipient) or (blocker_id=recipient and blocked_id=actor)) then
    raise exception 'You cannot message this user.';
  end if;
  insert into public.messages(purchase_id,sender_id,body) values(p_purchase_id,actor,clean) returning id,created_at into new_id,new_created;
  select display_name into sender_name from public.profiles where id=actor;
  select title into item_title from public.listings where id=purchase.listing_id;
  perform public.notify_push(recipient, coalesce(sender_name,'A collector')||' sent you a message', left(clean,120), '/?item='||purchase.listing_id);
  return jsonb_build_object('id',new_id,'body',clean,'created_at',new_created,'sender_id',actor,'sender_name',sender_name);
end;$$;

commit;

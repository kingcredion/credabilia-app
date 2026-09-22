begin;

-- Human follow-up for King Credion's AI-only support chat: the operator can now read and reply
-- to any user's thread. 'operator' replies are pushed to the user the same way a seller's message
-- is (notify_push), since there's no email infrastructure in this app to fall back on.

alter table public.support_messages drop constraint support_messages_role_check;
alter table public.support_messages add constraint support_messages_role_check check (role in ('user','assistant','operator'));

create function public.admin_list_support_conversations() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'user_id',x.user_id,'display_name',p.display_name,'last_body',x.last_body,'last_role',x.last_role,'last_created_at',x.last_created_at
  ) order by x.last_created_at desc) from (
    select distinct on (user_id) user_id, body as last_body, role as last_role, created_at as last_created_at
    from public.support_messages order by user_id, created_at desc
  ) x join public.profiles p on p.id=x.user_id),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_support_conversations() from public,anon;
grant execute on function public.admin_list_support_conversations() to authenticated;

create function public.admin_get_support_thread(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'role',role,'body',body,'created_at',created_at) order by created_at)
    from public.support_messages where user_id=p_user_id),'[]'::jsonb);
end;$$;
revoke all on function public.admin_get_support_thread(uuid) from public,anon;
grant execute on function public.admin_get_support_thread(uuid) to authenticated;

create function public.admin_reply_to_support(p_user_id uuid, p_body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare clean text; new_id uuid; new_created timestamptz;
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  clean:=btrim(p_body);
  if clean='' or length(clean)>4000 then raise exception 'Write a reply between 1 and 4000 characters.'; end if;
  insert into public.support_messages(user_id,role,body) values(p_user_id,'operator',clean) returning id,created_at into new_id,new_created;
  perform public.notify_push(p_user_id, 'New reply from Credabilia Support', left(clean,120), '/');
  return jsonb_build_object('id',new_id,'role','operator','body',clean,'created_at',new_created);
end;$$;
revoke all on function public.admin_reply_to_support(uuid,text) from public,anon;
grant execute on function public.admin_reply_to_support(uuid,text) to authenticated;

-- Operator user directory -- search across the whole member base, joining auth.users for email
-- since profiles itself has no email column.
create function public.admin_list_users(p_search text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Not authorized' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'display_name',p.display_name,'email',u.email,'created_at',p.created_at,
    'listing_count',(select count(*)::int from public.listings where seller_id=p.id),
    'sales_count',(select count(*)::int from public.purchases where seller_id=p.id),
    'purchase_count',(select count(*)::int from public.purchases where buyer_id=p.id)
  ) order by p.created_at desc) from public.profiles p join auth.users u on u.id=p.id
  where p_search is null or p.display_name ilike '%'||p_search||'%' or u.email ilike '%'||p_search||'%'
  limit 200),'[]'::jsonb);
end;$$;
revoke all on function public.admin_list_users(text) from public,anon;
grant execute on function public.admin_list_users(text) to authenticated;

commit;

-- Founding 100 requests remember where the visitor came from (for example "instagram/founding100"), so staff can see which ad produced which request.
-- It is only a short plain label taken from the link's utm_source and utm_campaign; never anything about the person.
begin;

alter table public.founding_requests add column source text;

drop function public.submit_founding_request(text,text,text,text,text,text,text);
create function public.submit_founding_request(p_email text, p_name text, p_business text, p_link text default null, p_sells text default null, p_heard text default null, p_website text default null, p_source text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare camp public.founding_campaign; e text:=btrim(coalesce(p_email,'')); n text:=btrim(coalesce(p_name,'')); b text:=btrim(coalesce(p_business,'')); norm text; recent integer; waiting integer;
  src text:=nullif(left(regexp_replace(btrim(coalesce(p_source,'')),'[^A-Za-z0-9_./ -]','','g'),100),'');
begin
  if btrim(coalesce(p_website,''))<>'' then return jsonb_build_object('received',true); end if;
  if length(e)>254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  if n='' or length(n)>100 then raise exception 'Enter your name.'; end if;
  if b='' or length(b)>120 then raise exception 'Enter your shop or business name.'; end if;
  if length(coalesce(p_link,''))>300 or length(coalesce(p_sells,''))>500 or length(coalesce(p_heard,''))>200 then raise exception 'One of your answers is too long.'; end if;
  select * into camp from public.founding_campaign where id=1;
  if camp.started_at is null or camp.expires_at is null or now()>=camp.expires_at or camp.claimed_count>=camp.spot_limit or camp.closed_reason is not null then
    raise exception 'The Founding 100 is not taking requests right now.';
  end if;
  select count(*) into recent from public.founding_requests where created_at>now()-interval '1 hour';
  select count(*) into waiting from public.founding_requests where status='pending';
  if recent>=100 or waiting>=1000 then raise exception 'We are getting a lot of requests right now. Please try again a little later.'; end if;
  norm:=public.normalize_email(e);
  if exists(select 1 from public.founding_invitations where email_normalized=norm)
     or exists(select 1 from public.founding_members where email_hash=encode(sha256(convert_to(norm,'UTF8')),'hex')) then
    return jsonb_build_object('received',true);
  end if;
  insert into public.founding_requests(email_normalized,email,contact_name,business_name,store_link,what_they_sell,how_heard,source)
    values(norm,e,n,b,nullif(btrim(coalesce(p_link,'')),''),nullif(btrim(coalesce(p_sells,'')),''),nullif(btrim(coalesce(p_heard,'')),''),src)
    on conflict (email_normalized) do nothing;
  return jsonb_build_object('received',true);
end;$$;
revoke all on function public.submit_founding_request(text,text,text,text,text,text,text,text) from public;
grant execute on function public.submit_founding_request(text,text,text,text,text,text,text,text) to anon, authenticated;

create or replace function public.admin_founding_requests(p_status text default 'pending', p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(x)) from (
    select id,email,contact_name,business_name,store_link,what_they_sell,how_heard,source,status,created_at,decided_at
    from public.founding_requests where p_status is null or status=p_status
    order by created_at limit least(greatest(coalesce(p_limit,100),1),500)) x),'[]'::jsonb);
end;$$;

commit;

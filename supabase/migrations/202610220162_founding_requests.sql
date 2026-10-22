-- Founding 100: requests for an invitation. People who land on /founding (for example from an ad) and were not on the invitation list can ask to be
-- considered. Nothing is automatic: a request is stored privately, staff read it, and only an approval adds that email to the invitation list. From there
-- the person claims the spot exactly like an invited seller (same verified-email check, same 100-spot cap, same window).
--
-- Privacy: requests are reachable only through the functions below (no table grants, row level security on). They are deleted when the campaign closes.
begin;

create table public.founding_requests (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  email text not null,
  contact_name text not null,
  business_name text not null,
  store_link text,
  what_they_sell text,
  how_heard text,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
create index founding_requests_status on public.founding_requests(status, created_at);
alter table public.founding_requests enable row level security;
revoke all on public.founding_requests from public,anon,authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Public: is the program taking people right now, and how many spots remain. Nothing about any person.
create function public.founding_open_info() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'open', c.started_at is not null and c.expires_at is not null and now()<c.expires_at and c.claimed_count<c.spot_limit and c.closed_reason is null,
    'spots_left', case when c.started_at is not null and c.expires_at is not null and now()<c.expires_at and c.claimed_count<c.spot_limit and c.closed_reason is null then c.spot_limit-c.claimed_count end)
  from public.founding_campaign c where c.id=1;
$$;
revoke all on function public.founding_open_info() from public;
grant execute on function public.founding_open_info() to anon, authenticated;

-- Public: ask for an invitation. Always answers the same way once the details are valid, so the form can never be used to find out whether an address is on
-- the invitation list or has already asked. p_website is a hidden field real visitors never fill in; a bot that does is quietly ignored.
create function public.submit_founding_request(p_email text, p_name text, p_business text, p_link text default null, p_sells text default null, p_heard text default null, p_website text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare camp public.founding_campaign; e text:=btrim(coalesce(p_email,'')); n text:=btrim(coalesce(p_name,'')); b text:=btrim(coalesce(p_business,'')); norm text; recent integer; waiting integer;
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
  insert into public.founding_requests(email_normalized,email,contact_name,business_name,store_link,what_they_sell,how_heard)
    values(norm,e,n,b,nullif(btrim(coalesce(p_link,'')),''),nullif(btrim(coalesce(p_sells,'')),''),nullif(btrim(coalesce(p_heard,'')),''))
    on conflict (email_normalized) do nothing;
  return jsonb_build_object('received',true);
end;$$;
revoke all on function public.submit_founding_request(text,text,text,text,text,text,text) from public;
grant execute on function public.submit_founding_request(text,text,text,text,text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------------------
-- Staff only (operators).
create function public.admin_founding_requests(p_status text default 'pending', p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(row_to_json(x)) from (
    select id,email,contact_name,business_name,store_link,what_they_sell,how_heard,status,created_at,decided_at
    from public.founding_requests where p_status is null or status=p_status
    order by created_at limit least(greatest(coalesce(p_limit,100),1),500)) x),'[]'::jsonb);
end;$$;
revoke all on function public.admin_founding_requests(text,integer) from public,anon;
grant execute on function public.admin_founding_requests(text,integer) to authenticated;

-- Approving adds the email to the invitation list (the person then claims it the normal way). Declining only records the decision. Either way a request is
-- decided once.
create function public.admin_founding_decide_request(p_id uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); req public.founding_requests; camp public.founding_campaign; added integer:=0;
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  select * into req from public.founding_requests where id=p_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if req.status<>'pending' then raise exception 'This request was already reviewed.'; end if;
  if p_approve then
    select * into camp from public.founding_campaign where id=1 for update;
    if camp.closed_reason is not null or camp.expires_at is null or now()>=camp.expires_at or camp.claimed_count>=camp.spot_limit then
      raise exception 'The campaign is closed; requests can no longer be approved.';
    end if;
    insert into public.founding_invitations(email_normalized,email,contact_name,business_name)
      values(req.email_normalized,req.email,req.contact_name,req.business_name) on conflict (email_normalized) do nothing;
    get diagnostics added=row_count;
    if added=1 then update public.founding_campaign set invitations_loaded=invitations_loaded+1 where id=1; end if;
  end if;
  update public.founding_requests set status=case when p_approve then 'approved' else 'declined' end, decided_at=now(), decided_by=actor where id=p_id;
  return jsonb_build_object('status',case when p_approve then 'approved' else 'declined' end,'email',req.email);
end;$$;
revoke all on function public.admin_founding_decide_request(uuid,boolean) from public,anon;
grant execute on function public.admin_founding_decide_request(uuid,boolean) to authenticated;

-- The overview gains the request counts. Everything else is unchanged.
create or replace function public.admin_founding_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare camp public.founding_campaign;
begin
  if not public.is_operator() then raise exception 'Operators only.' using errcode='42501'; end if;
  select * into camp from public.founding_campaign where id=1;
  return jsonb_build_object(
    'started_at',camp.started_at,'expires_at',camp.expires_at,'window_days',camp.window_days,'spot_limit',camp.spot_limit,'closed_reason',camp.closed_reason,
    'invitations_loaded',camp.invitations_loaded,'invitations_open',(select count(*) from public.founding_invitations),
    'claimed',camp.claimed_count,'spots_left',greatest(camp.spot_limit-camp.claimed_count,0),'removed_unclaimed',camp.invitations_removed_unclaimed,
    'requests_pending',(select count(*) from public.founding_requests where status='pending'),
    'requests_approved',(select count(*) from public.founding_requests where status='approved'),
    'requests_declined',(select count(*) from public.founding_requests where status='declined'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',p.display_name,'spot_number',m.spot_number,'claimed_at',m.claimed_at,
                           'email',u.email,'providers',coalesce(u.raw_app_meta_data->'providers',to_jsonb(array[coalesce(u.raw_app_meta_data->>'provider','email')])),
                           'apple_hidden_email',coalesce(u.email ilike '%@privaterelay.appleid.com',false)) order by m.spot_number)
                         from public.founding_members m left join public.profiles p on p.id=m.user_id left join auth.users u on u.id=m.user_id),'[]'::jsonb));
end;$$;

-- Cleanup also deletes the requests once the campaign is over, whether it ended by the date or by filling up. It still touches no account and no claimed benefit.
create or replace function public.purge_expired_founding_invitations() returns integer
language plpgsql security definer set search_path='' as $$
declare camp public.founding_campaign; removed integer:=0;
begin
  select * into camp from public.founding_campaign where id=1 for update;
  if camp.expires_at is null or (now()<camp.expires_at and camp.closed_reason is null) then return 0; end if;
  with gone as (delete from public.founding_invitations returning 1) select count(*) into removed from gone;
  delete from public.founding_requests;
  update public.founding_campaign set invitations_removed_unclaimed=invitations_removed_unclaimed+removed, closed_reason=coalesce(closed_reason,'expired') where id=1;
  return removed;
end;$$;

commit;

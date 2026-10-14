begin;

-- Giveaways and tickets. An operator flips one King's Collection listing into a giveaway prize: while it is a prize nobody can buy it, bid on it, or ask to buy it
-- (database triggers, so a stale screen cannot get around it). Members enter with one tap; an entry only counts while the member is a fully set-up Stripe seller
-- (this keeps fake accounts out). Tickets are never stored: they are counted from what members actually did inside the giveaway's window, so a deleted listing or an
-- unverified account loses its ticket by itself.
--   1 ticket  for entering (counts only while the member is Stripe-ready)
--   +1 ticket for each listing that has been live for 7 days (no cap; archived / held / draft listings do not count)
--   +1 ticket for each member who joined through your link and is Stripe-ready
-- Anyone can also enter free by email (a "mail-in" entry added by an operator, 1 ticket) so no account, payment or Stripe step is needed to take part.
-- The draw is automatic on a fixed end date (default six months after the start), weighted by tickets, with one alternate winner if the winner does not claim in 14 days.
--
-- Built-in limits (so the giveaway cannot drift into something that needs state registration or a lawyer):
--   * a prize must be worth less than $5,000 (New York and Florida register promotions above that; see docs/giveaway-and-tickets-spec.md),
--   * entrants and winners must live in the 50 states or DC, and not in an excluded state (default NY, FL, RI),
--   * there is no early end: the end date is fixed when the giveaway starts (Google Play wants a fixed entry deadline).

-- Referrals ----------------------------------------------------------------------------------------------------------------------------------------------------
alter table public.profiles
  add column referral_code text,
  add column referred_by uuid references public.profiles(id) on delete set null,
  add column referred_at timestamptz;
create unique index profiles_referral_code_key on public.profiles(referral_code) where referral_code is not null;

-- Tables -------------------------------------------------------------------------------------------------------------------------------------------------------
create table public.giveaways(
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  status text not null default 'active' check (status in ('active','drawn','cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  rules_url text not null default '/giveaway-rules',
  excluded_states text[] not null default array['NY','FL','RI'],
  created_by uuid references public.profiles(id),
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index giveaways_one_active on public.giveaways(status) where status='active';
create index giveaways_listing on public.giveaways(listing_id);
create index giveaways_created_by on public.giveaways(created_by);

create table public.giveaway_entries(
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  state text not null,
  accepted_rules_at timestamptz not null default now(),
  primary key (giveaway_id, user_id)
);
create index giveaway_entries_user on public.giveaway_entries(user_id);

-- Free email entries, typed in by an operator. One ticket each, no bonus tickets.
create table public.giveaway_mailin_entries(
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  state text not null,
  created_at timestamptz not null default now()
);
create unique index giveaway_mailin_unique_email on public.giveaway_mailin_entries(giveaway_id, lower(email));

create table public.giveaway_winners(
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references public.giveaways(id) on delete cascade,
  user_id uuid references public.profiles(id),
  mailin_id uuid references public.giveaway_mailin_entries(id),
  place integer not null check (place in (1,2)),
  status text not null default 'pending' check (status in ('pending','notified','claimed','forfeited')),
  notified_at timestamptz,
  claim_deadline timestamptz,
  claimed_at timestamptz,
  shipping_address jsonb,
  check ((user_id is not null) <> (mailin_id is not null)),
  unique (giveaway_id, place),
  unique (giveaway_id, user_id),
  unique (giveaway_id, mailin_id)
);
create index giveaway_winners_user on public.giveaway_winners(user_id);
create index giveaway_winners_mailin on public.giveaway_winners(mailin_id);
create index profiles_referred_by on public.profiles(referred_by) where referred_by is not null;

alter table public.giveaways enable row level security;
alter table public.giveaway_entries enable row level security;
alter table public.giveaway_mailin_entries enable row level security;
alter table public.giveaway_winners enable row level security;
revoke all on public.giveaways, public.giveaway_entries, public.giveaway_mailin_entries, public.giveaway_winners from public, anon, authenticated;

-- The prize cannot be bought, bid on, or requested ---------------------------------------------------------------------------------------------------------------
create function public.block_giveaway_purchase() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.giveaways g where g.listing_id=new.listing_id and g.status in ('active','drawn')) then
    raise exception 'This item is a giveaway prize and cannot be bought.';
  end if;
  return new;
end;$$;
revoke all on function public.block_giveaway_purchase() from public, anon, authenticated;
create trigger block_giveaway_buy_request before insert on public.availability_requests for each row execute function public.block_giveaway_purchase();
create trigger block_giveaway_checkout before insert on public.checkout_sessions for each row execute function public.block_giveaway_purchase();
create trigger block_giveaway_bid before insert on public.bids for each row execute function public.block_giveaway_purchase();

-- Where people may live ------------------------------------------------------------------------------------------------------------------------------------------
-- The 50 states and DC, minus the giveaway's excluded states. (The default exclusions, NY FL RI, are also in src/giveaway.js; a test keeps the two in step.)
create function public.giveaway_state_ok(p_state text, p_excluded text[]) returns boolean
language sql immutable set search_path='' as $$
  select upper(btrim(coalesce(p_state,''))) = any(array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO',
      'MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'])
    and not (upper(btrim(coalesce(p_state,''))) = any(coalesce(p_excluded,'{}'::text[])));
$$;
revoke all on function public.giveaway_state_ok(text,text[]) from public, anon, authenticated;

-- Who can take part ----------------------------------------------------------------------------------------------------------------------------------------------
-- "ok" = a real member (not banned, deleted, an operator, or the App Review test account); "ready" = ok AND a fully set-up Stripe seller.
create function public.giveaway_user_ok(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_user and p.banned_at is null and p.deleted_at is null and u.email is not null and u.email not ilike 'appreview@%'
      and not exists(select 1 from public.operators o where o.user_id=p.id));
$$;
create function public.giveaway_user_ready(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.giveaway_user_ok(p_user) and exists(select 1 from public.stripe_accounts sa where sa.user_id=p_user and sa.charges_enabled);
$$;
revoke all on function public.giveaway_user_ok(uuid), public.giveaway_user_ready(uuid) from public, anon, authenticated;

-- Tickets, counted from real activity. One row per member entrant; p_user narrows it to one person. -------------------------------------------------------------------
create function public.giveaway_ticket_rows(p_giveaway uuid, p_user uuid default null)
returns table(user_id uuid, ready boolean, listings integer, referrals integer, tickets integer)
language plpgsql stable security definer set search_path='' as $$
declare g public.giveaways; window_end timestamptz;
begin
  select * into g from public.giveaways where id=p_giveaway;
  if not found then return; end if;
  window_end:=least(now(), g.ends_at);
  return query
  select e.user_id, r.ready, coalesce(l.n,0), coalesce(f.n,0),
         case when r.ready then 1+coalesce(l.n,0)+coalesce(f.n,0) else 0 end
  from public.giveaway_entries e
  cross join lateral (select public.giveaway_user_ready(e.user_id) as ready) r
  left join lateral (
    select count(*)::int as n from public.listings li
    where li.seller_id=e.user_id and li.status in ('active','pending','sold') and li.id<>g.listing_id
      and li.created_at>=g.starts_at and li.created_at<=window_end - interval '7 days') l on true
  left join lateral (
    select count(*)::int as n from public.profiles pr
    where pr.referred_by=e.user_id and pr.id<>e.user_id and pr.referred_at>=g.starts_at and pr.referred_at<=window_end
      and public.giveaway_user_ready(pr.id)) f on true
  where e.giveaway_id=p_giveaway and (p_user is null or e.user_id=p_user);
end;$$;
revoke all on function public.giveaway_ticket_rows(uuid,uuid) from public, anon, authenticated;
grant execute on function public.giveaway_ticket_rows(uuid,uuid) to service_role;

-- What the pinned card shows ---------------------------------------------------------------------------------------------------------------------------------------
create function public.current_giveaway() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare g public.giveaways; me uuid:=auth.uid(); entrants integer; pending integer; total integer; mailin integer; item_title text;
  my_entered boolean:=false; my_ready boolean:=false; my_listings integer:=0; my_referrals integer:=0; my_tickets integer:=0;
begin
  select * into g from public.giveaways where status='active' limit 1;
  if not found then return null; end if;
  select count(*) filter (where t.ready), count(*) filter (where not t.ready), coalesce(sum(t.tickets),0)::int
    into entrants, pending, total from public.giveaway_ticket_rows(g.id) t;
  select count(*)::int into mailin from public.giveaway_mailin_entries where giveaway_id=g.id;
  select title into item_title from public.listings where id=g.listing_id;
  if me is not null then
    select true, t.ready, t.listings, t.referrals, t.tickets into my_entered, my_ready, my_listings, my_referrals, my_tickets
      from public.giveaway_ticket_rows(g.id, me) t;
    if not found then my_entered:=false; my_ready:=false; my_listings:=0; my_referrals:=0; my_tickets:=0; end if;
  end if;
  return jsonb_build_object('id',g.id,'listing_id',g.listing_id,'title',item_title,'starts_at',g.starts_at,'ends_at',g.ends_at,'rules_url',g.rules_url,
    'excluded_states',to_jsonb(g.excluded_states),'entrants',entrants+mailin,'pending_entrants',pending,'mailin_entrants',mailin,'tickets',total+mailin,
    'me',case when me is null then null else jsonb_build_object('entered',my_entered,'ready',my_ready,
      'signup',case when my_ready then 1 else 0 end,'listings',my_listings,'referrals',my_referrals,'tickets',my_tickets) end);
end;$$;
revoke all on function public.current_giveaway() from public;
grant execute on function public.current_giveaway() to anon, authenticated;

-- Entering ------------------------------------------------------------------------------------------------------------------------------------------------------------
create function public.enter_giveaway(p_state text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); g public.giveaways; clean text:=upper(btrim(coalesce(p_state,'')));
begin
  if actor is null then raise exception 'Sign in to enter.'; end if;
  select * into g from public.giveaways where status='active' and ends_at>now() limit 1;
  if not found then raise exception 'There is no giveaway open right now.'; end if;
  if clean='' then raise exception 'Choose the state where you live.'; end if;
  if not public.giveaway_state_ok(clean, g.excluded_states) then raise exception 'This giveaway is not open to residents of that state.'; end if;
  if not public.giveaway_user_ok(actor) then raise exception 'This account cannot enter the giveaway.'; end if;
  insert into public.giveaway_entries(giveaway_id,user_id,state) values(g.id,actor,clean) on conflict do nothing;
  return public.current_giveaway();
end;$$;
revoke all on function public.enter_giveaway(text) from public, anon;
grant execute on function public.enter_giveaway(text) to authenticated;

-- Referrals -------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Called by the app after a brand-new member signs in having arrived through someone's storefront or referral link. First touch wins and it can be set once.
create function public.claim_referral(p_slug text default null, p_code text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); me public.profiles; referrer uuid; clean text:=lower(btrim(coalesce(nullif(p_slug,''),nullif(p_code,''),'')));
begin
  if actor is null or clean='' or length(clean)>60 then return false; end if;
  select * into me from public.profiles where id=actor;
  if not found or me.referred_by is not null or me.created_at < now() - interval '3 days' then return false; end if;
  select p.id into referrer from public.profiles p
    where (lower(p.slug)=clean or p.referral_code=clean) and p.id<>actor and p.banned_at is null and p.deleted_at is null limit 1;
  if referrer is null then return false; end if;
  update public.profiles set referred_by=referrer, referred_at=now() where id=actor and referred_by is null;
  return found;
end;$$;
revoke all on function public.claim_referral(text,text) from public, anon;
grant execute on function public.claim_referral(text,text) to authenticated;

create function public.my_referral_info() returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); me public.profiles; code text; tries integer:=0;
begin
  if actor is null then raise exception 'Sign in first.'; end if;
  select * into me from public.profiles where id=actor;
  if not found then raise exception 'Profile not found.'; end if;
  code:=me.referral_code;
  while code is null and tries<8 loop
    tries:=tries+1;
    begin
      code:=substr(md5(random()::text||clock_timestamp()::text||actor::text),1,8);
      update public.profiles set referral_code=code where id=actor and referral_code is null;
    exception when unique_violation then code:=null;
    end;
  end loop;
  select referral_code into code from public.profiles where id=actor;
  return jsonb_build_object('code',code,'slug',me.slug,
    'signed_up',(select count(*) from public.profiles r where r.referred_by=actor),
    'verified',(select count(*) from public.profiles r where r.referred_by=actor and public.giveaway_user_ready(r.id)));
end;$$;
revoke all on function public.my_referral_info() from public, anon;
grant execute on function public.my_referral_info() to authenticated;

-- Admin: the switch -------------------------------------------------------------------------------------------------------------------------------------------------------
create function public.admin_start_giveaway(p_listing_id uuid, p_ends_at timestamptz default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare item public.listings; new_id uuid;
begin
  if not public.is_operator() then raise exception 'Only an operator can run a giveaway.'; end if;
  select * into item from public.listings where id=p_listing_id;
  if not found or not public.listing_is_king_collection(p_listing_id) then raise exception 'Choose an item from the King''s Collection.'; end if;
  if item.status<>'active' or item.listing_type<>'fixed' then raise exception 'Only an active fixed-price item can become a giveaway.'; end if;
  if item.price_cents>=500000 then raise exception 'A prize worth $5,000 or more needs state registration and a bond, which this giveaway does not support. Choose a prize under $5,000.'; end if;
  if exists(select 1 from public.checkout_sessions where listing_id=p_listing_id and status='pending')
     or exists(select 1 from public.availability_requests where listing_id=p_listing_id and status in ('pending','confirmed')) then
    raise exception 'This item has a purchase in progress. Finish or cancel that first.';
  end if;
  if p_ends_at is not null and p_ends_at<=now() + interval '1 day' then raise exception 'The end date must be at least a day away.'; end if;
  begin
    insert into public.giveaways(listing_id,ends_at,created_by) values(p_listing_id,coalesce(p_ends_at,now()+interval '6 months'),auth.uid()) returning id into new_id;
  exception when unique_violation then raise exception 'A giveaway is already running. Switch it off first.';
  end;
  return new_id;
end;$$;
revoke all on function public.admin_start_giveaway(uuid,timestamptz) from public, anon;
grant execute on function public.admin_start_giveaway(uuid,timestamptz) to authenticated;

create function public.admin_cancel_giveaway(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Only an operator can run a giveaway.'; end if;
  update public.giveaways set status='cancelled' where id=p_id and status='active';
  if not found then raise exception 'That giveaway is not running.'; end if;
end;$$;
revoke all on function public.admin_cancel_giveaway(uuid) from public, anon;
grant execute on function public.admin_cancel_giveaway(uuid) to authenticated;

-- A free entry that arrived by email. The operator types it in; it counts as one ticket and the person needs no account.
create function public.admin_add_mailin_entry(p_name text, p_email text, p_state text) returns void
language plpgsql security definer set search_path='' as $$
declare g public.giveaways;
begin
  if not public.is_operator() then raise exception 'Only an operator can run a giveaway.'; end if;
  select * into g from public.giveaways where status='active' and ends_at>now() limit 1;
  if not found then raise exception 'There is no giveaway open right now.'; end if;
  if not public.giveaway_state_ok(p_state, g.excluded_states) then raise exception 'This giveaway is not open to residents of that state.'; end if;
  insert into public.giveaway_mailin_entries(giveaway_id,name,email,state) values(g.id,btrim(p_name),btrim(p_email),upper(btrim(p_state)));
exception when unique_violation then raise exception 'That email address already has an entry.';
end;$$;
revoke all on function public.admin_add_mailin_entry(text,text,text) from public, anon;
grant execute on function public.admin_add_mailin_entry(text,text,text) to authenticated;

create function public.admin_giveaway_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_operator() then raise exception 'Only an operator can run a giveaway.'; end if;
  return jsonb_build_object(
    'current',public.current_giveaway(),
    'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'price_cents',l.price_cents,'category',l.category) order by l.created_at desc)
      from public.listings l where l.status='active' and l.listing_type='fixed' and l.price_cents<500000 and public.listing_is_king_collection(l.id)
        and not exists(select 1 from public.giveaways g where g.listing_id=l.id and g.status in ('active','drawn'))),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(h order by h->>'created_at' desc) from (
      select jsonb_build_object('id',g.id,'title',l.title,'status',g.status,'starts_at',g.starts_at,'ends_at',g.ends_at,'drawn_at',g.drawn_at,'created_at',g.created_at,
        'winners',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'place',w.place,'status',w.status,'kind',case when w.mailin_id is null then 'member' else 'mail-in' end,
            'name',coalesce(p.display_name,m.name),'email',m.email,'claim_deadline',w.claim_deadline,'shipping_address',w.shipping_address) order by w.place)
          from public.giveaway_winners w left join public.profiles p on p.id=w.user_id left join public.giveaway_mailin_entries m on m.id=w.mailin_id
          where w.giveaway_id=g.id),'[]'::jsonb)) as h
      from public.giveaways g join public.listings l on l.id=g.listing_id order by g.created_at desc limit 10) q),'[]'::jsonb));
end;$$;
revoke all on function public.admin_giveaway_overview() from public, anon;
grant execute on function public.admin_giveaway_overview() to authenticated;

-- The draw -------------------------------------------------------------------------------------------------------------------------------------------------------------------
-- Weighted random pick over members (tickets each) and mail-in entries (1 each): a member with 5 tickets is five times as likely as a mail-in entry. Only tickets that are
-- valid at the moment of the draw count. Returns {kind: member|mailin, id} or null. p_exclude (a member id or a mail-in id) is skipped, used to pick the alternate.
create function public.giveaway_pick(p_giveaway uuid, p_exclude uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare total integer; pick integer; running integer:=0; cand record;
begin
  select coalesce(sum(q.n),0)::int into total from (
    select t.tickets as n from public.giveaway_ticket_rows(p_giveaway) t where t.tickets>0 and t.user_id is distinct from p_exclude
    union all select 1 from public.giveaway_mailin_entries m where m.giveaway_id=p_giveaway and m.id is distinct from p_exclude) q;
  if total=0 then return null; end if;
  pick:=1+floor(random()*total)::int;
  for cand in
    select 'member'::text as kind, t.user_id as id, t.tickets as n from public.giveaway_ticket_rows(p_giveaway) t where t.tickets>0 and t.user_id is distinct from p_exclude
    union all select 'mailin'::text, m.id, 1 from public.giveaway_mailin_entries m where m.giveaway_id=p_giveaway and m.id is distinct from p_exclude
    order by 1, 2 loop
    running:=running+cand.n;
    if running>=pick then return jsonb_build_object('kind',cand.kind,'id',cand.id); end if;
  end loop;
  return null;
end;$$;
revoke all on function public.giveaway_pick(uuid,uuid) from public, anon, authenticated;

create function public.giveaway_add_winner(p_giveaway uuid, p_place integer, p_pick jsonb, p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into public.giveaway_winners(giveaway_id,user_id,mailin_id,place,status,notified_at,claim_deadline)
  values(p_giveaway, case when p_pick->>'kind'='member' then (p_pick->>'id')::uuid end, case when p_pick->>'kind'='mailin' then (p_pick->>'id')::uuid end, p_place, p_status,
    case when p_status='notified' then now() end, case when p_status='notified' then now()+interval '14 days' end);
end;$$;
revoke all on function public.giveaway_add_winner(uuid,integer,jsonb,text) from public, anon, authenticated;

-- Tell the winner: a member gets the "Giveaway Won" email event; a mail-in winner is passed to the operator, who writes to them.
create function public.giveaway_notify_winner(p_title text, p_user uuid, p_mailin uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.giveaway_mailin_entries;
begin
  if p_user is not null then
    perform public.notify_klaviyo_user(p_user,'Giveaway Won',jsonb_build_object('title',p_title,'claim_deadline',now()+interval '14 days',
      'claim_deadline_display',to_char((now()+interval '14 days') at time zone 'America/Los_Angeles','FMMonth FMDD, YYYY'),'action_url','https://credabilia.com/'));
  else
    select * into m from public.giveaway_mailin_entries where id=p_mailin;
    perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: Giveaway Drawn',jsonb_build_object('title',p_title,'winner',m.name||' (mail-in entry, write to '||m.email||' within 14 days)'));
  end if;
end;$$;
revoke all on function public.giveaway_notify_winner(text,uuid,uuid) from public, anon, authenticated;

create function public.draw_giveaway(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.giveaways; first jsonb; second jsonb; item_title text;
begin
  select * into g from public.giveaways where id=p_id for update;
  if not found or g.status<>'active' then return jsonb_build_object('drawn',false); end if;
  select title into item_title from public.listings where id=g.listing_id;
  first:=public.giveaway_pick(p_id);
  update public.giveaways set status='drawn', drawn_at=now() where id=p_id;
  if first is null then
    perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: Giveaway Drawn',jsonb_build_object('title',item_title,'winner','nobody had a valid entry'));
    return jsonb_build_object('drawn',true,'winner',null);
  end if;
  second:=public.giveaway_pick(p_id,(first->>'id')::uuid);
  perform public.giveaway_add_winner(p_id,1,first,'notified');
  if second is not null then perform public.giveaway_add_winner(p_id,2,second,'pending'); end if;
  perform public.giveaway_notify_winner(item_title, case when first->>'kind'='member' then (first->>'id')::uuid end, case when first->>'kind'='mailin' then (first->>'id')::uuid end);
  if first->>'kind'='member' then
    perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: Giveaway Drawn',jsonb_build_object('title',item_title,'winner',(select display_name from public.profiles where id=(first->>'id')::uuid)));
  end if;
  return jsonb_build_object('drawn',true,'winner',first,'alternate',second);
end;$$;
revoke all on function public.draw_giveaway(uuid) from public, anon, authenticated;
grant execute on function public.draw_giveaway(uuid) to service_role;

-- Winner: claim the prize --------------------------------------------------------------------------------------------------------------------------------------------------
create function public.my_giveaway_win() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('giveaway_id',w.giveaway_id,'place',w.place,'status',w.status,'claim_deadline',w.claim_deadline,'title',l.title,'listing_id',l.id)
  from public.giveaway_winners w join public.giveaways g on g.id=w.giveaway_id join public.listings l on l.id=g.listing_id
  where w.user_id=auth.uid() and w.status in ('notified','claimed') order by w.notified_at desc nulls last limit 1;
$$;
revoke all on function public.my_giveaway_win() from public, anon;
grant execute on function public.my_giveaway_win() to authenticated;

create function public.claim_giveaway_prize(p_address jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); w public.giveaway_winners; field text; item_title text; excluded text[];
begin
  if actor is null then raise exception 'Sign in first.'; end if;
  if jsonb_typeof(p_address) is distinct from 'object' then raise exception 'Enter your delivery address.'; end if;
  foreach field in array array['name','street1','city','state','zip'] loop
    if coalesce(length(btrim(p_address->>field)),0)=0 or length(p_address->>field)>120 then raise exception 'Enter your delivery address.'; end if;
  end loop;
  select * into w from public.giveaway_winners where user_id=actor and status='notified' and claim_deadline>now() order by place limit 1 for update;
  if not found then raise exception 'There is no prize waiting for you.'; end if;
  select g.excluded_states, l.title into excluded, item_title from public.giveaways g join public.listings l on l.id=g.listing_id where g.id=w.giveaway_id;
  if not public.giveaway_state_ok(p_address->>'state', excluded) then raise exception 'The prize can only be delivered to an address in an eligible state.'; end if;
  if not public.giveaway_user_ready(actor) then raise exception 'Finish payout setup with Stripe to claim your prize.'; end if;
  update public.giveaway_winners set status='claimed', claimed_at=now(),
    shipping_address=jsonb_build_object('name',p_address->>'name','street1',p_address->>'street1','street2',p_address->>'street2','city',p_address->>'city','state',upper(btrim(p_address->>'state')),'zip',p_address->>'zip','country','US')
    where id=w.id;
  perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: Giveaway Prize Claimed',jsonb_build_object('title',item_title,'winner',(select display_name from public.profiles where id=actor)));
end;$$;
revoke all on function public.claim_giveaway_prize(jsonb) from public, anon;
grant execute on function public.claim_giveaway_prize(jsonb) to authenticated;

-- A mail-in winner has no account, so the operator records the delivery address they sent by email.
create function public.admin_record_mailin_claim(p_winner_id uuid, p_address jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare w public.giveaway_winners; field text; excluded text[];
begin
  if not public.is_operator() then raise exception 'Only an operator can run a giveaway.'; end if;
  if jsonb_typeof(p_address) is distinct from 'object' then raise exception 'Enter the delivery address.'; end if;
  foreach field in array array['name','street1','city','state','zip'] loop
    if coalesce(length(btrim(p_address->>field)),0)=0 or length(p_address->>field)>120 then raise exception 'Enter the delivery address.'; end if;
  end loop;
  select * into w from public.giveaway_winners where id=p_winner_id and mailin_id is not null and status='notified' and claim_deadline>now() for update;
  if not found then raise exception 'There is no mail-in prize waiting for that winner.'; end if;
  select g.excluded_states into excluded from public.giveaways g where g.id=w.giveaway_id;
  if not public.giveaway_state_ok(p_address->>'state', excluded) then raise exception 'The prize can only be delivered to an address in an eligible state.'; end if;
  update public.giveaway_winners set status='claimed', claimed_at=now(),
    shipping_address=jsonb_build_object('name',p_address->>'name','street1',p_address->>'street1','street2',p_address->>'street2','city',p_address->>'city','state',upper(btrim(p_address->>'state')),'zip',p_address->>'zip','country','US')
    where id=w.id;
end;$$;
revoke all on function public.admin_record_mailin_claim(uuid,jsonb) from public, anon;
grant execute on function public.admin_record_mailin_claim(uuid,jsonb) to authenticated;

-- Housekeeping, run on a schedule (202610140143): start due draws, pass an unclaimed prize to the alternate. ---------------------------------------------------------------
create function public.run_giveaway_maintenance() returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.giveaways; w public.giveaway_winners; alt public.giveaway_winners; drawn integer:=0; passed integer:=0; item_title text;
begin
  for g in select * from public.giveaways where status='active' and ends_at<=now() loop
    perform public.draw_giveaway(g.id); drawn:=drawn+1;
  end loop;
  for w in select * from public.giveaway_winners where status='notified' and claim_deadline<now() order by place for update loop
    update public.giveaway_winners set status='forfeited' where id=w.id;
    select l.title into item_title from public.giveaways gg join public.listings l on l.id=gg.listing_id where gg.id=w.giveaway_id;
    select * into alt from public.giveaway_winners where giveaway_id=w.giveaway_id and place=2 and status='pending' for update;
    if w.place=1 and found and (alt.mailin_id is not null or public.giveaway_user_ready(alt.user_id)) then
      update public.giveaway_winners set status='notified', notified_at=now(), claim_deadline=now()+interval '14 days' where id=alt.id;
      perform public.giveaway_notify_winner(item_title, alt.user_id, alt.mailin_id);
      passed:=passed+1;
    else
      if w.place=1 and found then update public.giveaway_winners set status='forfeited' where id=alt.id; end if;
      perform public.notify_klaviyo('kingcredion@credabilia.com','Admin Alert: Giveaway Drawn',jsonb_build_object('title',item_title,'winner','nobody claimed the prize'));
    end if;
  end loop;
  return jsonb_build_object('drawn',drawn,'passed_to_alternate',passed);
end;$$;
revoke all on function public.run_giveaway_maintenance() from public, anon, authenticated;
grant execute on function public.run_giveaway_maintenance() to service_role;

commit;

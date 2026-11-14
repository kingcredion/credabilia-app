create schema if not exists kingdom_editorial;
revoke all on schema kingdom_editorial from public, anon, authenticated;
create table kingdom_editorial.draft_requests (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  token_sha256 text not null unique,
  expires_at timestamptz not null,
  packet jsonb,
  received_at timestamptz
);
revoke all on kingdom_editorial.draft_requests from public, anon, authenticated;
alter table kingdom_editorial.draft_requests enable row level security;

-- An issued token can fill exactly one private draft. A retry of the identical
-- delivery succeeds without overwriting editorial work or creating a duplicate.
create function public.kingdom_receive_draft(p_token text, p_packet jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  target kingdom_editorial.draft_requests%rowtype;
  section jsonb;
begin
  if p_token is null or length(p_token) <> 64 then return false; end if;
  select * into target from kingdom_editorial.draft_requests
    where token_sha256 = encode(sha256(convert_to(p_token,'UTF8')),'hex')
      and expires_at > now() for update;
  if not found then return false; end if;
  if target.packet is not null then return target.packet = p_packet; end if;
  if p_packet is null or jsonb_typeof(p_packet) <> 'object'
     or octet_length(p_packet::text) > 48000
     or jsonb_typeof(p_packet->'title') is distinct from 'string'
     or length(trim(p_packet->>'title')) not between 3 and 300
     or jsonb_typeof(p_packet->'sections') is distinct from 'array'
  then return false; end if;
  if jsonb_array_length(p_packet->'sections') not between 1 and 12 then return false; end if;
  for section in select value from jsonb_array_elements(p_packet->'sections') loop
    if jsonb_typeof(section->'text') is distinct from 'string'
       or length(trim(section->>'text')) not between 30 and 6000
       or jsonb_typeof(section->'source') is distinct from 'string'
       or section->>'source' !~ '^https://[A-Za-z0-9.-]+/[^[:space:]]*$'
    then return false; end if;
  end loop;
  update kingdom_editorial.draft_requests set packet=p_packet, received_at=now() where id=target.id;
  return true;
end;
$$;
revoke all on function public.kingdom_receive_draft(text,jsonb) from public, anon, authenticated;
grant execute on function public.kingdom_receive_draft(text,jsonb) to service_role;

create function public.kingdom_open_draft(p_topic text, p_digest text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if p_topic is null or length(trim(p_topic)) not between 5 and 300
     or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid draft request';
  end if;
  insert into kingdom_editorial.draft_requests(topic, token_sha256, expires_at)
  values(trim(p_topic), p_digest, now() + interval '1 day') returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.kingdom_open_draft(text,text) from public, anon, authenticated;
grant execute on function public.kingdom_open_draft(text,text) to service_role;

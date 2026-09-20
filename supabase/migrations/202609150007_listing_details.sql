begin;
alter table public.listings add column attributes jsonb not null default '{}', add column tags jsonb not null default '[]';
-- Until detail editing ships, do not leave stored category-specific facts under a different category.
create function public.protect_listing_detail_category() returns trigger language plpgsql set search_path='' as $$
begin
  if new.category<>old.category and old.attributes<>'{}'::jsonb then
    raise exception 'Category changes for items with structured details are not available yet';
  end if;
  return new;
end;
$$;
create trigger protect_listing_detail_category before update on public.listings for each row execute function public.protect_listing_detail_category();

create function public.create_listing_with_details(p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text default '',p_issuer text default null,p_number text default null,p_company text default null,p_media jsonb default '[]',p_attributes jsonb default '{}',p_tags jsonb default '[]')
returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; field record; tag jsonb; clean_attributes jsonb:='{}'; clean_tags jsonb:='[]'; clean text;
  allowed text[]:=array['item_type','subject','year','condition','grading_company','grade'];
begin
  if p_category='Sports' then allowed:=allowed||array['sport','team'];
  elsif p_category='Art' then allowed:=allowed||array['artist','medium','dimensions'];
  elsif p_category='Comics' then allowed:=allowed||array['publisher','issue']; end if;
  if p_attributes is null or jsonb_typeof(p_attributes)<>'object' then raise exception 'Invalid item details'; end if;
  for field in select * from jsonb_each(p_attributes) loop
    if not(field.key=any(allowed)) or jsonb_typeof(field.value)<>'string' then raise exception 'Unsupported item detail'; end if;
    clean:=btrim(field.value#>>'{}');
    if length(clean)>120 then raise exception 'Item detail too long'; end if;
    if clean<>'' then clean_attributes:=clean_attributes||jsonb_build_object(field.key,clean); end if;
  end loop;
  if p_tags is null or jsonb_typeof(p_tags)<>'array' then raise exception 'Invalid tags'; end if;
  for tag in select * from jsonb_array_elements(p_tags) loop
    if jsonb_typeof(tag)<>'string' then raise exception 'Invalid tag'; end if;
    clean:=lower(regexp_replace(btrim(tag#>>'{}'),'\s+',' ','g'));
    if length(clean)>40 then raise exception 'Tag too long'; end if;
    if clean<>'' and not(clean_tags ? clean) then clean_tags:=clean_tags||jsonb_build_array(clean); end if;
  end loop;
  if jsonb_array_length(clean_tags)>8 then raise exception 'Too many tags'; end if;
  new_id:=public.create_listing_with_media(p_title,p_description,p_category,p_price_cents,p_evidence,p_issuer,p_number,p_company,p_media);
  update public.listings set attributes=clean_attributes,tags=clean_tags where id=new_id;
  return new_id;
end;
$$;
revoke all on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_listing_with_details(text,text,text,bigint,text,text,text,text,jsonb,jsonb,jsonb) to authenticated;

alter function public.browse_listings_with_certificates() rename to browse_listings_with_media;
create function public.browse_listings_with_certificates() returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item || jsonb_build_object('attributes',l.attributes,'tags',l.tags) order by position),'[]'::jsonb)
from jsonb_array_elements(public.browse_listings_with_media()) with ordinality as items(item,position)
join public.listings l on l.id=(item->>'id')::uuid;
$$;
revoke all on function public.browse_listings_with_certificates() from public;
grant execute on function public.browse_listings_with_certificates() to anon,authenticated;
commit;

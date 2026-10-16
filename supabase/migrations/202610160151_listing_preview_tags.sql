begin;

-- The AI-written tags (team, player, product type) were only used by in-app search. The crawler page now shows them as plain "Related terms" text, so the listing preview carries them.
do $patch$
declare def text; patched text;
begin
  select pg_get_functiondef('public.get_listing_preview(uuid)'::regprocedure) into def;
  patched:=replace(def,'''attributes'',coalesce(l.attributes,''{}''::jsonb),','''attributes'',coalesce(l.attributes,''{}''::jsonb),''tags'',coalesce(l.tags,''[]''::jsonb),');
  if patched=def then raise exception 'get_listing_preview did not contain the expected attributes line'; end if;
  execute patched;
end;
$patch$;

commit;

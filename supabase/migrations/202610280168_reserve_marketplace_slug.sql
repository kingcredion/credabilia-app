-- /marketplace is an address people (and bots) naturally try. It now goes to the home page (vercel.json), so no seller may claim "marketplace" as a store name: a store at that
-- address would look like Credabilia's own. The reserved list is patched in place, the same way as the Founding 100 and podcast migrations, so every other reserved name stays
-- exactly as it is. It stops with an error if the list is not where it is expected.
begin;

do $patch$
declare r record; def text; patched integer:=0;
begin
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='update_store_slug' loop
    def:=pg_get_functiondef(r.oid);
    if position('''podcast''' in def)=0 then raise exception 'update_store_slug: the reserved list was not found'; end if;
    if position('''marketplace''' in def)>0 then raise exception 'update_store_slug: marketplace is already reserved'; end if;
    def:=replace(def,'''podcast''','''podcast'',''marketplace''');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'update_store_slug was not found'; end if;
end;$patch$;

commit;

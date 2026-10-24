-- /podcast is the podcast page, so no seller may claim it as a store name. The reserved list is patched in place (the same way the Founding 100 migration added
-- "founding"), so every other reserved name stays exactly as it is. It stops with an error if the list is not where it is expected.
begin;

do $patch$
declare r record; def text; patched integer:=0;
begin
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='update_store_slug' loop
    def:=pg_get_functiondef(r.oid);
    if position('''giveaway-rules''' in def)=0 then raise exception 'update_store_slug: the reserved list was not found'; end if;
    if position('''podcast''' in def)>0 then raise exception 'update_store_slug: podcast is already reserved'; end if;
    def:=replace(def,'''giveaway-rules''','''giveaway-rules'',''podcast''');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'update_store_slug was not found'; end if;
end;$patch$;

commit;

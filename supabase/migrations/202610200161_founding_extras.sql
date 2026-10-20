-- Founding 100 extras. Three small additions that only expose facts the program already holds:
--  * the marketplace feed and a storefront say whether the seller is a Founding seller (a public yes/no, so buyers can see the chip),
--  * a seller's own sales list carries the waived selling fee and the separate payment-processing amount.
-- Each is a text patch of the live function that raises if the expected line is not found, the same way 202610200159 does it.
begin;

do $patch$
declare r record; def text; patched integer;
begin
  -- Marketplace feed (cards and item pages).
  patched:=0;
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='browse_listings_with_certificates' loop
    def:=pg_get_functiondef(r.oid);
    if position('''king_collection'',exists(' in def)=0 then raise exception 'browse_listings_with_certificates: the king_collection line was not found'; end if;
    def:=replace(def,'''king_collection'',exists(','''seller_founding'',public.founding_exempt(l.seller_id),'||chr(10)||'  ''king_collection'',exists(');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'browse_listings_with_certificates was not found'; end if;

  -- Seller storefront.
  patched:=0;
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='get_storefront' loop
    def:=pg_get_functiondef(r.oid);
    if position('''display_name'',p.display_name,''slug'',p.slug,' in def)=0 then raise exception 'get_storefront: the name line was not found'; end if;
    def:=replace(def,'''display_name'',p.display_name,''slug'',p.slug,','''display_name'',p.display_name,''founding'',public.founding_exempt(p.id),''slug'',p.slug,');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'get_storefront was not found'; end if;

  -- The seller's own sales: what was waived and what is withheld for payment processing, as separate figures.
  patched:=0;
  for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname='my_sales' loop
    def:=pg_get_functiondef(r.oid);
    if position('''created_at'',p.created_at,''shipping_address'',p.shipping_address,' in def)=0 then raise exception 'my_sales: the created_at line was not found'; end if;
    def:=replace(def,'''created_at'',p.created_at,''shipping_address'',p.shipping_address,',
      '''created_at'',p.created_at,''selling_fee_waived'',p.selling_fee_waived,''waived_selling_fee_cents'',p.waived_selling_fee_cents,'||chr(10)||
      '    ''processing_fee_cents'',case when p.selling_fee_waived then p.platform_fee_cents else null end,''shipping_address'',p.shipping_address,');
    execute def; patched:=patched+1;
  end loop;
  if patched=0 then raise exception 'my_sales was not found'; end if;
end;$patch$;

commit;

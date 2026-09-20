begin;
create function public.edit_listing(p_id uuid,p_title text,p_description text,p_category text,p_price_cents bigint,p_evidence text,p_expected jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item public.listings; permitted boolean;
begin
 select can_sell into permitted from public.account_permissions where user_id=auth.uid() for share;
 if permitted is distinct from true then raise exception 'Selling permission required' using errcode='42501'; end if;
 select * into item from public.listings where id=p_id for update;
 if not found or item.seller_id<>auth.uid() then raise exception 'You can only edit your own listing' using errcode='42501'; end if;
 if item.status<>'active' then raise exception 'Only active listings can be edited'; end if;
 if p_expected is distinct from jsonb_build_object('title',item.title,'description',item.description,'category',item.category,'price_cents',item.price_cents,'evidence',item.evidence) then raise exception 'This listing changed. Reopen it before editing.'; end if;
 if exists(select 1 from public.audits where listing_id=p_id) and (btrim(p_title),btrim(p_description),p_category,btrim(coalesce(p_evidence,''))) is distinct from (item.title,item.description,item.category,item.evidence) then raise exception 'Only price can change after an assessment. Reviewed details are preserved.'; end if;
 update public.listings set title=btrim(p_title),description=btrim(p_description),category=p_category,price_cents=p_price_cents,evidence=btrim(coalesce(p_evidence,'')) where id=p_id;
end;$$;
revoke all on function public.edit_listing(uuid,text,text,text,bigint,text,jsonb) from public,anon;
grant execute on function public.edit_listing(uuid,text,text,text,bigint,text,jsonb) to authenticated;
commit;

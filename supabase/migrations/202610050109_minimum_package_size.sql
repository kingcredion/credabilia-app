begin;

-- A package the carriers will not take cannot be shipped, so nobody could ever buy it: carriers return no rates and checkout refuses the
-- order. This stops such a listing being published in the first place. USPS Ground Advantage (the smallest service) needs a package at least
-- 6 inches long, 3 inches wide and 1/4 inch thick, in any order of the three measurements.
--
-- It only checks when the package size is being set or changed, so listings that already exist are left alone.
create function public.enforce_minimum_package_size() returns trigger
language plpgsql set search_path='' as $$
declare longest numeric; shortest numeric; middle numeric;
begin
  if new.length_in is null or new.width_in is null or new.height_in is null then return new; end if;
  if tg_op='UPDATE' and new.length_in is not distinct from old.length_in and new.width_in is not distinct from old.width_in and new.height_in is not distinct from old.height_in then return new; end if;
  longest:=greatest(new.length_in,new.width_in,new.height_in);
  shortest:=least(new.length_in,new.width_in,new.height_in);
  middle:=new.length_in+new.width_in+new.height_in-longest-shortest;
  if longest<6 or middle<3 or shortest<0.25 then
    raise exception 'That package is smaller than the carriers accept. It needs to be at least 6 x 3 inches and a quarter inch thick. Use a bigger box or add packing.';
  end if;
  return new;
end;$$;

create trigger enforce_minimum_package_size before insert or update on public.listings
  for each row execute function public.enforce_minimum_package_size();

commit;

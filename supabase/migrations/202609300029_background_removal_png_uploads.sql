begin;

-- upload_own_listing_media (202609100004_media.sql) only ever allowed .jpg paths, since every
-- photo used to be re-encoded to JPEG client-side before upload. Background removal is the first
-- feature to upload a .png (a transparent cutout, so it sits cleanly on the item card in both
-- light and dark mode) -- broaden the path check to accept it too.
alter policy upload_own_listing_media on storage.objects
  with check(bucket_id='listing-media' and split_part(name,'/',1)=auth.uid()::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png)$'
    and exists(select 1 from public.account_permissions p where p.user_id=auth.uid() and p.can_sell));

commit;

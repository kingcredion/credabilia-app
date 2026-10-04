import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('signature_reference_images counts and lists only verified references for the named signer, excludes the listing itself, and is service-role only', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create table public.signature_references(id uuid primary key default gen_random_uuid(),subject_name text not null,media_path text not null,source_listing_id uuid not null,
        provenance text not null default 'self_reported',created_at timestamptz not null default now());
      grant usage on schema public to anon,authenticated,service_role;`);
    await db.exec(await readFile(new URL('../supabase/migrations/202610040091_signature_reference_images.sql', import.meta.url), 'utf8'));
    const mine = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
    const add = (subject, path, provenance, listing, minutesAgo) => db.query(
      "insert into public.signature_references(subject_name,media_path,source_listing_id,provenance,created_at) values($1,$2,$3,$4,now()-($5||' minutes')::interval)", [subject, path, listing, provenance, String(minutesAgo)]);
    await add('Michael Jordan', 'a.jpg', 'operator_curated', other, 50);
    await add('  michael jordan ', 'b.jpg', 'operator_curated', other, 40);
    await add('Michael Jordan', 'c.jpg', 'operator_curated', other, 30);
    await add('Michael Jordan', 'd.jpg', 'operator_curated', other, 20);
    await add('Michael Jordan', 'self.jpg', 'operator_curated', mine, 10);
    await add('Michael Jordan', 'candidate.jpg', 'self_reported', other, 5);
    await add('Someone Else', 'e.jpg', 'operator_curated', other, 5);

    await db.exec('set role service_role');
    const full = (await db.query("select public.signature_reference_images('Michael Jordan', null, 3) as r")).rows[0].r;
    assert.equal(full.total, 5, 'counts verified examples only, case/space-insensitive, not self-reported or other signers');
    assert.deepEqual(full.paths, ['self.jpg', 'd.jpg', 'c.jpg'], 'newest three first');

    const excluded = (await db.query("select public.signature_reference_images('Michael Jordan', $1, 3) as r", [mine])).rows[0].r;
    assert.equal(excluded.total, 4);
    assert.deepEqual(excluded.paths, ['d.jpg', 'c.jpg', 'b.jpg']);

    const none = (await db.query("select public.signature_reference_images('Nobody Yet') as r")).rows[0].r;
    assert.deepEqual(none, { total: 0, paths: [] });

    await db.exec('reset role'); await db.exec('set role authenticated');
    await assert.rejects(db.query("select public.signature_reference_images('Michael Jordan')"), /permission denied/);
  } finally { await db.close(); }
});

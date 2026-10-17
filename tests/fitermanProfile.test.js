import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {resolveIssuer} from '../src/certificates.js';
import {credibilityScore} from '../src/credibility.js';

test('Fiterman Sports is rated 55, between Other and Frameworth, with a plain account of who they are and why', () => {
  const issuer = resolveIssuer('Fiterman Sports');
  assert.equal(issuer.rating, 55); assert.ok(issuer.rating > resolveIssuer('other').rating && issuer.rating < resolveIssuer('frameworth').rating);
  assert.equal(credibilityScore({certificate_issuer: 'fiterman', certificate_number: null}).certificate_score, 55, 'a flat rating, no 75% reduction');
  const {profile} = issuer;
  assert.match(profile.summary, /Houston/); assert.match(profile.summary, /more than 20 years/);
  assert.ok(profile.looked.length >= 4 && profile.couldnt.length >= 3);
  const text = JSON.stringify(profile);
  assert.match(text, /WWE/); assert.match(text, /2014/); assert.match(text, /could not confirm/, 'the older Tyson partnership is not presented as current');
  assert.match(text, /mixed/i, 'both sides of the review picture are stated');
  assert.match(text, /company's own statement/, 'the guarantee is marked as the company\'s own words');
  assert.match(profile.why, /55 out of 100/);
  assert.doesNotMatch(text, /arrest|counterfeit|lied|fraud/i, 'no unverified allegation is repeated');
});

test('the database rates Fiterman 55 too', async () => {
  const migrations = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('202610170157_fiterman_rating_55.sql'));
  assert.equal(migrations.length, 1);
  const sql = await readFile(new URL('../supabase/migrations/' + migrations[0], import.meta.url), 'utf8');
  const db = new PGlite();
  await db.exec(sql.replace(/\bbegin;|\bcommit;/g, ''));
  assert.equal((await db.query("select public.certificate_rating('fiterman') as r, public.certificate_rating('frameworth') as f, public.certificate_rating('psa') as p, public.certificate_rating('other') as o")).rows[0].r, 55);
  const row = (await db.query("select public.certificate_rating('frameworth') as f, public.certificate_rating('psa') as p, public.certificate_rating('other') as o")).rows[0];
  assert.deepEqual(row, {f: 65, p: 95, o: 50});
});

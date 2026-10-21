import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {thumbUrl} from '../src/thumbUrl.js';

const ID = '37eace62-7aec-4309-a8aa-fd3772f8fd5e';
const OWNER = '15133514-87d2-4ea0-a531-243ef7d0af00';
const signed = file => `https://abc.supabase.co/storage/v1/object/sign/listing-media/${OWNER}/${file}?token=eyJhbGciOi.signature`;

test('the card thumbnail address changes when the main photo changes, so a replaced photo is never shown from the old cached copy', () => {
  const before = thumbUrl(ID, signed('e25cfa6f-6e4b-4cbd-9f99-982650ef2d77.png'));
  const after = thumbUrl(ID, signed('99ead0e4-255b-48b3-bf53-b76057d6ebc7.jpg'));
  assert.equal(before, 'https://credabilia.com/img/item/' + ID + '?fmt=webp&w=640&v=e25cfa6f');
  assert.equal(after, 'https://credabilia.com/img/item/' + ID + '?fmt=webp&w=640&v=99ead0e4');
  assert.notEqual(before, after);
});

test('the version comes from the photo file name, never from the owner folder or the changing token, so the address is stable between page loads', () => {
  const a = thumbUrl(ID, signed('99ead0e4-255b-48b3-bf53-b76057d6ebc7.jpg'));
  const b = thumbUrl(ID, `https://abc.supabase.co/storage/v1/object/sign/listing-media/${OWNER}/99ead0e4-255b-48b3-bf53-b76057d6ebc7.jpg?token=a-completely-different-token`);
  assert.equal(a, b);
  assert.ok(!a.includes('15133514'), 'the owner folder is not used as the version');
  assert.equal(thumbUrl(ID, signed('99EAD0E4-255B-48B3-BF53-B76057D6EBC7.JPG')), a, 'upper case file names give the same address');
});

test('with no photo link yet, the thumbnail address is the plain one it always was', () => {
  const plain = 'https://credabilia.com/img/item/' + ID + '?fmt=webp&w=640';
  assert.equal(thumbUrl(ID), plain);
  assert.equal(thumbUrl(ID, undefined), plain);
  assert.equal(thumbUrl(ID, null), plain);
  assert.equal(thumbUrl(ID, 'https://example.test/not-a-listing-photo'), plain);
});

test('every card image passes its photo link along, so the version is always applied', async () => {
  const art = await readFile(new URL('../src/ItemArt.jsx', import.meta.url), 'utf8');
  assert.match(art, /import \{ thumbUrl \} from '\.\/thumbUrl\.js';/);
  assert.match(art, /thumbUrl\(thumbId, photo\)/);
  assert.doesNotMatch(art, /thumbUrl\(thumbId\)/, 'no call forgets the photo');
});

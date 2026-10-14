import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Clarity measured a page-jump score of 2.1 on an item page: the main photo had no reserved height, so the thumbnails, evidence box and opinion jumped down when it loaded.
test('the main gallery photo reserves its space before it loads, then takes its real shape', () => {
  const src = readFileSync(new URL('../src/ListingMedia.jsx', import.meta.url), 'utf8');
  assert.ok(src.includes("const [ratio,setRatio]=useState(null)"));
  assert.ok(src.includes("style={{aspectRatio:ratio||'3 / 4'}}"), 'a 3:4 box is held until the photo arrives');
  assert.ok(src.includes('setRatio(`${w} / ${h}`)'), 'once loaded the box matches the photo');
});

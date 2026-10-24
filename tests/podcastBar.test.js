import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PODCAST_BAR_DISMISS_KEY, PODCAST_BAR_SNOOZE_DAYS, PODCAST_BAR_TEXT, dismissPodcastBar, podcastBarDismissedUntil, shouldShowPodcastBar} from '../src/podcastBar.js';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const fakeWindow = (stored = {}) => ({localStorage: {getItem: key => stored[key] ?? null, setItem: (key, value) => { stored[key] = value; }}});
const NOW = 1_800_000_000_000;

test('the bar is for Discover on the website only, and only until it is dismissed', () => {
  assert.equal(shouldShowPodcastBar({workspace: 'collector', native: false, now: NOW}), true);
  for (const workspace of ['seller', 'auditor', 'messages']) assert.equal(shouldShowPodcastBar({workspace, native: false, now: NOW}), false, workspace);
  assert.equal(shouldShowPodcastBar({workspace: 'collector', native: true, now: NOW}), false, 'the phone apps never show it: /podcast is a website page');
  assert.equal(shouldShowPodcastBar({workspace: 'collector', native: false, dismissedUntil: NOW + 1, now: NOW}), false);
  assert.equal(shouldShowPodcastBar({workspace: 'collector', native: false, dismissedUntil: NOW - 1, now: NOW}), true, 'it comes back once the snooze ends');
});

test('dismissing snoozes the bar for two weeks and survives storage being blocked', () => {
  const stored = {}, win = fakeWindow(stored);
  assert.equal(podcastBarDismissedUntil(win), 0);
  dismissPodcastBar(win, NOW);
  assert.equal(Number(stored[PODCAST_BAR_DISMISS_KEY]), NOW + PODCAST_BAR_SNOOZE_DAYS * 86400000);
  assert.equal(podcastBarDismissedUntil(win), NOW + 14 * 86400000);
  const blocked = {localStorage: {getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }}};
  assert.equal(podcastBarDismissedUntil(blocked), 0);
  assert.doesNotThrow(() => dismissPodcastBar(blocked, NOW));
});

test('the bar links to the podcast page with fixed wording, loads no Spotify code, and is wired into the Discover page only', async () => {
  assert.equal(PODCAST_BAR_TEXT, 'Listen to The Memorabilia Kingdom Podcast');
  const bar = await read('src/PodcastBar.jsx');
  assert.match(bar, /<a className="podcast-bar-link" href="\/podcast">/);
  assert.match(bar, /\/brand\/announcement-megaphone-96\.webp/);
  assert.match(bar, /aria-label="Dismiss podcast announcement"/);
  assert.doesNotMatch(bar, /spotify/i, 'the player stays on /podcast and loads only when a visitor asks');
  const app = (await read('src/App.jsx')).replace(/\r\n/g, '\n');
  assert.match(app, /shouldShowPodcastBar\(\{ workspace, native: isNativeApp\(\), dismissedUntil: podcastBarUntil \}\)/);
  assert.match(app, /\{showPodcastBar && <PodcastBar onDismiss=/);
});

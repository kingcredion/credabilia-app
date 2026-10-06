import {test} from 'node:test';
import assert from 'node:assert/strict';
import {haversineMiles, nearMeListings, stationPoint, formatDistance, suggestPlaces, placeLocation, directionsUrl, mapEmbedUrl, validPoint, RADIUS_CHOICES} from '../src/nearMe.js';

const LAS_VEGAS = {lat: 36.1699, lng: -115.1398}, HENDERSON = {lat: 36.0395, lng: -114.9817}, LA = {lat: 34.0522, lng: -118.2437};
const item = (id, station, extra = {}) => ({id, pickup_enabled: true, pickup_station: station && {jurisdiction: 'PD', city: 'X', ...station}, ...extra});

test('distance between known places is right (Las Vegas to Henderson about 14 miles, to Los Angeles about 228)', () => {
  assert.ok(Math.abs(haversineMiles(LAS_VEGAS, HENDERSON) - 14) < 2);
  assert.ok(Math.abs(haversineMiles(LAS_VEGAS, LA) - 228) < 6);
  assert.equal(haversineMiles(LA, LA), 0);
});

test('only pickup listings with a located station count, and only within the radius, nearest first', () => {
  const items = [
    item('far', LA),
    item('henderson', HENDERSON),
    item('vegas', LAS_VEGAS),
    item('unlocated', {lat: null, lng: null}),
    item('nopickup', LAS_VEGAS, {pickup_enabled: false}),
    {id: 'shipped-only'},
  ];
  assert.deepEqual(nearMeListings(items, LAS_VEGAS, 25).map(i => i.id), ['vegas', 'henderson']);
  assert.deepEqual(nearMeListings(items, LAS_VEGAS, 10).map(i => i.id), ['vegas']);
  assert.deepEqual(nearMeListings(items, LAS_VEGAS, 300).map(i => i.id), ['vegas', 'henderson', 'far']);
  assert.ok(nearMeListings(items, LAS_VEGAS, 25)[1].distance_miles > 10, 'each result carries its distance');
  assert.deepEqual(nearMeListings(items, null), [], 'no location, no results');
  assert.deepEqual(nearMeListings(items, {lat: 'x', lng: 1}), []);
  assert.deepEqual(RADIUS_CHOICES, [10, 25, 50, 100]);
});

test('stationPoint and validPoint refuse bad data', () => {
  assert.equal(stationPoint(item('a', {lat: 95, lng: 0})), null);
  assert.equal(stationPoint(item('a', {lat: 36, lng: -115}, {pickup_enabled: false})), null);
  assert.deepEqual(stationPoint(item('a', {lat: 36, lng: -115})), {lat: 36, lng: -115});
  assert.equal(validPoint({lat: 0, lng: 181}), false);
});

test('distances read plainly, with "about" when the position is only the middle of a city', () => {
  assert.equal(formatDistance(12.4, 'station'), '12 mi');
  assert.equal(formatDistance(0.4, 'station'), 'Under 1 mi');
  assert.equal(formatDistance(12.4, 'city'), 'About 12 mi');
  assert.equal(formatDistance(NaN), '');
});

test('typed places: suggestions and the lookup call Google with the key and one session, and fail quietly', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([url, options]);
    if (String(url).endsWith('places:autocomplete')) return {ok: true, json: async () => ({suggestions: [{placePrediction: {placeId: 'p1', text: {text: 'Henderson, NV, USA'}}}, {queryPrediction: {}}]})};
    return {ok: true, json: async () => ({location: {latitude: 36.04, longitude: -114.98}, formattedAddress: 'Henderson, NV'})};
  };
  assert.deepEqual(await suggestPlaces('hend', {apiKey: 'K', sessionToken: 'S', fetchImpl}), [{placeId: 'p1', text: 'Henderson, NV, USA'}]);
  assert.equal(calls[0][1].headers['X-Goog-Api-Key'], 'K');
  assert.equal(JSON.parse(calls[0][1].body).sessionToken, 'S');
  assert.deepEqual(await placeLocation('p1', {apiKey: 'K', sessionToken: 'S', fetchImpl}), {lat: 36.04, lng: -114.98, label: 'Henderson, NV'});
  assert.match(calls[1][0], /sessionToken=S/);
  assert.deepEqual(await suggestPlaces('he', {apiKey: 'K', fetchImpl}), [], 'too short: no request');
  assert.deepEqual(await suggestPlaces('hend', {apiKey: '', fetchImpl}), [], 'no key: no request');
  assert.equal(calls.length, 2);
  assert.deepEqual(await suggestPlaces('hend', {apiKey: 'K', fetchImpl: async () => ({ok: false})}), []);
  assert.equal(await placeLocation('p1', {apiKey: 'K', fetchImpl: async () => ({ok: true, json: async () => ({})})}), null);
});

test('map links search by the station name and never include the key in the directions link', () => {
  const station = {jurisdiction: 'North Las Vegas Police Department', city: 'North Las Vegas', state: 'NV', country: 'USA'};
  assert.match(directionsUrl(station), /destination=North%20Las%20Vegas%20Police%20Department%2C%20North%20Las%20Vegas%2C%20NV%2C%20USA/);
  assert.ok(!directionsUrl(station).includes('key='));
  assert.match(mapEmbedUrl(station, 'K1'), /^https:\/\/www\.google\.com\/maps\/embed\/v1\/place\?key=K1&q=/);
  assert.equal(mapEmbedUrl(station, ''), null, 'no key, no embedded map');
});

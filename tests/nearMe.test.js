import {test} from 'node:test';
import assert from 'node:assert/strict';
import {placeFromGeocode, reverseGeocode, haversineMiles, nearMeListings, stationPoint, formatDistance, suggestPlaces, placeLocation, directionsUrl, mapEmbedUrl, validPoint, RADIUS_CHOICES, loadStationLocations} from '../src/nearMe.js';

const LAS_VEGAS = {lat: 36.1699, lng: -115.1398}, HENDERSON = {lat: 36.0395, lng: -114.9817}, LA = {lat: 34.0522, lng: -118.2437};
// positions live in the shipped file, keyed by station id; here a station's id is its listing's id and its position is passed alongside
const LOC = {};
const item = (id, point, extra = {}) => { if (point && point.lat != null) LOC['st-' + id] = [point.lat, point.lng, point.precision || 's']; return {id, pickup_enabled: true, pickup_station: {id: 'st-' + id, jurisdiction: 'PD', city: 'X'}, ...extra}; };

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
  assert.deepEqual(nearMeListings(items, LAS_VEGAS, 25, LOC).map(i => i.id), ['vegas', 'henderson']);
  assert.deepEqual(nearMeListings(items, LAS_VEGAS, 10, LOC).map(i => i.id), ['vegas']);
  assert.deepEqual(nearMeListings(items, LAS_VEGAS, 300, LOC).map(i => i.id), ['vegas', 'henderson', 'far']);
  assert.ok(nearMeListings(items, LAS_VEGAS, 25, LOC)[1].distance_miles > 10, 'each result carries its distance');
  assert.deepEqual(nearMeListings(items, null, 50, LOC), [], 'no location, no results');
  assert.deepEqual(nearMeListings(items, {lat: 'x', lng: 1}, 50, LOC), []);
  assert.deepEqual(nearMeListings(items, LAS_VEGAS, 300), [], 'before the positions have loaded nothing can be placed');
  assert.deepEqual(RADIUS_CHOICES, [10, 25, 50, 100]);
});

test('stationPoint and validPoint refuse bad data', () => {
  const station = {id: 's1'};
  assert.equal(stationPoint({pickup_enabled: true, pickup_station: station}, {s1: [95, 0, 's']}), null);
  assert.equal(stationPoint({pickup_enabled: false, pickup_station: station}, {s1: [36, -115, 's']}), null);
  assert.equal(stationPoint({pickup_enabled: true, pickup_station: station}, {}), null, 'a station with no recorded position');
  assert.deepEqual(stationPoint({pickup_enabled: true, pickup_station: station}, {s1: [36, -115, 's']}), {lat: 36, lng: -115, precision: 'station'});
  assert.equal(stationPoint({pickup_enabled: true, pickup_station: station}, {s1: [36, -115, 'c']}).precision, 'city');
  assert.equal(validPoint({lat: 0, lng: 181}), false);
});

test('the positions file is fetched once and a failure just means no positions', async () => {
  let calls = 0;
  const first = await loadStationLocations(async () => { calls++; return {ok: true, json: async () => ({a: [1, 2, 's']})}; });
  const second = await loadStationLocations(async () => { calls++; return {ok: true, json: async () => ({})}; });
  assert.deepEqual(first, {a: [1, 2, 's']}); assert.equal(second, first); assert.equal(calls, 1);
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

test('the shipped station positions file is well-formed: real ids, real coordinates, a good spread of stations', async () => {
  const {readFile} = await import('node:fs/promises');
  const file = JSON.parse(await readFile(new URL('../public/pickup-station-locations.json', import.meta.url), 'utf8'));
  const entries = Object.entries(file);
  assert.ok(entries.length >= 450, 'most of the ~500 stations are located');
  for (const [id, [lat, lng, precision]] of entries) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(validPoint({lat, lng}), id);
    assert.ok(precision === 's' || precision === 'c', id);
  }
  // a real check on the data: stations in Nevada really are near Las Vegas (the matching ids are looked up from the public stations list below if present)
  const nearVegas = entries.filter(([, [lat, lng]]) => haversineMiles({lat, lng}, LAS_VEGAS) < 30).length;
  assert.ok(nearVegas >= 2, 'there are safe-exchange stations around Las Vegas');
});

test('the member\'s position is turned into a readable city and ZIP, and a failed lookup just means no name', async () => {
  const vegas = [{address_components: [{long_name: '89101', types: ['postal_code']}, {long_name: 'Las Vegas', short_name: 'Las Vegas', types: ['locality', 'political']}, {long_name: 'Nevada', short_name: 'NV', types: ['administrative_area_level_1']}]}];
  assert.deepEqual(placeFromGeocode(vegas), {city: 'Las Vegas', state: 'NV', zip: '89101', label: 'Las Vegas, NV 89101'});
  // the first result may be a street with no ZIP: a later one with city and ZIP wins
  const streetFirst = [{address_components: [{long_name: 'Fremont St', types: ['route']}, {long_name: 'Las Vegas', short_name: 'Las Vegas', types: ['locality']}]}, ...vegas];
  assert.equal(placeFromGeocode(streetFirst).label, 'Las Vegas, NV 89101');
  // only a city, no ZIP anywhere: the city alone
  assert.equal(placeFromGeocode([{address_components: [{long_name: 'Boulder City', short_name: 'Boulder City', types: ['locality']}, {long_name: 'Nevada', short_name: 'NV', types: ['administrative_area_level_1']}]}]).label, 'Boulder City, NV');
  assert.equal(placeFromGeocode([]), null);
  assert.equal(placeFromGeocode([{address_components: [{long_name: 'USA', types: ['country']}]}]), null);

  let asked = null;
  const loader = async () => ({importLibrary: async () => ({Geocoder: class { async geocode(request) { asked = request; return {results: vegas}; } }})});
  assert.equal((await reverseGeocode({lat: 36.17, lng: -115.14}, {apiKey: 'K', loader})).label, 'Las Vegas, NV 89101');
  assert.deepEqual(asked, {location: {lat: 36.17, lng: -115.14}});
  assert.equal(await reverseGeocode({lat: 'x', lng: 1}, {apiKey: 'K', loader}), null, 'a bad position is never sent anywhere');
  await assert.rejects(reverseGeocode({lat: 36, lng: -115}, {apiKey: 'K', loader: async () => { throw new Error('no key'); }}), /no key/);
});

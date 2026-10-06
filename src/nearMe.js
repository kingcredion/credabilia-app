// "Items near me": local-pickup listings, sorted by how far their safe-exchange station is from the member. All the distance maths happens in the
// browser, so where the member is never has to be sent to or kept by us. Station positions come from a small file shipped with the site
// (public/pickup-station-locations.json: { stationId: [lat, lng, 's' | 'c'] }, 's' = the station itself, 'c' = the middle of its city or county).
// Positions are from OpenStreetMap, not Google (Google's terms do not allow storing its coordinates).

export const RADIUS_CHOICES = [10, 25, 50, 100];
export const DEFAULT_RADIUS = 50;
const EARTH_RADIUS_MILES = 3958.8;

const toRad = degrees => degrees * Math.PI / 180;

// Straight-line ("as the crow flies") miles between two {lat,lng} points.
export function haversineMiles(a, b) {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validPoint(point) {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180;
}

let locationsPromise = null;
export function loadStationLocations(fetchImpl = fetch) {
  if (!locationsPromise) locationsPromise = fetchImpl('/pickup-station-locations.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return locationsPromise;
}

// The pickup station's position for a listing, or null when the listing has no pickup or the station has not been located.
export function stationPoint(item, locations) {
  const station = item?.pickup_enabled ? item.pickup_station : null;
  const entry = station && locations?.[station.id];
  const point = entry && { lat: Number(entry[0]), lng: Number(entry[1]) };
  return point && validPoint(point) ? { ...point, precision: entry[2] === 's' ? 'station' : 'city' } : null;
}

// Listings that offer pickup within `radiusMiles` of `origin`, nearest first, each with its distance. Everything else is left out.
export function nearMeListings(items, origin, radiusMiles = DEFAULT_RADIUS, locations) {
  if (!validPoint(origin)) return [];
  const found = [];
  for (const item of items || []) {
    const point = stationPoint(item, locations);
    if (!point) continue;
    const distance = haversineMiles(origin, point);
    if (distance <= radiusMiles) found.push({ item, distance, precision: point.precision });
  }
  return found.sort((a, b) => a.distance - b.distance).map(({ item, distance, precision }) => ({ ...item, distance_miles: distance, distance_precision: precision }));
}

// A position that is only the middle of a city is not a place to navigate to, so say "about" for those.
export function formatDistance(miles, precision) {
  if (!Number.isFinite(miles)) return '';
  const near = miles < 1;
  if (precision === 'city') return near ? 'About under 1 mi' : `About ${Math.round(miles)} mi`;
  return near ? 'Under 1 mi' : `${Math.round(miles)} mi`;
}

// ---- Google (Places API (New)): turn what a member types into a position. Only used when they would rather type a ZIP or city than share their location.
const PLACES = 'https://places.googleapis.com/v1';
const REGIONS = ['us', 'ca', 'br'];

export async function suggestPlaces(input, { apiKey, sessionToken, fetchImpl = fetch }) {
  const text = String(input || '').trim();
  if (!apiKey || text.length < 3) return [];
  const response = await fetchImpl(`${PLACES}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify({ input: text, sessionToken, includedRegionCodes: REGIONS, includedPrimaryTypes: ['postal_code', 'locality', 'sublocality', 'administrative_area_level_3'] }),
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.suggestions || []).map(s => s.placePrediction).filter(Boolean).slice(0, 5).map(p => ({ placeId: p.placeId, text: p.text?.text || '' }));
}

// The same session token ties the suggestions and this lookup into one billed search session.
export async function placeLocation(placeId, { apiKey, sessionToken, fetchImpl = fetch }) {
  if (!apiKey || !placeId) return null;
  const url = `${PLACES}/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken || '')}`;
  const response = await fetchImpl(url, { headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'location,formattedAddress' } });
  if (!response.ok) return null;
  const data = await response.json();
  const point = { lat: Number(data.location?.latitude), lng: Number(data.location?.longitude) };
  return validPoint(point) ? { ...point, label: data.formattedAddress || '' } : null;
}

// ---- "Where am I?": turn the phone/browser's position into a city and ZIP so the member can see it worked. Uses the Maps JavaScript API's Geocoder (a
// referrer-restricted key cannot call the Geocoding web service directly); the script is only loaded the first time someone taps "Use my location".
let mapsLoading = null;
export function loadMapsApi(apiKey, doc = globalThis.document) {
  if (globalThis.google?.maps?.importLibrary) return Promise.resolve(globalThis.google.maps);
  if (!apiKey || !doc) return Promise.reject(new Error('no key'));
  if (!mapsLoading) {
    mapsLoading = new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly`;
      script.async = true;
      script.onload = () => (globalThis.google?.maps?.importLibrary ? resolve(globalThis.google.maps) : reject(new Error('maps did not load')));
      script.onerror = () => reject(new Error('maps failed to load'));
      doc.head.appendChild(script);
    }).catch(error => { mapsLoading = null; throw error; });
  }
  return mapsLoading;
}

// "Las Vegas, NV 89101" from Geocoder results (the first result that has a ZIP wins; otherwise the first with a city), or null.
export function placeFromGeocode(results) {
  const pick = (list, type) => list?.find(component => component.types?.includes(type));
  let best = null;
  for (const result of results || []) {
    const components = result.address_components || [];
    const city = (pick(components, 'locality') || pick(components, 'postal_town') || pick(components, 'sublocality') || pick(components, 'administrative_area_level_3') || pick(components, 'administrative_area_level_2'))?.long_name;
    const state = pick(components, 'administrative_area_level_1')?.short_name;
    const zip = pick(components, 'postal_code')?.long_name;
    const entry = { city, state, zip };
    if (city && zip) return { ...entry, label: `${city}${state ? ', ' + state : ''} ${zip}` };
    if (!best && (city || zip)) best = { ...entry, label: [city && state ? `${city}, ${state}` : city || state, zip].filter(Boolean).join(' ') };
  }
  return best;
}

export async function reverseGeocode(point, { apiKey, loader = loadMapsApi } = {}) {
  if (!validPoint(point)) return null;
  const maps = await loader(apiKey);
  const { Geocoder } = await maps.importLibrary('geocoding');
  const { results } = await new Geocoder().geocode({ location: { lat: point.lat, lng: point.lng } });
  return placeFromGeocode(results);
}

// ---- The member's saved address (Profile > shipping address) as the starting point, so Near me can already be set when it opens. Only the city, state and
// ZIP are ever looked up, never the street.
export function savedAddressPlace(address) {
  if (!address || typeof address !== 'object') return null;
  const clean = value => String(value ?? '').trim();
  const city = clean(address.city), state = clean(address.state);
  const country = /^[A-Za-z]{2}$/.test(clean(address.country)) ? clean(address.country).toUpperCase() : (clean(address.country) ? undefined : 'US');
  const zipRaw = clean(address.zip || address.postal_code);
  const zip = country === 'US' && /^\d{5}/.test(zipRaw) ? zipRaw.slice(0, 5) : zipRaw;
  if (!zip && !(city && state)) return null;
  const label = [city && state ? `${city}, ${state}` : city || state, zip].filter(Boolean).join(' ');
  return { label, query: zip || `${city}, ${state}`, country };
}

export async function geocodeSavedPlace(place, { apiKey, loader = loadMapsApi } = {}) {
  if (!place?.query) return null;
  const maps = await loader(apiKey);
  const { Geocoder } = await maps.importLibrary('geocoding');
  const request = { address: place.query };
  if (place.country) request.componentRestrictions = { country: place.country };
  const { results } = await new Geocoder().geocode(request);
  const location = results?.[0]?.geometry?.location;
  const read = value => Number(typeof value === 'function' ? value.call(location) : value);
  const point = location && { lat: read(location.lat), lng: read(location.lng) };
  return validPoint(point) ? point : null;
}

// ---- Links for the item page. Searching by the station's name finds the real police station in Google Maps, even when we only know its city.
export const stationQuery = station => [station?.jurisdiction, station?.city, station?.state, station?.country].filter(Boolean).join(', ');
export const directionsUrl = station => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(stationQuery(station))}`;
export function mapEmbedUrl(station, apiKey) {
  if (!apiKey || !station) return null;
  return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(stationQuery(station))}`;
}

export function newSessionToken() {
  const cryptoApi = globalThis.crypto;
  return cryptoApi?.randomUUID ? cryptoApi.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

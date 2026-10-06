import React, { useEffect, useRef, useState } from 'react';
import { Check, MapPin, Navigation, X } from 'lucide-react';
import { RADIUS_CHOICES, DEFAULT_RADIUS, suggestPlaces, placeLocation, reverseGeocode, savedAddressPlace, geocodeSavedPlace, newSessionToken, directionsUrl, mapEmbedUrl } from './nearMe.js';

// Public by design (it ships in the page), protected by Google's own restrictions: only credabilia.com may use it, and only for Places and Maps Embed.
export const MAPS_KEY = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';

// The "Near me" panel on Discover. The member either shares their location (from the browser or phone) or types a ZIP or city; the position stays in
// this page only, it is never sent to or stored by Credabilia.
export function NearMePanel({ nearMe, onChange, onClose, matchCount, savedAddress }) {
  const [typed, setTyped] = useState(''), [suggestions, setSuggestions] = useState([]), [message, setMessage] = useState(''), [locating, setLocating] = useState(false), [lookingUp, setLookingUp] = useState(false);
  const session = useRef(newSessionToken());
  const radius = nearMe?.radius || DEFAULT_RADIUS;

  useEffect(() => {
    if (!MAPS_KEY || typed.trim().length < 3) { setSuggestions([]); return; }
    let live = true;
    const timer = setTimeout(async () => {
      try { const found = await suggestPlaces(typed, { apiKey: MAPS_KEY, sessionToken: session.current }); if (live) setSuggestions(found); } catch { if (live) setSuggestions([]); }
    }, 300);
    return () => { live = false; clearTimeout(timer); };
  }, [typed]);

  // The newest state, for the city lookup that finishes a moment after the position arrives (the member may have changed the distance by then).
  const latest = useRef(nearMe);
  latest.current = nearMe;

  // Start from the address saved in the member's profile: it is shown straight away, and its position is looked up once (kept for this visit only).
  const savedPlace = savedAddressPlace(savedAddress);
  const [profilePending, setProfilePending] = useState(false);
  const triedProfile = useRef(false);
  useEffect(() => {
    if (triedProfile.current || nearMe || !savedPlace) return;
    triedProfile.current = true;
    setProfilePending(true);
    (async () => {
      let point = null;
      const key = 'credabilia-near-me-' + savedPlace.query + '|' + (savedPlace.country || '');
      try { point = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { /* storage unavailable */ }
      if (!point) {
        try { point = await geocodeSavedPlace(savedPlace, { apiKey: MAPS_KEY }); } catch { point = null; }
        if (point) try { sessionStorage.setItem(key, JSON.stringify(point)); } catch { /* storage unavailable */ }
      }
      if (point && !latest.current) onChange({ onlyNear: false, origin: { ...point, label: savedPlace.label, source: 'profile', placed: true }, radius: DEFAULT_RADIUS });
    })().finally(() => setProfilePending(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function useMyLocation() {
    if (!navigator.geolocation) { setMessage('This browser cannot share your location. Type a ZIP or city instead.'); return; }
    setMessage(''); setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocating(false);
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        onChange({ onlyNear: nearMe?.onlyNear, origin: { ...point, label: 'your location', source: 'device' }, radius });
        // Then name the place (city and ZIP) so it is clear it worked. If the lookup is unavailable the panel still says the location was found.
        setLookingUp(true);
        reverseGeocode(point, { apiKey: MAPS_KEY }).then(place => {
          const current = latest.current;
          if (place && current?.origin?.lat === point.lat && current.origin.lng === point.lng) onChange({ ...current, origin: { ...current.origin, label: place.label, placed: true } });
        }).catch(() => {}).finally(() => setLookingUp(false));
      },
      error => { setLocating(false); setMessage(error?.code === 1 ? 'Location is blocked for this site. Allow it in your browser settings, or type a ZIP or city instead.' : 'We could not get your location. Try again, or type a ZIP or city instead.'); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  const fromDevice = nearMe?.origin?.source === 'device';

  async function choose(suggestion) {
    setMessage(''); setSuggestions([]);
    try {
      const place = await placeLocation(suggestion.placeId, { apiKey: MAPS_KEY, sessionToken: session.current });
      session.current = newSessionToken(); // a finished search starts a new billed session
      if (!place) { setMessage('We could not find that place. Try another.'); return; }
      setTyped(suggestion.text); onChange({ onlyNear: nearMe?.onlyNear, origin: { lat: place.lat, lng: place.lng, label: suggestion.text }, radius });
    } catch { setMessage('We could not look that up right now. Try your location instead.'); }
  }

  return <section className="near-me-panel" aria-label="Items near me">
    <div className="near-me-head"><h3><MapPin size={18}/> Items near me</h3><button type="button" className="icon-button" aria-label="Close near me" onClick={onClose}><X size={16}/></button></div>
    <p className="field-note">Shows items you can pick up in person at a police-station safe-exchange spot. Your location stays on your device: we never store it.</p>
    <div className="near-me-controls">
      <button type="button" className={`primary compact${fromDevice ? ' located' : ''}`} onClick={useMyLocation} disabled={locating}>{fromDevice && !locating ? <Check size={15}/> : <Navigation size={15}/>} {locating ? 'Finding you…' : fromDevice ? 'Location found' : 'Use my location'}</button>
      {MAPS_KEY && <div className="near-me-search">
        <input type="text" value={typed} onChange={event => setTyped(event.target.value)} placeholder="or type a ZIP or city" aria-label="Type a ZIP or city" autoComplete="off"/>
        {!!suggestions.length && <ul className="near-me-suggestions" role="listbox">{suggestions.map(s => <li key={s.placeId}><button type="button" role="option" onClick={() => choose(s)}>{s.text}</button></li>)}</ul>}
      </div>}
    </div>
    <div className="categories" role="group" aria-label="How far">
      {RADIUS_CHOICES.map(miles => <button key={miles} type="button" aria-pressed={radius === miles} className={radius === miles ? 'active' : ''} onClick={() => nearMe && onChange({ ...nearMe, radius: miles })} disabled={!nearMe}>{miles} mi</button>)}
    </div>
    {nearMe && <label className="certificate-confirm"><input type="checkbox" checked={!!nearMe.onlyNear} onChange={event => onChange({ ...nearMe, onlyNear: event.target.checked })}/>Only show pickup items near me (hide everything that ships)</label>}
    {message && <p role="alert" className="error">{message}</p>}
    {!nearMe && profilePending && savedPlace && <p role="status" className="near-me-found"><Check size={16}/> <span>Using your saved address: <strong>{savedPlace.label}</strong><span className="field-note"> (finding pickup items near it…)</span></span></p>}
    {nearMe && <p role="status" className="near-me-found"><Check size={16}/> <span>{nearMe.origin.source === 'profile' ? <>Using your saved address: <strong>{nearMe.origin.label}</strong></> : fromDevice ? (nearMe.origin.placed ? <>Your location is set: <strong>{nearMe.origin.label}</strong></> : <>Your location is set{lookingUp ? <span className="field-note"> (finding your city…)</span> : null}</>) : <>Location set: <strong>{nearMe.origin.label}</strong></>}</span> <button type="button" className="text-button" onClick={() => { onChange(null); setTyped(''); }}>Clear</button></p>}
    {nearMe && <p role="status" className="field-note">{matchCount === 0 ? `No pickup items within ${radius} miles yet. Try a bigger distance. Everything else below still ships to you.` : `${matchCount} pickup item${matchCount === 1 ? '' : 's'} within ${radius} miles, nearest first${nearMe.onlyNear ? '.' : ', then everything else, which ships to you.'}`}</p>}
  </section>;
}

// On an item that can be picked up: where the safe-exchange spot is, a map, and a one-tap "Get directions".
export function PickupMeetup({ station }) {
  if (!station) return null;
  const embed = mapEmbedUrl(station, MAPS_KEY);
  return <section className="evidence-box pickup-meetup" aria-label="Local pickup">
    <h3><MapPin size={16}/> Local pickup available</h3>
    <p>Meet at <strong>{station.jurisdiction}</strong>{station.city ? `, ${station.city}` : ''}{station.state ? `, ${station.state}` : ''}</p>
    {station.notes && <p className="field-note">{station.notes}</p>}
    {embed && <iframe title={`Map: ${station.jurisdiction}`} className="pickup-map" src={embed} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen/>}
    <a className="text-button" href={directionsUrl(station)} target="_blank" rel="noopener noreferrer"><Navigation size={15}/> Get directions</a>
    <p className="field-note">Pick-up is arranged in messages after you buy. You can also agree on another public place.</p>
  </section>;
}

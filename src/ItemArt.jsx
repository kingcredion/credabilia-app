import React, { useEffect, useState } from 'react';
import { Layers, Star } from 'lucide-react';

export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

export function RatingStars({ value, count, size = 14 }) {
  if (value == null) return null;
  const rounded = Math.round(value);
  return <span className="rating-stars" aria-label={`${value} out of 5 stars${count != null ? `, ${count} rating${count === 1 ? '' : 's'}` : ''}`}>
    {[1, 2, 3, 4, 5].map(n => <Star key={n} size={size} fill={n <= rounded ? 'currentColor' : 'none'}/>)}
    {count != null && <span className="rating-count">({count})</span>}
  </span>;
}

// A small, cached copy of an active listing's main photo at an address that never expires (api/email-image.js, ?fmt=webp). Cards use it first:
// it loads much faster than the full-size photo and cannot go stale while the app sits in the background.
export const thumbUrl = id => 'https://credabilia.com/img/item/' + id + '?fmt=webp&w=640';

// Photos are served through temporary links. When one stops working the app is told (once every 30 seconds at most) so it can fetch fresh links.
let lastStaleSignal = 0;
function signalStaleMedia() {
  const now = Date.now();
  if (now - lastStaleSignal < 30000 || typeof window === 'undefined') return;
  lastStaleSignal = now;
  window.dispatchEvent(new CustomEvent('credabilia:media-stale'));
}

// Tries the stable thumbnail, then the signed full photo, then gives up quietly (the "no photo" picture) and asks the app for fresh links. A new
// link arriving (photo changes) starts over.
function ListingPhoto({ kind, category, large, photo, thumbId }) {
  const [stage, setStage] = useState(thumbId ? 0 : 1);
  useEffect(() => { setStage(thumbId ? 0 : 1); }, [photo, thumbId]);
  if (stage > 1) return <ItemArt kind={kind} category={category} large={large}/>;
  const onError = () => { if (stage === 0) { setStage(1); return; } setStage(2); signalStaleMedia(); };
  return <img className="listing-cover" loading={large ? 'eager' : 'lazy'} decoding="async" src={stage === 0 ? thumbUrl(thumbId) : photo} onError={onError} alt={`${category} item photo`}/>;
}

export function ItemArt({ kind = 'generic', category, large = false, photo, thumbId }) {
  if(photo || thumbId) return <ListingPhoto kind={kind} category={category} large={large} photo={photo} thumbId={thumbId}/>;
  if (!['baseball', 'comic', 'art'].includes(kind)) return <div className={`item-art no-photo ${large ? 'large' : ''}`} role="img" aria-label={`${category || 'Item'}: no photo yet`}><img src="/brand/no-photo-landscape-v1.webp" alt="" width="960" height="720" loading={large ? 'eager' : 'lazy'} decoding="async"/></div>;
  return <div className={`item-art ${kind} ${large ? 'large' : ''}`} aria-label={`${category} illustration`} role="img">
    {kind === 'baseball' ? <div className="baseball-ball"><span className="seam one"/><span className="seam two"/><i>Heritage</i></div>
      : kind === 'comic' ? <div className="comic-book"><small>ORBIT PRESS · 001</small><strong>ASTRAL<br/>EXPLORER</strong><div className="planet"/><span>INTO THE UNKNOWN</span></div>
      : kind === 'art' ? <div className="art-frame"><div className="art-print"><i/><b/><em/></div></div>
      : <div className="generic-art"><Layers size={60} strokeWidth={1}/><span>{category || 'Collectible'}</span></div>}
    <span className="art-caption">{['baseball', 'comic', 'art'].includes(kind) ? 'STUDY ILLUSTRATION' : 'PHOTO NOT ADDED'}</span>
  </div>;
}

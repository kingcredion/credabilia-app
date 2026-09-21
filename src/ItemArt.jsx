import React from 'react';
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

export function ItemArt({ kind = 'generic', category, large = false, photo }) {
  if(photo) return <img className="listing-cover" src={photo} alt={`${category} item photo`}/>;
  return <div className={`item-art ${kind} ${large ? 'large' : ''}`} aria-label={`${category} illustration`} role="img">
    {kind === 'baseball' ? <div className="baseball-ball"><span className="seam one"/><span className="seam two"/><i>Heritage</i></div>
      : kind === 'comic' ? <div className="comic-book"><small>ORBIT PRESS · 001</small><strong>ASTRAL<br/>EXPLORER</strong><div className="planet"/><span>INTO THE UNKNOWN</span></div>
      : kind === 'art' ? <div className="art-frame"><div className="art-print"><i/><b/><em/></div></div>
      : <div className="generic-art"><Layers size={60} strokeWidth={1}/><span>{category || 'Collectible'}</span></div>}
    <span className="art-caption">{['baseball', 'comic', 'art'].includes(kind) ? 'STUDY ILLUSTRATION' : 'PHOTO NOT ADDED'}</span>
  </div>;
}

import React from 'react';
import { Layers } from 'lucide-react';

export const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

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

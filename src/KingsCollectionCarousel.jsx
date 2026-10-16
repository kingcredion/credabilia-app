import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Crown } from 'lucide-react';
import { ItemArt, money } from './ItemArt.jsx';
import './kingsCollection.css';

export function KingsCollectionCarousel({ items, onSelect }) {
  const track = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const update = () => setEdges({ start: node.scrollLeft <= 2, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2 });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    update();
    return () => { observer.disconnect(); node.removeEventListener('scroll', update); };
  }, [items]);
  if (!items.length) return null;
  const move = direction => {
    const node = track.current;
    const card = node.firstElementChild;
    node.scrollBy({ left: direction * (card.getBoundingClientRect().width + 20), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <section className="royal-carousel" aria-labelledby="royal-carousel-title" aria-roledescription="carousel">
    <div className="royal-carousel-heading">
      <img src="/brand/king-credion-collection-presenter-v1.webp" width="100" height="100" alt="" loading="lazy"/>
      <div><p><Crown size={16}/> FROM THE KING'S COLLECTION</p><h2 id="royal-carousel-title">A royal selection.</h2><span>Explore memorabilia offered by King Credion.</span></div>
      <div className="royal-carousel-controls">
        <button type="button" aria-label="Previous King's Collection item" aria-controls="royal-carousel-track" disabled={edges.start} onClick={() => move(-1)}><ArrowLeft size={20}/></button>
        <button type="button" aria-label="Next King's Collection item" aria-controls="royal-carousel-track" disabled={edges.end} onClick={() => move(1)}><ArrowRight size={20}/></button>
      </div>
    </div>
    <div className="royal-carousel-track" id="royal-carousel-track" ref={track}>
      {items.map((item) => <button type="button" className="royal-product" key={item.id} onClick={() => onSelect(item.id)} aria-label={'View ' + item.title + ', ' + money(item.price_cents)}>
        <div className="royal-product-stage"><ItemArt kind={item.artwork} category={item.category} photo={item.media?.find(asset => asset.kind === 'item')?.url} thumbId={!item.sample ? item.id : undefined}/></div>
        <div className="royal-product-copy"><span className="royal-product-category">{item.category}{item.listing_type === 'auction' ? ' · Auction' : ''}</span><h3>{item.title}</h3><div><strong>{money(item.price_cents)}</strong><span>View item <ArrowRight size={16}/></span></div></div>
      </button>)}
    </div>
  </section>;
}


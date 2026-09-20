import React, { useEffect, useState } from 'react';
import { ShieldCheck, ArrowUpRight, Layers } from 'lucide-react';
import { ItemArt, money } from './ItemArt.jsx';

export function Storefront({ slug, service, onBack }) {
  const [store, setStore] = useState(undefined);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    service.getStorefront(slug).then(result => { if (alive) setStore(result); }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [slug]);
  return <div className="app">
    <header className="topbar">
      <button className="brand" onClick={onBack} aria-label="Credabilia home"><ShieldCheck size={28} strokeWidth={1.7}/>credabilia<span>®</span></button>
      <button className="primary compact" onClick={onBack}>Join Credabilia <ArrowUpRight size={16}/></button>
    </header>
    <div className="page-layout">
      {/* .page-layout is a 2-column grid built for [sidebar, main]; there's no sidebar here, so main must span both columns. */}
      <main style={{ gridColumn: '1 / -1' }}>
        {error ? <div className="message error" role="alert"><span>{error}</span></div>
          : store === undefined ? <p role="status" className="empty-state">Loading this storefront…</p>
          : store === null ? <div className="empty-state"><Layers size={34}/><h3>Store not found.</h3><p>This storefront link isn't in use.</p></div>
          : <>
            <section className="hero"><div className="hero-copy"><p className="eyebrow"><span className="small-line"/>SELLER STOREFRONT</p><h1>{store.display_name}</h1><p>Member since {new Date(store.member_since).toLocaleDateString()} · {store.sales_count} {store.sales_count === 1 ? 'sale' : 'sales'} on Credabilia.</p></div></section>
            <section className="listings-section"><div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2>Active listings</h2></div><span className="item-count">{store.listings.length} {store.listings.length === 1 ? 'item' : 'items'}</span></div>
              {!store.listings.length ? <div className="empty-state"><Layers size={34}/><h3>Nothing listed right now.</h3><p>Check back later for new finds.</p></div>
                : <div className="items-grid">{store.listings.map(item => <a className="item-card" key={item.id} href={`/?item=${item.id}`} aria-label={`View ${item.title}`}><ItemArt category={item.category} photo={item.media?.[0]?.url}/><div className="item-card-content"><div className="card-meta"><span>{item.category}</span></div><h3>{item.title}</h3><div className="card-bottom"><strong>{money(item.price_cents)}</strong></div></div></a>)}</div>}
            </section>
          </>}
        <footer><span>© {new Date().getFullYear()} Credabilia</span><span>Made for the love of the find.</span></footer>
      </main>
    </div>
  </div>;
}

import React, { useEffect } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Brand } from './Brand.jsx';
import { ItemArt } from './ItemArt.jsx';

// Landing page for a /item/:id link whose listing has since sold -- see get_sold_listing(). Shows the
// item (grayscale) under the Sold stamp, but no price, seller or sale details.
export function SoldItemPage({ item, onBack }) {
  useEffect(() => {
    document.title = `${item.title} (Sold) | Credabilia`;
    // Sold pages aren't in the sitemap or the Merchant feed, so keep search engines from indexing them too.
    const meta = document.createElement('meta');
    meta.name = 'robots'; meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => { meta.remove(); document.title = 'Credabilia | The Memorabilia Kingdom'; };
  }, [item]);
  return <div className="app">
    <header className="topbar storefront-topbar">
      <button className="brand" onClick={onBack} aria-label="Credabilia home"><Brand/></button>
      <button className="primary compact" onClick={onBack}>Browse the kingdom <ArrowUpRight size={16}/></button>
    </header>
    <div className="page-layout">
      <main style={{ gridColumn: '1 / -1' }}>
        <section className="sold-page">
          <div className="sold-photo">
            <ItemArt category={item.category} photo={item.media?.[0]?.url}/>
            <img className="sold-stamp" src="/brand/item-sold-stamp-v1.webp" width="640" height="628" alt="Item sold"/>
          </div>
          <div className="sold-copy">
            <p className="eyebrow">{item.category}</p>
            <h1>{item.title}</h1>
            <p>This piece has found a new home in the kingdom. Browse what's available now.</p>
            <button className="primary" onClick={onBack}>Browse the kingdom <ArrowUpRight size={16}/></button>
          </div>
        </section>
        <footer><span>© {new Date().getFullYear()} Credabilia</span><span>Made for the love of the find.</span></footer>
      </main>
    </div>
  </div>;
}

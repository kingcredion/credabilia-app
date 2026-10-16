# Credabilia SEO engine

How search visibility works on Credabilia, what happens automatically when a listing changes, and how to check it. Written 2026-10-15.

## The idea

The app is a single page that draws itself with JavaScript. A search engine that does not run it would see the same empty page for every address, so for known crawler user agents
`middleware.js` answers each public address with its own title, description, canonical address, social tags, structured data and a plain-HTML copy of the same content a visitor sees.
Visitors are never routed through those lookups. Nothing here is a ranking trick: it makes real pages readable and linkable, and says only what the listing already says.

## What exists

| Piece | Where | What it does |
|---|---|---|
| Crawler pages | `middleware.js` | Item, storefront, category, home and information pages for crawlers |
| Sitemap | `middleware.js` (`/sitemap.xml`, `/sitemaps/pages-N.xml`) | Public listings, storefronts with listings, categories with inventory, information pages |
| Category addresses | `src/seoRoutes.js` | `/category/sports`, `comics`, `art`, `entertainment`, `history`, shared by the app and the crawler layer |
| Merchant feed | `middleware.js` (`/products.xml`) | King's Collection items only; the giveaway prize is excluded |
| Database feed | migration `202610150149_seo_engine.sql` | `get_listing_preview`, `sitemap_entries`, `seo_listing_index`, `listings.updated_at`, `is_giveaway_prize`, `seo_health` |
| Static identity data | `index.html` | Organization and WebSite JSON-LD, default social tags |

## What happens automatically

- **New public listing** (active, seller in good standing): its page answers crawlers with derived title and description, canonical, Product and Breadcrumb data, a link to its category and
  seller, and related items. It appears in the home page's latest list, its category page and the next sitemap (cached for one minute in the crawler layer, one hour by clients).
- **Edit** (title, description, price, category, details, tags, status or certificate): `updated_at` moves, so the sitemap `lastmod` and the category and storefront dates follow. A bid count or
  version bump does not move it.
- **Sold, archived, draft, held or removed**: it leaves the sitemap, lists and category counts at once, and a crawler asking for the page gets 404 with `noindex`.
- **Giveaway prize**: keeps its own page, described as a prize that is not for sale (no price or availability), left out of category lists and counts.
- **New storefront** (a store name plus at least one public listing): listed in the sitemap with a date, linked from the home page, and has its own page.
- **Empty category**: its page says so and is `noindex`; it is not in the sitemap.

## Rules the code keeps

- One canonical per page: tracking and share parameters (`utm_*`, `ref`, `fbclid`, `gclid`, `list`, `giveaway`) and trailing slashes never create a second address.
- Text is derived from real fields only. Authentication is never claimed: a certificate is described as "listed", with its issuer, only when the listing has one.
- `lastmod` is written only where the database has a real date. Home and the information pages carry none.
- A failed lookup is a retryable 503 for the sitemap, and "carry on to the app" for pages, never a page that wrongly says it does not exist.
- Everything is escaped (HTML and JSON-LD), tested with hostile titles.

## Checking it

- Crawler view of any page: `curl -A "Googlebot/2.1" https://credabilia.com/item/<id>` (title, canonical, JSON-LD, body).
- Operator report (signed in as an operator): `select public.seo_health();` returns indexable listings, missing photos, thin descriptions (under 40 characters), short titles, duplicate titles,
  categories with inventory, storefronts, and whether any giveaway prize is in the sitemap.
- **Sitemap inclusion is not Google indexing.** Indexed counts, impressions, clicks and positions come from Google Search Console only (domain property `sc-domain:credabilia.com`).

## Known limits

- Sold items return 404 for crawlers (and the app shows them only to the people involved), so they are not kept as indexed pages. Keeping them would need a public sold page.
- Listings have no per-photo alt text of their own; crawler pages derive it from the title, the person (when not already in the title) and the category.
- Category pages show the newest 60 listings. There is no pagination yet; add it when a category passes that.
- Only top-level categories have pages. Sport- or team-level pages would be thin at today's inventory and are not created.
- The sitemap lists everything in one database call. It splits into numbered files above 45,000 URLs; at that scale the call should become paged.
- The mobile apps carry their own copy of the web code until they are updated.

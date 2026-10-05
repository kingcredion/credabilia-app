// Auction bid steps (cents). Mirrors public.auction_increment() in the database (eBay's table); tests/auctionIncrement.test.js keeps the
// two in step. The database is the authority: this only shows bidders what the next bid has to be.
export function auctionIncrement(priceCents) {
  const price = Number(priceCents) || 0;
  if (price < 100) return 5;
  if (price < 500) return 25;
  if (price < 2500) return 50;
  if (price < 10000) return 100;
  if (price < 25000) return 250;
  if (price < 50000) return 500;
  if (price < 100000) return 1000;
  if (price < 250000) return 2500;
  if (price < 500000) return 5000;
  return 10000;
}

// The least a new bidder can bid: the starting bid for the first bid, then one step above the current price.
export function minimumNextBid(item) {
  return item.bid_count === 0 ? item.price_cents : item.price_cents + auctionIncrement(item.price_cents);
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {auctionIncrement,minimumNextBid} from '../src/auction.js';

test('the bid steps shown to bidders are exactly the ones the database enforces',async()=>{
  const sql=await readFile(new URL('../supabase/migrations/202610050106_auction_hardening.sql',import.meta.url),'utf8');
  const fn=sql.match(/create function public\.auction_increment[\s\S]*?\$\$;/)[0];
  const db=new PGlite();
  try {
    await db.exec(fn);
    for(const cents of [1,99,100,499,500,2499,2500,9999,10000,24999,25000,49999,50000,99999,100000,249999,250000,499999,500000,1000000]) {
      const inDb=Number((await db.query('select public.auction_increment($1::bigint) as a',[cents])).rows[0].a);
      assert.equal(auctionIncrement(cents),inDb,`step at ${cents} cents`);
    }
  } finally { await db.close(); }
});

test('the minimum next bid is the starting bid first, then one step above the current price',()=>{
  assert.equal(minimumNextBid({bid_count:0,price_cents:80000}),80000);
  assert.equal(minimumNextBid({bid_count:3,price_cents:80000}),81000);
  assert.equal(minimumNextBid({bid_count:1,price_cents:2500}),2600);
});

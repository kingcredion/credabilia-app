import { shippingMarkupFactor } from './markup.js';
import { shippoAddress, quoteRates, buyerPrice } from './shippingRates.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_OPTIONS=6;

// Lists the shipping services a buyer can pick from, with what each would cost them, before they pay. The seller's saved address is
// used to ask the carrier for rates and is never sent back. The price shown is advisory: create-checkout-session asks the carrier
// again at payment time and charges what it finds for the service the buyer picked.
export function createHandler({createClient,env,fetchImpl=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to see shipping options.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to see shipping options.'},401);

      const text=await request.text(); if(text.length>1024) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const listingId=body?.listing_id, shippingAddress=body?.shipping_address, wantInsurance=body?.want_insurance!==false;
      if(typeof listingId!=='string' || !UUID_RE.test(listingId) || typeof shippingAddress!=='object' || shippingAddress===null) return reply({error:'Invalid request.'},400);

      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:inputs}=await service.rpc('shipping_quote_inputs',{p_listing_id:listingId});
      if(!inputs) return reply({error:'Item not found.'},404);
      if(inputs.seller_id===identity.user.id) return reply({error:'You cannot buy your own listing.'},400);
      if(!['active','pending'].includes(inputs.status)) return reply({error:'This item is not available to buy.'},400);

      const none={options:[],free_shipping:!!inputs.free_shipping,locked:false,insured:false};
      if(!inputs.parcel || !inputs.seller_shipping_address || !env('SHIPPO_API_KEY')) return reply(none);

      const markup=shippingMarkupFactor(inputs.is_king);
      let quote;
      try {
        quote=await quoteRates({
          shippoKey:env('SHIPPO_API_KEY'), fetchImpl,
          from:shippoAddress(inputs.seller_shipping_address), to:shippoAddress(shippingAddress), parcel:inputs.parcel,
          insurance:wantInsurance ? {amount_cents:Math.min(inputs.price_cents,1000000),content:inputs.title} : null,
        });
      } catch { return reply(none); }
      if(!quote.options.length) return reply(none);

      // Free shipping means the seller covers it, so the buyer is not asked to choose: it is the cheapest service, shown at no cost.
      const chosen=inputs.free_shipping ? quote.options.slice(0,1) : quote.options.slice(0,MAX_OPTIONS);
      const options=chosen.map(option=>{
        const price=buyerPrice(option,markup);
        const shipping=inputs.free_shipping ? 0 : price.shipping_cents;
        return {provider:option.provider,service:option.service,name:option.name,estimated_days:option.estimated_days,
          shipping_cents:shipping,insurance_cents:price.insurance_cents,total_cents:shipping+price.insurance_cents};
      });
      return reply({options,free_shipping:!!inputs.free_shipping,locked:!!inputs.free_shipping,insured:quote.insured});
    } catch {return reply({error:'Shipping options are temporarily unavailable. Try again later.'},503);}
  };
}

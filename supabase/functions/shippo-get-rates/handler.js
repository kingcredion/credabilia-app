import { shippoAddress, quoteRates, findChoice, maxLabelCents } from './shippingRates.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({createClient,env,fetchImpl=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to ship this item.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to ship this item.'},401);
      if(!env('SHIPPO_API_KEY')) return reply({error:'Shipping is not connected yet.'},503);

      const text=await request.text(); if(text.length>1024) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const purchaseId=body?.purchase_id, bodyParcel=body?.parcel;
      if(typeof purchaseId!=='string' || !UUID_RE.test(purchaseId)) return reply({error:'Invalid request.'},400);

      const {data:sale,error:saleError}=await client.from('purchases').select('id,shipping_address,listing_id,insured,insured_value_cents,listings!purchases_listing_id_fkey(weight_oz,length_in,width_in,height_in)').eq('id',purchaseId).eq('seller_id',identity.user.id).maybeSingle();
      if(saleError || !sale) return reply({error:'Sale not found.'},404);
      // Prefer the listing's own stored dimensions (set at listing time); fall back to the
      // request body only for legacy listings created before that existed.
      const stored=sale.listings;
      const parcel=(stored?.weight_oz && stored?.length_in && stored?.width_in && stored?.height_in) ? {weight_oz:stored.weight_oz,length_in:stored.length_in,width_in:stored.width_in,height_in:stored.height_in} : bodyParcel;
      const weight=Number(parcel?.weight_oz), length=Number(parcel?.length_in), width=Number(parcel?.width_in), height=Number(parcel?.height_in);
      if(![weight,length,width,height].every(n=>Number.isFinite(n) && n>0)) return reply({error:'Enter a valid package weight and size.'},400);
      if(!sale.shipping_address) return reply({error:'This buyer has no shipping address on file.'},400);
      const {data:seller,error:sellerError}=await client.from('profiles').select('shipping_address').eq('id',identity.user.id).single();
      if(sellerError || !seller?.shipping_address) return reply({error:'Add your shipping address in Profile settings first.'},400);

      let quote;
      try {
        quote=await quoteRates({
          shippoKey:env('SHIPPO_API_KEY'), fetchImpl,
          from:shippoAddress(seller.shipping_address,identity.user.email), to:shippoAddress(sale.shipping_address),
          parcel:{weight_oz:weight,length_in:length,width_in:width,height_in:height},
          // Insurance is shipment-scoped in Shippo -- any rate/label bought from this shipment automatically carries the coverage the
          // buyer already paid for at checkout.
          insurance:sale.insured ? {amount_cents:sale.insured_value_cents,content:'Item'} : null,
        });
      } catch { return reply({error:'Shipping service is temporarily unavailable. Try again later.'},503); }
      if(!quote.options.length) return reply({error:'Could not get shipping rates. Check both addresses and try again.'},400);

      // The buyer chose the shipping service (and paid for it) at checkout, so that is the ONLY one the seller is offered. An order with
      // no recorded choice (older orders) is limited to the cheapest service. Whatever the seller buys is paid for by the platform, so
      // it must never be a more expensive service than the buyer paid for.
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
      // Shipping is held while a refund request is open on the order: a label bought now would be spent on a package the buyer may be sending back.
      const {data:openRefund}=await service.from('refund_requests').select('id').eq('purchase_id',purchaseId).in('status',['pending','contested','partial_offered','return_required','accepted']).limit(1);
      if(openRefund?.length) return reply({error:'There is an open refund request on this order. Wait until it is resolved before shipping.'},409);
      const {data:order}=await service.from('purchases').select('shipping_provider,shipping_service,shipping_quote_cents,seller_pays_shipping,price_cents,platform_fee_cents').eq('id',purchaseId).maybeSingle();
      // The seller offered free shipping, so the seller picks the service and the real label price comes out of their payout (like eBay).
      // Every service is offered with what it will cost them; ones that would cost more than the payout from this sale are flagged.
      if(order?.seller_pays_shipping) {
        const payoutBeforeShipping=Number(order.price_cents)-Number(order.platform_fee_cents);
        return reply({locked:false,seller_pays:true,payout_before_shipping_cents:payoutBeforeShipping,rates:quote.options.slice(0,6).map(option=>{
          const cost=option.amount_cents-option.insurance_cents;
          return {rate_id:option.rate_id,provider:option.provider,servicelevel:option.name,amount_cents:cost,estimated_days:option.estimated_days,affordable:payoutBeforeShipping-cost>=0};
        })});
      }
      let allowed;
      if(order?.shipping_provider && order?.shipping_service) {
        const match=findChoice(quote.options,{provider:order.shipping_provider,service:order.shipping_service});
        if(!match) return reply({error:"The shipping service your buyer chose isn't available right now. Try again later, or contact support."},409);
        if(match.amount_cents>maxLabelCents(order.shipping_quote_cents ?? match.amount_cents)) {
          try { await service.rpc('notify_operator_alert',{p_event:'Admin Alert: Payment Problem',p_properties:{summary:'A shipping label now costs far more than the buyer paid for, so it was paused.',reference:purchaseId,detail:'Quoted at checkout: '+order.shipping_quote_cents+' cents; now: '+match.amount_cents+' cents.'}}); } catch {}
          return reply({error:"The carrier price for your buyer's shipping choice has changed a lot since checkout, so this label is paused. Our team has been told and will sort it out."},409);
        }
        allowed=[match];
      } else allowed=quote.options.slice(0,1);
      return reply({locked:true,buyer_chose:!!order?.shipping_provider,rates:allowed.map(option=>({rate_id:option.rate_id,provider:option.provider,servicelevel:option.name,amount_cents:option.amount_cents,estimated_days:option.estimated_days}))});
    } catch {return reply({error:'Shipping service is temporarily unavailable. Try again later.'},503);}
  };
}

import Stripe from 'npm:stripe@17';
import { shippingMarkupFactor } from './markup.js';
import { shippoAddress, quoteRates, buyerPrice, findChoice } from './shippingRates.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({createClient,env,fetchImpl=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to buy this item.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to buy this item.'},401);
      if(!env('STRIPE_SECRET_KEY')) return reply({error:'Payments are not connected yet.'},503);

      const text=await request.text(); if(text.length>1024) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const listingId=body?.listing_id, shippingAddress=body?.shipping_address;
      const applyCreditCents=Number.isInteger(body?.apply_credit_cents) && body.apply_credit_cents>0 ? body.apply_credit_cents : 0;
      const wantInsurance=body?.want_insurance!==false;
      const fulfillmentMethod=body?.fulfillment_method==='pickup' ? 'pickup' : 'ship';
      if(typeof listingId!=='string' || !UUID_RE.test(listingId)) return reply({error:'Invalid request.'},400);
      if(fulfillmentMethod==='ship' && (typeof shippingAddress!=='object' || shippingAddress===null)) return reply({error:'A shipping address is required.'},400);

      // Shipping is priced from a fresh carrier quote BEFORE the item is reserved, so a choice that is no longer available is refused
      // without holding the item for this buyer. The buyer's pick is matched against this quote; nothing the browser sends is trusted
      // for the price.
      const shippingChoice=body?.shipping_choice;
      let quote=null, markup=1;
      if(fulfillmentMethod==='ship' && env('SHIPPO_API_KEY')) {
        const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
        const {data:inputs}=await service.rpc('shipping_quote_inputs',{p_listing_id:listingId});
        if(inputs?.parcel && inputs.seller_shipping_address) {
          markup=shippingMarkupFactor(inputs.is_king);
          try {
            quote=await quoteRates({
              shippoKey:env('SHIPPO_API_KEY'), fetchImpl,
              from:shippoAddress(inputs.seller_shipping_address), to:shippoAddress(shippingAddress), parcel:inputs.parcel,
              insurance:wantInsurance ? {amount_cents:Math.min(inputs.price_cents,1000000),content:inputs.title||'Item'} : null,
            });
          } catch { /* the quote is a best-effort estimate: if Shippo is unreachable, skip shipping this time rather than block the sale */ }
        }
        if(quote?.options.length && !inputs.free_shipping && shippingChoice && !findChoice(quote.options,shippingChoice)) return reply({error:'That shipping option is no longer available. Pick another one and try again.'},409);
      }

      const {data:reservation,error:reserveError}=await client.rpc('reserve_listing_checkout',{p_listing_id:listingId,p_shipping_address:shippingAddress,p_apply_credit_cents:applyCreditCents,p_want_insurance:wantInsurance,p_fulfillment_method:fulfillmentMethod});
      if(reserveError) return reply({error:reserveError.message},400);
      const {checkout_session_id:checkoutSessionId,price_cents:priceCents,title,applied_credit_cents:appliedCreditCents,free_shipping:freeShipping,seller_shipping_address:sellerAddress,want_insurance:insuranceRequested,parcel}=reservation;

      // Real shipping (and, if requested, insurance) cost for the service the buyer picked, marked up 10% except for King's Collection
      // items where it is passed through at the carrier rate (see markup.js). Free shipping is always the cheapest service, which the
      // seller pays for. No quote (legacy listing without a parcel, or Shippo unreachable) just means no shipping cost this time.
      let shippingOnlyCents=0, insuranceCostCents=0, chosenService=null;
      if(fulfillmentMethod==='ship' && parcel && quote?.options.length) {
        const picked=freeShipping ? quote.options[0] : (findChoice(quote.options,shippingChoice) || quote.options[0]);
        const price=buyerPrice(picked,markup);
        shippingOnlyCents=price.shipping_cents;
        insuranceCostCents=price.insurance_cents;
        chosenService={provider:picked.provider,service:picked.service,name:picked.name,quote_cents:picked.amount_cents};
      }

      const itemAmount=priceCents-appliedCreditCents;
      const lineItems=[{quantity:1,price_data:{currency:'usd',unit_amount:itemAmount,product_data:{name:title}}}];
      if(shippingOnlyCents>0 && !freeShipping) lineItems.push({quantity:1,price_data:{currency:'usd',unit_amount:shippingOnlyCents,product_data:{name:'Shipping'}}});
      // Insurance is always buyer-paid, regardless of free_shipping -- that flag only ever meant
      // "seller absorbs the shipping cost," never the insurance premium.
      if(insuranceCostCents>0) lineItems.push({quantity:1,price_data:{currency:'usd',unit_amount:insuranceCostCents,product_data:{name:'Shipping insurance'}}});

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      // Escrow: no application_fee_amount/transfer_data here -- the full charge lands on the
      // platform's own Stripe balance. The seller is paid via a separate Transfer once delivery
      // is confirmed (see shippo-webhook and release-stale-escrow), not instantly at checkout.
      // If Stripe's own call fails here, nothing has been attached to the reservation yet --
      // reserve_listing_checkout's lazy-expiry sweep releases the listing again on the next attempt.
      const session=await stripe.checkout.sessions.create({
        mode:'payment',
        customer_email:identity.user.email,
        client_reference_id:checkoutSessionId,
        line_items:lineItems,
        expires_at:Math.floor(Date.now()/1000)+1800,
        success_url:`${env('APP_URL')}/?checkout=success&session={CHECKOUT_SESSION_ID}`,
        cancel_url:`${env('APP_URL')}/?checkout=cancel&session={CHECKOUT_SESSION_ID}`,
      });

      const {error:attachError}=await client.rpc('attach_stripe_checkout_session',{p_checkout_session_id:checkoutSessionId,p_stripe_session_id:session.id,p_shipping_cost_cents:shippingOnlyCents,p_insurance_cost_cents:insuranceCostCents});
      if(attachError) return reply({error:'Could not start checkout. Try again.'},500);
      // Best effort: an order with no recorded choice is limited to the cheapest service when the seller ships, so this can only help.
      if(chosenService) await client.rpc('attach_shipping_service',{p_checkout_session_id:checkoutSessionId,p_provider:chosenService.provider,p_service:chosenService.service,p_service_name:chosenService.name,p_quote_cents:chosenService.quote_cents});

      return reply({url:session.url});
    } catch {return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);}
  };
}

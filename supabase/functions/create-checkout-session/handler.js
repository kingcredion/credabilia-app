import Stripe from 'npm:stripe@17';
import { shippingMarkupFactor } from './markup.js';
import { shippoAddress, quoteRates, buyerPrice, findChoice } from './shippingRates.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Stripe product tax codes: "General - Tangible Goods" and "Shipping".
const TAX_CODE_GOODS='txcd_99999999', TAX_CODE_SHIPPING='txcd_92010001';

// Finds (by email) or creates the buyer's Stripe customer and puts the shipping address on it, so Stripe Tax can tax the order.
async function ensureTaxCustomer(stripe,{email,userId,address}) {
  const stripeAddress={line1:address.street1,line2:address.street2||undefined,city:address.city,state:address.state,postal_code:address.zip,country:address.country||'US'};
  const details={email,name:address.name||undefined,address:stripeAddress,shipping:{name:address.name||email,address:stripeAddress},metadata:{user_id:userId}};
  const existing=(await stripe.customers.list({email,limit:1})).data?.[0];
  const customer=existing ? await stripe.customers.update(existing.id,details) : await stripe.customers.create(details);
  return customer.id;
}

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
      if(fulfillmentMethod==='ship') {
        // A shipped order must have a real carrier quote: with none, the buyer would pay $0 shipping and Credabilia would pay the postage.
        // So an item that cannot be quoted (no package size, a seller with no address, a package the carriers will not take, or the carrier
        // being unreachable) cannot be bought for shipping, and the buyer is told why instead of being charged nothing for delivery.
        if(!env('SHIPPO_API_KEY')) return reply({error:'Shipping is not connected yet. Please try again later.'},503);
        const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
        const {data:inputs}=await service.rpc('shipping_quote_inputs',{p_listing_id:listingId});
        if(!inputs?.parcel || !inputs.seller_shipping_address) return reply({error:'This item cannot be shipped yet: the seller still needs to add its package size or shipping address. You can message the seller.'},409);
        markup=shippingMarkupFactor(inputs.is_king);
        let quoteFailed=false;
        try {
          quote=await quoteRates({
            shippoKey:env('SHIPPO_API_KEY'), fetchImpl,
            from:shippoAddress(inputs.seller_shipping_address), to:shippoAddress(shippingAddress), parcel:inputs.parcel,
            insurance:wantInsurance ? {amount_cents:Math.min(inputs.price_cents,1000000),content:inputs.title||'Item'} : null,
          });
        } catch { quoteFailed=true; }
        if(quoteFailed) return reply({error:'Shipping rates are temporarily unavailable. Please try again in a few minutes.'},503);
        if(!quote.options.length) return reply({error:'No shipping service is available for this item to that address. Check the address, or message the seller.'},409);
        if(!inputs.free_shipping && shippingChoice && !findChoice(quote.options,shippingChoice)) return reply({error:'That shipping option is no longer available. Pick another one and try again.'},409);
      }

      const {data:reservation,error:reserveError}=await client.rpc('reserve_listing_checkout',{p_listing_id:listingId,p_shipping_address:shippingAddress,p_apply_credit_cents:applyCreditCents,p_want_insurance:wantInsurance,p_fulfillment_method:fulfillmentMethod});
      if(reserveError) return reply({error:reserveError.message},400);
      const {checkout_session_id:checkoutSessionId,price_cents:priceCents,title,applied_credit_cents:appliedCreditCents,free_shipping:freeShipping,seller_shipping_address:sellerAddress,want_insurance:insuranceRequested}=reservation;

      // Real shipping (and, if requested, insurance) cost for the service the buyer picked, marked up 10% except for King's Collection
      // items where it is passed through at the carrier rate (see markup.js). Free shipping is always the cheapest service, which the
      // seller pays for. No quote (legacy listing without a parcel, or Shippo unreachable) just means no shipping cost this time.
      let shippingOnlyCents=0, insuranceCostCents=0, chosenService=null;
      // A shipped order always has a quote here (the checks above refuse the purchase otherwise), so this must not also depend on anything the
      // reservation returns: it once required reserve_listing_checkout to hand back the parcel, which a later migration stopped doing, and every
      // shipped order was silently charged $0 shipping.
      if(fulfillmentMethod==='ship' && quote?.options.length) {
        const picked=freeShipping ? quote.options[0] : (findChoice(quote.options,shippingChoice) || quote.options[0]);
        const price=buyerPrice(picked,markup);
        shippingOnlyCents=price.shipping_cents;
        insuranceCostCents=price.insurance_cents;
        chosenService={provider:picked.provider,service:picked.service,name:picked.name,quote_cents:picked.amount_cents};
      }

      // Sales tax: only when STRIPE_TAX_ENABLED is 'true' (it stays off until Stripe Tax has the state registrations). Each line says what
      // it is (goods or shipping) and that tax is added on top of the price, and Stripe works out the tax from the buyer's address.
      const taxOn=env('STRIPE_TAX_ENABLED')==='true';
      const line=(name,amount,taxCode)=>({quantity:1,price_data:{currency:'usd',unit_amount:amount,product_data:{name,...(taxOn?{tax_code:taxCode}:{})},...(taxOn?{tax_behavior:'exclusive'}:{})}});
      const itemAmount=priceCents-appliedCreditCents;
      const lineItems=[line(title,itemAmount,TAX_CODE_GOODS)];
      if(shippingOnlyCents>0 && !freeShipping) lineItems.push(line('Shipping',shippingOnlyCents,TAX_CODE_SHIPPING));
      // Insurance is always buyer-paid, regardless of free_shipping -- that flag only ever meant
      // "seller absorbs the shipping cost," never the insurance premium. It is taxed with shipping (a delivery-related charge).
      if(insuranceCostCents>0) lineItems.push(line('Shipping insurance',insuranceCostCents,TAX_CODE_SHIPPING));

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      // A shipped order is taxed at the address it ships to: that address goes on a Stripe customer so the buyer does not type it twice.
      // A pickup order has no shipping address, so Stripe asks for a billing address at payment and taxes at that location.
      const customerId=taxOn && fulfillmentMethod==='ship' ? await ensureTaxCustomer(stripe,{email:identity.user.email,userId:identity.user.id,address:shippingAddress}) : null;
      // Escrow: no application_fee_amount/transfer_data here -- the full charge lands on the
      // platform's own Stripe balance. The seller is paid via a separate Transfer once delivery
      // is confirmed (see shippo-webhook and release-stale-escrow), not instantly at checkout.
      // If Stripe's own call fails here, nothing has been attached to the reservation yet --
      // reserve_listing_checkout's lazy-expiry sweep releases the listing again on the next attempt.
      let session;
      try {
        session=await stripe.checkout.sessions.create({
          mode:'payment',
          ...(customerId?{customer:customerId}:{customer_email:identity.user.email}),
          ...(taxOn?{automatic_tax:{enabled:true}}:{}),
          ...(taxOn && fulfillmentMethod==='pickup'?{billing_address_collection:'required'}:{}),
          client_reference_id:checkoutSessionId,
          line_items:lineItems,
          expires_at:Math.floor(Date.now()/1000)+1800,
          success_url:`${env('APP_URL')}/?checkout=success&session={CHECKOUT_SESSION_ID}`,
          cancel_url:`${env('APP_URL')}/?checkout=cancel&session={CHECKOUT_SESSION_ID}`,
        });
      } catch(error) {
        // An address Stripe cannot place on the map cannot be taxed; say so instead of guessing (the held item is released by the usual 30 minute expiry).
        if(taxOn && error?.code==='customer_tax_location_invalid') return reply({error:'We could not work out sales tax for that address. Check the street, city, state and ZIP and try again.'},400);
        throw error;
      }

      const {error:attachError}=await client.rpc('attach_stripe_checkout_session',{p_checkout_session_id:checkoutSessionId,p_stripe_session_id:session.id,p_shipping_cost_cents:shippingOnlyCents,p_insurance_cost_cents:insuranceCostCents});
      if(attachError) return reply({error:'Could not start checkout. Try again.'},500);
      // Best effort: an order with no recorded choice is limited to the cheapest service when the seller ships, so this can only help.
      if(chosenService) await client.rpc('attach_shipping_service',{p_checkout_session_id:checkoutSessionId,p_provider:chosenService.provider,p_service:chosenService.service,p_service_name:chosenService.name,p_quote_cents:chosenService.quote_cents});

      return reply({url:session.url});
    } catch {return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);}
  };
}

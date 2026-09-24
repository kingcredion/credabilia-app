import Stripe from 'npm:stripe@17';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shippoAddress(a,email) {
  return {name:a?.name||'',street1:a?.street1||'',street2:a?.street2||'',city:a?.city||'',state:a?.state||'',zip:a?.zip||'',country:a?.country||'',phone:a?.phone||'',email:email||''};
}

export function createHandler({createClient,env}) {
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

      const {data:reservation,error:reserveError}=await client.rpc('reserve_listing_checkout',{p_listing_id:listingId,p_shipping_address:shippingAddress,p_apply_credit_cents:applyCreditCents,p_want_insurance:wantInsurance,p_fulfillment_method:fulfillmentMethod});
      if(reserveError) return reply({error:reserveError.message},400);
      const {checkout_session_id:checkoutSessionId,price_cents:priceCents,title,applied_credit_cents:appliedCreditCents,free_shipping:freeShipping,seller_shipping_address:sellerAddress,want_insurance:insuranceRequested,parcel}=reservation;

      // Real, marked-up shipping (and, if requested, insurance) cost -- only computable now that
      // we know both addresses (seller's saved address + the buyer's just-entered one). No parcel
      // on the listing (a legacy listing from before this feature) just means no shipping/
      // insurance cost this time, same as today's behavior. Pickup always skips this branch --
      // dimensions are still required at listing time regardless of fulfillment method, so `parcel`
      // alone can't distinguish pickup from ship.
      let shippingOnlyCents=0, insuranceCostCents=0;
      if(fulfillmentMethod==='ship' && parcel && env('SHIPPO_API_KEY')) {
        const quoteShipment=insure=>fetch('https://api.goshippo.com/shipments/',{
          method:'POST',
          headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`,'Content-Type':'application/json'},
          body:JSON.stringify({
            address_from:shippoAddress(sellerAddress),
            address_to:shippoAddress(shippingAddress),
            parcels:[{length:String(parcel.length_in),width:String(parcel.width_in),height:String(parcel.height_in),distance_unit:'in',weight:String(parcel.weight_oz),mass_unit:'oz'}],
            extra:insure ? {insurance:{amount:String(Math.min(priceCents,1000000)/100),currency:'usd',content:(title||'Item').slice(0,100)}} : undefined,
            async:false,
          }),
        }).then(r=>r.json());
        try {
          let shipment=await quoteShipment(insuranceRequested);
          let rates=(shipment.rates||[]).filter(rate=>rate.amount);
          // Not every carrier account supports insurance -- if an insured quote comes back with
          // no rates at all, fall back to a plain quote rather than losing the shipping cost too.
          if(!rates.length && insuranceRequested) {
            shipment=await quoteShipment(false);
            rates=(shipment.rates||[]).filter(rate=>rate.amount);
          }
          if(rates.length) {
            const cheapest=rates.reduce((min,rate)=>parseFloat(rate.amount)<parseFloat(min.amount)?rate:min,rates[0]);
            const rawTotalCents=parseFloat(cheapest.amount)*100;
            const rawInsuranceCents=parseFloat(cheapest.included_insurance_price||0)*100;
            shippingOnlyCents=Math.round((rawTotalCents-rawInsuranceCents)*1.10);
            insuranceCostCents=Math.round(rawInsuranceCents*1.10);
          }
        } catch { /* Quote is a best-effort estimate -- if Shippo is unreachable, skip shipping this time rather than block the sale. */ }
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

      return reply({url:session.url});
    } catch {return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);}
  };
}

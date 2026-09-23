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

      const quoteShipment=insure=>fetch('https://api.goshippo.com/shipments/',{
        method:'POST',
        headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          address_from:shippoAddress(seller.shipping_address,identity.user.email),
          address_to:shippoAddress(sale.shipping_address),
          parcels:[{length:String(length),width:String(width),height:String(height),distance_unit:'in',weight:String(weight),mass_unit:'oz'}],
          // Insurance is shipment-scoped in Shippo -- any rate/label bought from this shipment
          // automatically carries the coverage the buyer already paid for at checkout.
          extra:insure ? {insurance:{amount:String(sale.insured_value_cents/100),currency:'usd',content:'Item'}} : undefined,
          async:false,
        }),
      }).then(r=>r.json());

      let shipment=await quoteShipment(sale.insured);
      let rates=(shipment.rates||[]).filter(rate=>rate.amount);
      // Not every carrier account supports insurance -- if an insured quote comes back with no
      // rates at all, fall back to a plain quote rather than blocking the seller from shipping.
      if(!rates.length && sale.insured) {
        shipment=await quoteShipment(false);
        rates=(shipment.rates||[]).filter(rate=>rate.amount);
      }
      if(!rates.length) return reply({error:'Could not get shipping rates. Check both addresses and try again.'},400);
      return reply({rates:rates.map(rate=>({rate_id:rate.object_id,provider:rate.provider,servicelevel:rate.servicelevel?.name||rate.servicelevel_token,amount_cents:Math.round(parseFloat(rate.amount)*100),estimated_days:rate.estimated_days||null}))});
    } catch {return reply({error:'Shipping service is temporarily unavailable. Try again later.'},503);}
  };
}

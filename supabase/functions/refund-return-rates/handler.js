const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shippoAddress(a,email) {
  return {name:a?.name||'',street1:a?.street1||'',street2:a?.street2||'',city:a?.city||'',state:a?.state||'',zip:a?.zip||'',country:a?.country||'',phone:a?.phone||'',email:email||''};
}

// Buyer-authenticated mirror of shippo-get-rates, with address_from/address_to reversed (the
// buyer is now the shipper, the seller the recipient). refund_requests is locked down to
// RPC-only access, so -- like process-refund -- this reads through a service-role client and
// checks buyer_id ownership in code rather than relying on table grants.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to get a return label.'},401);
      if(!env('SHIPPO_API_KEY')) return reply({error:'Shipping is not connected yet.'},503);

      const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await userClient.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to get a return label.'},401);

      const text=await request.text(); if(text.length>512) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const refundRequestId=body?.refund_request_id;
      if(typeof refundRequestId!=='string' || !UUID_RE.test(refundRequestId)) return reply({error:'Invalid request.'},400);

      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data:refundRequest,error:requestError}=await service.from('refund_requests').select('id,purchase_id,buyer_id,status').eq('id',refundRequestId).maybeSingle();
      if(requestError || !refundRequest) return reply({error:'Refund request not found.'},404);
      if(identity.user.id!==refundRequest.buyer_id) return reply({error:'You can only get a label for your own return.'},403);
      if(refundRequest.status!=='return_required') return reply({error:'A return label is not needed for this request.'},400);

      const {data:purchase,error:purchaseError}=await service.from('purchases').select('id,seller_id,shipping_address,listing_id,listings(weight_oz,length_in,width_in,height_in)').eq('id',refundRequest.purchase_id).maybeSingle();
      if(purchaseError || !purchase) return reply({error:'Purchase not found.'},404);
      const stored=purchase.listings;
      const weight=Number(stored?.weight_oz), length=Number(stored?.length_in), width=Number(stored?.width_in), height=Number(stored?.height_in);
      if(![weight,length,width,height].every(n=>Number.isFinite(n) && n>0)) return reply({error:'This item has no saved package size on file.'},400);
      if(!purchase.shipping_address) return reply({error:'No return address on file for this order.'},400);

      const {data:seller,error:sellerError}=await service.from('profiles').select('shipping_address').eq('id',purchase.seller_id).maybeSingle();
      if(sellerError || !seller?.shipping_address) return reply({error:'The seller has no shipping address on file.'},400);

      const shipment=await fetch('https://api.goshippo.com/shipments/',{
        method:'POST',
        headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          address_from:shippoAddress(purchase.shipping_address,identity.user.email),
          address_to:shippoAddress(seller.shipping_address),
          parcels:[{length:String(length),width:String(width),height:String(height),distance_unit:'in',weight:String(weight),mass_unit:'oz'}],
          async:false,
        }),
      }).then(r=>r.json());

      const rates=(shipment.rates||[]).filter(rate=>rate.amount);
      if(!rates.length) return reply({error:'Could not get return shipping rates. Try again later.'},400);
      return reply({rates:rates.map(rate=>({rate_id:rate.object_id,provider:rate.provider,servicelevel:rate.servicelevel?.name||rate.servicelevel_token,amount_cents:Math.round(parseFloat(rate.amount)*100),estimated_days:rate.estimated_days||null}))});
    } catch {return reply({error:'Shipping service is temporarily unavailable. Try again later.'},503);}
  };
}

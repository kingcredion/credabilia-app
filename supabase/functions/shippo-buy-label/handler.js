import { normalizeRate, normalizeRates, maxLabelCents } from './shippingRates.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({createClient,env,fetchImpl=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to buy a label.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to buy a label.'},401);
      if(!env('SHIPPO_API_KEY')) return reply({error:'Shipping is not connected yet.'},503);

      const text=await request.text(); if(text.length>512) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const purchaseId=body?.purchase_id, rateId=body?.rate_id;
      if(typeof purchaseId!=='string' || !UUID_RE.test(purchaseId) || typeof rateId!=='string' || !rateId) return reply({error:'Invalid request.'},400);

      const {data:sale,error:saleError}=await client.from('purchases').select('id,shipped_at,label_url,tracking_number,tracking_url').eq('id',purchaseId).eq('seller_id',identity.user.id).maybeSingle();
      if(saleError || !sale) return reply({error:'Sale not found.'},404);
      // Idempotent: a retry after a lost response (network drop, timeout) must not buy a second label.
      if(sale.shipped_at) return reply({label_url:sale.label_url,tracking_number:sale.tracking_number,tracking_url:sale.tracking_url,shipped_at:sale.shipped_at});

      // The label is paid for by the platform, so the seller may only buy the service the buyer chose and paid for at checkout (an order with
      // no recorded choice, from before choices existed, is limited to the cheapest service). The rate is looked up on Shippo's side, so
      // nothing the browser says about it is trusted.
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
      // Shipping is held while a refund request is open on the order: a label bought now would be spent on a package the buyer may be sending back.
      const {data:openRefund}=await service.from('refund_requests').select('id').eq('purchase_id',purchaseId).in('status',['pending','contested','partial_offered','return_required','accepted']).limit(1);
      if(openRefund?.length) return reply({error:'There is an open refund request on this order. Wait until it is resolved before shipping.'},409);
      const {data:order}=await service.from('purchases').select('shipping_address,shipping_provider,shipping_service,shipping_quote_cents,seller_pays_shipping,price_cents,platform_fee_cents').eq('id',purchaseId).maybeSingle();
      const shippoHeaders={Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`};
      const rateInfo=await fetchImpl(`https://api.goshippo.com/rates/${encodeURIComponent(rateId)}`,{headers:shippoHeaders}).then(r=>r.json());
      if(!rateInfo?.object_id || !rateInfo.shipment) return reply({error:'That shipping option is not valid. Refresh and try again.'},400);
      const shipment=await fetchImpl(`https://api.goshippo.com/shipments/${encodeURIComponent(rateInfo.shipment)}`,{headers:shippoHeaders}).then(r=>r.json());
      const sameZip=(a,b)=>String(a||'').trim().slice(0,5)!=='' && String(a||'').trim().slice(0,5)===String(b||'').trim().slice(0,5);
      if(!sameZip(shipment?.address_to?.zip,order?.shipping_address?.zip)) return reply({error:'That shipping option does not belong to this order. Refresh and try again.'},400);
      const picked=normalizeRate(rateInfo);
      // Free-shipping order: the seller may buy any service, and its real shipping price (insurance is the buyer's) is charged to their
      // payout afterwards. It must fit inside the payout from this sale.
      const sellerCostCents=picked.amount_cents-picked.insurance_cents;
      if(order?.seller_pays_shipping) {
        if(!Number.isFinite(sellerCostCents) || sellerCostCents<=0) return reply({error:'That shipping option is not valid. Refresh and try again.'},400);
        if(Number(order.price_cents)-Number(order.platform_fee_cents)-sellerCostCents<0) return reply({error:'That service costs more than your payout from this sale. Pick a cheaper one.'},409);
      } else if(order?.shipping_provider && order?.shipping_service) {
        if(picked.provider.toLowerCase()!==order.shipping_provider.toLowerCase() || picked.service!==order.shipping_service) return reply({error:'You can only print the label for the shipping service your buyer chose.'},403);
        if(picked.amount_cents>maxLabelCents(order.shipping_quote_cents ?? picked.amount_cents)) return reply({error:"The carrier price for your buyer's shipping choice has changed a lot since checkout, so this label is paused. Contact support."},409);
      } else {
        const cheapest=normalizeRates(shipment.rates)[0];
        if(!cheapest || picked.amount_cents>cheapest.amount_cents) return reply({error:'Only the cheapest shipping service can be used for this order.'},403);
      }

      const transaction=await fetchImpl('https://api.goshippo.com/transactions/',{
        method:'POST',
        headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`,'Content-Type':'application/json'},
        body:JSON.stringify({rate:rateId,label_file_type:'PDF',async:false}),
      }).then(r=>r.json());

      if(transaction.status!=='SUCCESS') return reply({error:transaction.messages?.[0]?.text || 'Could not buy this label. Try a different carrier option.'},400);

      // record_shipment is service_role only (a seller must never be able to record a made-up shipment); the seller's id comes from the verified session above.
      const {error:recordError}=await service.rpc('record_shipment',{p_purchase_id:purchaseId,p_seller_id:identity.user.id,p_shippo_transaction_id:transaction.object_id,p_tracking_number:transaction.tracking_number,p_tracking_url:transaction.tracking_url_provider,p_label_url:transaction.label_url});
      if(recordError) return reply({error:`Label purchased, but could not be saved. Keep this tracking number: ${transaction.tracking_number}`},500);

      // Charge the seller the label's real shipping price. The label is already bought, so a failure here must not fail the request --
      // it alerts the operator, who settles it by hand, instead.
      if(order?.seller_pays_shipping) {
        const {error:chargeError}=await service.rpc('set_seller_shipping_charge',{p_purchase_id:purchaseId,p_seller_id:identity.user.id,p_charge_cents:sellerCostCents});
        if(chargeError) { try { await service.rpc('notify_operator_alert',{p_event:'Admin Alert: Payment Problem',p_properties:{summary:'A free-shipping label was bought but the seller was not charged for it.',reference:purchaseId,detail:'Label cost to seller: '+sellerCostCents+' cents. '+String(chargeError.message||'').slice(0,200)}}); } catch {} }
      }

      return reply({label_url:transaction.label_url,tracking_number:transaction.tracking_number,tracking_url:transaction.tracking_url_provider,shipped_at:new Date().toISOString()});
    } catch {return reply({error:'Shipping service is temporarily unavailable. Try again later.'},503);}
  };
}

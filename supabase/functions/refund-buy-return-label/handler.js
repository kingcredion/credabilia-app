const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Buyer-authenticated mirror of shippo-buy-label. Ownership is checked via a service-role read
// (refund_requests is RPC-only, same reasoning as refund-return-rates), but the actual save goes
// through record_return_shipment on the buyer's own client, so its auth.uid()=buyer_id guard and
// idempotency check stay the single source of truth for that write.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to buy a return label.'},401);
      if(!env('SHIPPO_API_KEY')) return reply({error:'Shipping is not connected yet.'},503);

      const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await userClient.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to buy a return label.'},401);

      const text=await request.text(); if(text.length>512) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const refundRequestId=body?.refund_request_id, rateId=body?.rate_id;
      if(typeof refundRequestId!=='string' || !UUID_RE.test(refundRequestId) || typeof rateId!=='string' || !rateId) return reply({error:'Invalid request.'},400);

      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data:refundRequest,error:requestError}=await service.from('refund_requests').select('id,buyer_id,status,return_shipped_at').eq('id',refundRequestId).maybeSingle();
      if(requestError || !refundRequest) return reply({error:'Refund request not found.'},404);
      if(identity.user.id!==refundRequest.buyer_id) return reply({error:'You can only buy a label for your own return.'},403);
      // Idempotent: a retry after a lost response (network drop, timeout) must not buy a second label.
      if(refundRequest.return_shipped_at) return reply({label_url:refundRequest.return_label_url,tracking_number:refundRequest.return_tracking_number,tracking_url:refundRequest.return_tracking_url,shipped_at:refundRequest.return_shipped_at});
      if(refundRequest.status!=='return_required') return reply({error:'A return label is not needed for this request.'},400);

      const transaction=await fetch('https://api.goshippo.com/transactions/',{
        method:'POST',
        headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`,'Content-Type':'application/json'},
        body:JSON.stringify({rate:rateId,label_file_type:'PDF',async:false}),
      }).then(r=>r.json());

      if(transaction.status!=='SUCCESS') return reply({error:transaction.messages?.[0]?.text || 'Could not buy this label. Try a different carrier option.'},400);

      const {error:recordError}=await userClient.rpc('record_return_shipment',{p_request_id:refundRequestId,p_shippo_transaction_id:transaction.object_id,p_tracking_number:transaction.tracking_number,p_tracking_url:transaction.tracking_url_provider,p_label_url:transaction.label_url});
      if(recordError) return reply({error:`Label purchased, but could not be saved. Keep this tracking number: ${transaction.tracking_number}`},500);

      return reply({label_url:transaction.label_url,tracking_number:transaction.tracking_number,tracking_url:transaction.tracking_url_provider,shipped_at:new Date().toISOString()});
    } catch {return reply({error:'Shipping service is temporarily unavailable. Try again later.'},503);}
  };
}

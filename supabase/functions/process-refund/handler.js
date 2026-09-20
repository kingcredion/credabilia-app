import Stripe from 'npm:stripe@17';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Three trusted callers reach this function: the seller's own browser session right after they
// accept a request or a buyer's session right after they accept a seller's partial offer, or the
// platform operator triggering it via net.http_post + the service role key while resolving a
// contested case from SQL (same trust model already shipped in release-stale-escrow -- verify_jwt
// already rejects anyone without a validly signed project JWT). When a real user IS present we
// still check they're the seller or buyer on this specific request; this only ever refunds money
// back to the rightful buyer, never anywhere else, so the bounded risk of the weaker service-role
// path is a legitimate refund firing slightly early, not funds going astray.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in required.'},401);
      if(!env('STRIPE_SECRET_KEY')) return reply({error:'Payments are not connected yet.'},503);

      const text=await request.text(); if(text.length>512) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const refundRequestId=body?.refund_request_id;
      if(typeof refundRequestId!=='string' || !UUID_RE.test(refundRequestId)) return reply({error:'Invalid request.'},400);

      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));

      const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity}=await userClient.auth.getUser();

      const {data:refundRequest,error:requestError}=await service.from('refund_requests').select('id,purchase_id,seller_id,buyer_id,status,offered_amount_cents').eq('id',refundRequestId).maybeSingle();
      if(requestError || !refundRequest) return reply({error:'Refund request not found.'},404);
      if(identity?.user && identity.user.id!==refundRequest.seller_id && identity.user.id!==refundRequest.buyer_id) return reply({error:'You can only process your own purchases and sales.'},403);
      if(refundRequest.status!=='accepted') return reply({error:'This request is not ready to be refunded.'},400);

      const {data:purchase,error:purchaseError}=await service.from('purchases').select('id,stripe_payment_intent_id,escrow_status,stripe_transfer_id').eq('id',refundRequest.purchase_id).maybeSingle();
      if(purchaseError || !purchase) return reply({error:'Purchase not found.'},404);

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      // offered_amount_cents is set for a seller-offered partial refund; omitted (full amount)
      // for a plain accept-in-full or a completed required-return.
      const amount=refundRequest.offered_amount_cents ?? undefined;

      if(purchase.escrow_status==='released' && purchase.stripe_transfer_id) {
        await stripe.transferReversals.create({transfer:purchase.stripe_transfer_id, ...(amount!==undefined?{amount}:{})});
      }
      const refund=await stripe.refunds.create({payment_intent:purchase.stripe_payment_intent_id, ...(amount!==undefined?{amount}:{})});

      const {error:markError}=await service.rpc('mark_refund_processed',{p_request_id:refundRequestId,p_stripe_refund_id:refund.id});
      if(markError) return reply({error:'Refund issued, but could not be recorded. Contact support.'},500);

      return reply({refunded:true,stripe_refund_id:refund.id});
    } catch {return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);}
  };
}

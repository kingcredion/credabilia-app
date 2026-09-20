import Stripe from 'npm:stripe@17';

// Called by Shippo's own servers, not by a signed-in user -- there is no Authorization header
// to check here, and this endpoint is reachable by anyone on the internet. The payload's own
// tracking_status is never trusted or written directly: it's untrusted input from an unverified
// caller. Instead it's used only as a lookup key (carrier + tracking number) to make our own
// authenticated call to Shippo's Track API, and only that response's status is ever persisted --
// a forged POST can at worst cause a harmless re-check of a real tracking number's real status.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('SHIPPO_API_KEY')) return reply({ok:true});
      const text=await request.text(); if(text.length>16384) return reply({error:'Invalid payload.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid payload.'},400);}
      const trackingNumber=body?.data?.tracking_number, carrier=body?.data?.carrier;
      if(typeof trackingNumber!=='string' || typeof carrier!=='string') return reply({ok:true});

      const track=await fetch(`https://api.goshippo.com/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`,{
        headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`},
      }).then(r=>r.json());
      const trackingStatus=track?.tracking_status?.status;
      if(typeof trackingStatus!=='string') return reply({ok:true});

      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {error}=await service.rpc('update_tracking_status',{p_tracking_number:trackingNumber,p_tracking_status:trackingStatus});
      if(error) console.error('update_tracking_status failed:',error.message);

      // Escrow release: delivery confirmed is the primary trigger (the daily
      // release-stale-escrow sweep is the fallback for tracking that never resolves).
      if(trackingStatus==='DELIVERED' && env('STRIPE_SECRET_KEY')) {
        try {
          const {data:purchase}=await service.from('purchases').select('id,seller_id,stripe_payment_intent_id,seller_payout_cents,escrow_status').eq('tracking_number',trackingNumber).maybeSingle();
          if(purchase && purchase.escrow_status==='held') await releaseEscrow(service,env,purchase);
        } catch (err) { console.error('escrow release failed:',err); }

        // Required-return leg: the same tracking table, keyed on refund_requests.return_tracking_number
        // instead of purchases.tracking_number. update_tracking_status above only ever touches
        // purchases, so refund_requests.return_tracking_status is set here directly.
        try {
          const {data:refundRequest}=await service.from('refund_requests').select('id,purchase_id,status').eq('return_tracking_number',trackingNumber).maybeSingle();
          if(refundRequest) {
            await service.from('refund_requests').update({return_tracking_status:trackingStatus}).eq('id',refundRequest.id);
            if(refundRequest.status==='return_required') {
              const {error:deliveredError}=await service.rpc('mark_return_delivered',{p_request_id:refundRequest.id});
              if(!deliveredError) await refundReturn(service,env,refundRequest.purchase_id,refundRequest.id);
            }
          }
        } catch (err) { console.error('return delivery refund failed:',err); }
      }

      return reply({ok:true});
    } catch (err) { console.error('shippo-webhook error:',err); return reply({error:'Could not process webhook.'},503); }
  };
}

// Same release logic is duplicated in release-stale-escrow/handler.js (the day-based fallback) --
// each edge function deploys as an isolated bundle, so this stays a small self-contained helper
// rather than a cross-function import, matching this codebase's existing style (e.g. shippoAddress
// is already duplicated between create-checkout-session and shippo-get-rates).
async function releaseEscrow(service, env, purchase) {
  const {data:account}=await service.from('stripe_accounts').select('stripe_account_id').eq('user_id',purchase.seller_id).maybeSingle();
  if(!account?.stripe_account_id) return;
  const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
  const intent=await stripe.paymentIntents.retrieve(purchase.stripe_payment_intent_id);
  const chargeId=typeof intent.latest_charge==='string' ? intent.latest_charge : intent.latest_charge?.id;
  if(!chargeId) return;
  const transfer=await stripe.transfers.create({amount:purchase.seller_payout_cents,currency:'usd',destination:account.stripe_account_id,source_transaction:chargeId});
  await service.rpc('mark_purchase_released',{p_purchase_id:purchase.id,p_stripe_transfer_id:transfer.id});
}

// Same held/released branching as process-refund/handler.js -- duplicated for the same reason
// releaseEscrow above is: each edge function deploys as an isolated bundle. A required return is
// always a full refund (mark_return_delivered never sets offered_amount_cents), so no amount is
// ever passed here.
async function refundReturn(service, env, purchaseId, refundRequestId) {
  const {data:purchase}=await service.from('purchases').select('id,stripe_payment_intent_id,escrow_status,stripe_transfer_id').eq('id',purchaseId).maybeSingle();
  if(!purchase) return;
  const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
  if(purchase.escrow_status==='released' && purchase.stripe_transfer_id) {
    await stripe.transferReversals.create({transfer:purchase.stripe_transfer_id});
  }
  const refund=await stripe.refunds.create({payment_intent:purchase.stripe_payment_intent_id});
  await service.rpc('mark_refund_processed',{p_request_id:refundRequestId,p_stripe_refund_id:refund.id});
}

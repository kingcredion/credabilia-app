import Stripe from 'npm:stripe@17';

// Called hourly by pg_cron (202609250019_escrow_release_schedule.sql, rescheduled hourly by
// 202610050096_hourly_payout_sweep.sql) via pg_net, authenticated with the real service role key as a
// Supabase-issued JWT -- verify_jwt on this function's deployment already rejects anyone who can't present that.
//
// What gets paid out is decided entirely in the database (due_releases): the seller's payout hold has passed (it starts at
// carrier-confirmed delivery or a verified pickup handoff, and its length depends on the seller's history and the sale price),
// there is no open refund request, and the seller is not flagged or banned. A parcel that carriers never mark delivered is paid
// only after 21 days in transit. This function only moves the money and records it.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('STRIPE_SECRET_KEY')) return reply({released:0});
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data:due,error:dueError}=await service.rpc('due_releases');
      if(dueError) { console.error('release-stale-escrow query failed:',dueError.message); return reply({error:'Could not check for payouts that are due.'},500); }

      let released=0;
      for(const purchase of due||[]) {
        try { if(await releaseEscrow(service,env,purchase)) released++; }
        catch (err) { console.error('release-stale-escrow failed for purchase',purchase.id,err); }
      }
      return reply({released});
    } catch (err) { console.error('release-stale-escrow error:',err); return reply({error:'Could not process payouts.'},503); }
  };
}

// Returns true when the money was moved and recorded. The Stripe idempotency key makes a retry after a failed database write
// (within Stripe's 24 hours) return the same transfer instead of paying the seller twice.
async function releaseEscrow(service, env, purchase) {
  const {data:account}=await service.from('stripe_accounts').select('stripe_account_id').eq('user_id',purchase.seller_id).maybeSingle();
  if(!account?.stripe_account_id) return false;
  const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
  const intent=await stripe.paymentIntents.retrieve(purchase.stripe_payment_intent_id);
  const chargeId=typeof intent.latest_charge==='string' ? intent.latest_charge : intent.latest_charge?.id;
  if(!chargeId) return false;
  const transfer=await stripe.transfers.create(
    {amount:purchase.seller_payout_cents,currency:'usd',destination:account.stripe_account_id,source_transaction:chargeId,metadata:{purchase_id:purchase.id,listing_id:purchase.listing_id,seller_id:purchase.seller_id}},
    {idempotencyKey:'release-'+purchase.id});
  const {error}=await service.rpc('mark_purchase_released',{p_purchase_id:purchase.id,p_stripe_transfer_id:transfer.id});
  if(error) {
    console.error('mark_purchase_released failed after the transfer:',error.message);
    try { await service.rpc('notify_operator_alert',{p_event:'Admin Alert: Payment Problem',p_properties:{summary:'A seller payout was sent in Stripe, but could not be recorded.',reference:transfer.id,detail:'Purchase '+purchase.id}}); } catch {}
    return false;
  }
  return true;
}

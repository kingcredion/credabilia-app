import Stripe from 'npm:stripe@17';

const STALE_DAYS=10;

// Called only by the daily pg_cron job (202609250019_escrow_release_schedule.sql) via pg_net,
// authenticated with the real service role key as a Supabase-issued JWT -- verify_jwt on this
// function's deployment already rejects anyone who can't present that, so no extra auth check
// is needed here (same reasoning as service-role-only RPCs like mark_purchase_released).
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('STRIPE_SECRET_KEY')) return reply({released:0});
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const cutoff=new Date(Date.now()-STALE_DAYS*24*60*60*1000).toISOString();
      const {data:stale,error}=await service.from('purchases').select('id,seller_id,stripe_payment_intent_id,seller_payout_cents,escrow_status').eq('escrow_status','held').not('shipped_at','is',null).lt('shipped_at',cutoff);
      if(error) { console.error('release-stale-escrow query failed:',error.message); return reply({error:'Could not check for stale escrow holds.'},500); }

      let released=0;
      for(const purchase of stale||[]) {
        try { await releaseEscrow(service,env,purchase); released++; }
        catch (err) { console.error('release-stale-escrow failed for purchase',purchase.id,err); }
      }
      return reply({released});
    } catch (err) { console.error('release-stale-escrow error:',err); return reply({error:'Could not process stale escrow holds.'},503); }
  };
}

// Same release logic as shippo-webhook/handler.js (the delivery-triggered path) -- each edge
// function deploys as an isolated bundle, so this stays a small self-contained helper rather
// than a cross-function import, matching this codebase's existing style (e.g. shippoAddress is
// already duplicated between create-checkout-session and shippo-get-rates).
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

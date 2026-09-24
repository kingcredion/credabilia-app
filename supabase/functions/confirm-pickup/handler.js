import Stripe from 'npm:stripe@17';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Buyer-triggered: confirms receipt of a pickup purchase and, if that succeeds (seller had
// already marked it picked up, and it hadn't already been confirmed -- confirm_pickup_received
// enforces both atomically), releases escrow the same way shippo-webhook/release-stale-escrow do
// on delivery -- a real Stripe Transfer, then mark_purchase_released. The buyer's own client only
// ever gets to call confirm_pickup_received (which just sets a timestamp); the actual money
// movement happens here, server-side, via a service-role client the buyer never has access to.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to confirm pickup.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to confirm pickup.'},401);

      const text=await request.text(); if(text.length>1024) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const purchaseId=body?.purchase_id;
      if(typeof purchaseId!=='string' || !UUID_RE.test(purchaseId)) return reply({error:'Invalid request.'},400);

      const {data:purchase,error:confirmError}=await client.rpc('confirm_pickup_received',{p_purchase_id:purchaseId});
      if(confirmError) return reply({error:confirmError.message},400);

      if(env('STRIPE_SECRET_KEY')) {
        const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
        try { await releaseEscrow(service,env,purchase); }
        catch (err) { console.error('confirm-pickup escrow release failed for purchase',purchase.id,err); }
      }
      return reply({ok:true});
    } catch {return reply({error:'Could not confirm pickup right now. Try again later.'},503);}
  };
}

// Identical to shippo-webhook's and release-stale-escrow's releaseEscrow -- each edge function
// deploys as an isolated bundle, so this stays a small self-contained helper rather than a
// cross-function import, matching this codebase's existing style.
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

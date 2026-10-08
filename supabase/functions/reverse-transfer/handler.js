import Stripe from 'npm:stripe@17';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// An operator takes a seller's payout back after a card chargeback on an order the seller was already paid for. Stripe's own guidance for that
// case is to reverse the transfer. Only an operator can call this (the database function checks), and only for an order with a recorded
// chargeback, whose seller was already paid, and whose transfer has not already been reversed.
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
      const purchaseId=body?.purchase_id;
      if(typeof purchaseId!=='string' || !UUID_RE.test(purchaseId)) return reply({error:'Invalid request.'},400);

      const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await userClient.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in required.'},401);

      // The database decides whether this caller is an operator and whether the order is eligible.
      const {data:info,error:infoError}=await userClient.rpc('admin_transfer_reversal_info',{p_purchase_id:purchaseId});
      if(infoError) return reply({error:/Not authorized/i.test(infoError.message||'')?'Only an operator can do this.':'Order not found.'},/Not authorized/i.test(infoError.message||'')?403:404);
      if(!info?.eligible) return reply({error:info?.already_reversed?'This payout has already been taken back.':!info?.has_dispute?'There is no recorded chargeback on this order.':'This order is not eligible: the seller was not paid before the chargeback, or there is no transfer to reverse.'},409);

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      // Reverse whatever part of the transfer has not been reversed yet.
      const transfer=await stripe.transfers.retrieve(info.transfer_id);
      const remaining=Number(transfer.amount||0)-Number(transfer.amount_reversed||0);
      let reversalId=null, reversedCents=0;
      if(remaining>0) {
        try {
          const reversal=await stripe.transfers.createReversal(info.transfer_id,{amount:remaining,metadata:{purchase_id:purchaseId,operator_id:identity.user.id,reason:'card_chargeback'}},{idempotencyKey:'dispute-reverse-'+purchaseId});
          reversalId=reversal.id; reversedCents=remaining;
        } catch(error) {
          // Typically the seller's Stripe balance does not hold enough to cover it. Say so; nothing was changed.
          return reply({error:'Stripe could not reverse the transfer: '+String(error?.message||'unknown error').slice(0,200)},409);
        }
      }
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {error:recordError}=await service.rpc('record_transfer_reversal',{p_purchase_id:purchaseId,p_reversal_id:reversalId,p_amount_cents:reversedCents,p_operator:identity.user.id});
      if(recordError) return reply({error:'The transfer was reversed in Stripe, but it could not be recorded here. Reversal '+(reversalId||'none')+'.',reversal_id:reversalId},500);
      return reply({reversed:true,amount_cents:reversedCents,reversal_id:reversalId});
    } catch {
      return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);
    }
  };
}

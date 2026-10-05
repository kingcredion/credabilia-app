import Stripe from 'npm:stripe@17';

// Stripe calls this endpoint directly with its own Stripe-Signature header, not a Supabase
// user JWT -- there is no end-user session to scope RLS to, so this is the one function in
// the project that deliberately uses a service-role client. Every write still goes through
// the same narrowly-granted service_role-only functions, never a raw table write.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'stripe-signature, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  // Best-effort email to the operator (kingcredion@credabilia.com) when money moved but we could not record it. Never throws.
  const alertOperator=async(client,props)=>{try{await client.rpc('notify_operator_alert',{p_event:'Admin Alert: Payment Problem',p_properties:props});}catch{}};
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    let client,object,event;
    try {
      if(!env('STRIPE_SECRET_KEY') || !env('STRIPE_WEBHOOK_SECRET')) return reply({error:'Webhook is not connected yet.'},503);
      const signature=request.headers.get('Stripe-Signature');
      const body=await request.text();
      if(!signature) return reply({error:'Missing signature.'},400);

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      // Two Stripe event destinations point at this same URL (account-scope checkout events,
      // and connected-account-scope account.updated events) -- each has its own signing
      // secret, so STRIPE_WEBHOOK_SECRET may be a comma-separated list; try each in turn.
      const secrets=(env('STRIPE_WEBHOOK_SECRET')||'').split(',').map(value=>value.trim()).filter(Boolean);
      for(const secret of secrets) {
        try { event=await stripe.webhooks.constructEventAsync(body,signature,secret,undefined,Stripe.createSubtleCryptoProvider()); break; }
        catch {}
      }
      if(!event) return reply({error:'Invalid signature.'},400);

      client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      object=event.data.object;
      let result;
      if(event.type==='checkout.session.completed') {
        if(object.payment_status!=='paid') return reply({received:true});
        result=await client.rpc('finalize_checkout_session',{p_stripe_session_id:object.id,p_stripe_payment_intent_id:object.payment_intent});
      } else if(event.type==='checkout.session.expired') {
        result=await client.rpc('expire_checkout_session',{p_stripe_session_id:object.id});
      } else if(event.type==='account.updated') {
        result=await client.rpc('update_stripe_account_status',{p_stripe_account_id:object.id,p_charges_enabled:object.charges_enabled,p_details_submitted:object.details_submitted});
      }
      if(result?.error) {
        if(event.type==='checkout.session.completed') await alertOperator(client,{summary:'A customer paid, but the order could not be recorded.',reference:object.id,detail:String(result.error.message||'').slice(0,300)});
        return reply({error:'Webhook handling failed.'},500);
      }
      // Best effort, never affects the webhook's result: remember which card / bank account this member used, so a banned
      // member's payment details can be recognised on a new account.
      if(event.type==='checkout.session.completed') await recordCardFingerprint(client,stripe,object,result?.data,alertOperator);
      else if(event.type==='account.updated') await recordBankFingerprints(client,object,alertOperator);
      return reply({received:true});
    } catch {
      if(client && event?.type==='checkout.session.completed') await alertOperator(client,{summary:'A customer paid, but the order could not be recorded.',reference:object?.id,detail:'The webhook crashed while handling the payment.'});
      return reply({error:'Webhook handling failed.'},500);
    }
  };
}

// Records the card fingerprint of a paid order. A card already tied to a banned member holds that one order for review.
async function recordCardFingerprint(client, stripe, session, purchaseId, alertOperator) {
  try {
    if(!purchaseId || !session.payment_intent) return;
    const intent=await stripe.paymentIntents.retrieve(session.payment_intent,{expand:['latest_charge']});
    const fingerprint=intent.latest_charge?.payment_method_details?.card?.fingerprint;
    if(!fingerprint) return;
    const {data:purchase}=await client.from('purchases').select('buyer_id').eq('id',purchaseId).maybeSingle();
    if(!purchase) return;
    const {data}=await client.rpc('record_payment_fingerprint',{p_user_id:purchase.buyer_id,p_kind:'card',p_fingerprint:fingerprint,p_purchase_id:purchaseId});
    if(data?.blocked) await alertOperator(client,{summary:'A payment came from a card tied to a banned member. The order is on hold.',reference:session.id,detail:'Purchase '+purchaseId});
  } catch {}
}

// Records the bank-account fingerprints on a seller's Stripe account. A bank account already tied to a banned member flags the
// seller's payouts for review.
async function recordBankFingerprints(client, account, alertOperator) {
  try {
    const fingerprints=(account.external_accounts?.data||[]).map(entry=>entry.fingerprint).filter(Boolean);
    if(!fingerprints.length) return;
    const {data:row}=await client.from('stripe_accounts').select('user_id').eq('stripe_account_id',account.id).maybeSingle();
    if(!row) return;
    for(const fingerprint of fingerprints) {
      const {data}=await client.rpc('record_payment_fingerprint',{p_user_id:row.user_id,p_kind:'bank',p_fingerprint:fingerprint});
      if(data?.blocked) await alertOperator(client,{summary:'A seller connected a bank account tied to a banned member. Their payouts are on hold.',reference:account.id,detail:'Member '+row.user_id});
    }
  } catch {}
}

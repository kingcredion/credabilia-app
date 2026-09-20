import Stripe from 'npm:stripe@17';

// Stripe calls this endpoint directly with its own Stripe-Signature header, not a Supabase
// user JWT -- there is no end-user session to scope RLS to, so this is the one function in
// the project that deliberately uses a service-role client. Every write still goes through
// the same narrowly-granted service_role-only functions, never a raw table write.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'stripe-signature, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
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
      let event;
      for(const secret of secrets) {
        try { event=await stripe.webhooks.constructEventAsync(body,signature,secret,undefined,Stripe.createSubtleCryptoProvider()); break; }
        catch {}
      }
      if(!event) return reply({error:'Invalid signature.'},400);

      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const object=event.data.object;
      let result;
      if(event.type==='checkout.session.completed') {
        if(object.payment_status!=='paid') return reply({received:true});
        result=await client.rpc('finalize_checkout_session',{p_stripe_session_id:object.id,p_stripe_payment_intent_id:object.payment_intent});
      } else if(event.type==='checkout.session.expired') {
        result=await client.rpc('expire_checkout_session',{p_stripe_session_id:object.id});
      } else if(event.type==='account.updated') {
        result=await client.rpc('update_stripe_account_status',{p_stripe_account_id:object.id,p_charges_enabled:object.charges_enabled,p_details_submitted:object.details_submitted});
      }
      if(result?.error) return reply({error:'Webhook handling failed.'},500);
      return reply({received:true});
    } catch {return reply({error:'Webhook handling failed.'},500);}
  };
}

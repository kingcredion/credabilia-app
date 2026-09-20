import Stripe from 'npm:stripe@17';

export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to confirm your purchase.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to confirm your purchase.'},401);

      const text=await request.text(); if(text.length>256) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const stripeSessionId=body?.stripe_session_id;
      if(typeof stripeSessionId!=='string' || !stripeSessionId) return reply({error:'Invalid request.'},400);

      // RLS scopes this to sessions the caller is the buyer or seller of.
      const {data:existing}=await client.from('checkout_sessions').select('status').eq('stripe_checkout_session_id',stripeSessionId).maybeSingle();
      if(!existing) return reply({error:'Checkout session not found.'},404);
      if(existing.status==='completed') return reply({status:'completed'});

      if(!env('STRIPE_SECRET_KEY')) return reply({error:'Payments are not connected yet.'},503);
      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      const session=await stripe.checkout.sessions.retrieve(stripeSessionId);
      if(session.payment_status==='paid') {
        const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
        const {error:finalizeError}=await service.rpc('finalize_checkout_session',{p_stripe_session_id:stripeSessionId,p_stripe_payment_intent_id:session.payment_intent});
        if(finalizeError) return reply({error:'Could not finalize your purchase. Try again shortly.'},500);
        return reply({status:'completed'});
      }
      return reply({status:'pending'});
    } catch {return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);}
  };
}

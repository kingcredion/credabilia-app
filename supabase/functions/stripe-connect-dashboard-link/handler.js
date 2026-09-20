import Stripe from 'npm:stripe@17';

export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to open your Stripe dashboard.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to open your Stripe dashboard.'},401);

      const {data:existing}=await client.from('stripe_accounts').select('stripe_account_id,charges_enabled').maybeSingle();
      if(!existing?.stripe_account_id || !existing.charges_enabled) return reply({error:'Finish payment setup first.'},400);
      if(!env('STRIPE_SECRET_KEY')) return reply({error:'Payouts are not connected yet.'},503);
      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});

      const link=await stripe.accounts.createLoginLink(existing.stripe_account_id);
      return reply({url:link.url});
    } catch {return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);}
  };
}

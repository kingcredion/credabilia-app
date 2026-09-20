import Stripe from 'npm:stripe@17';

export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to check payout status.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to check payout status.'},401);

      const {data:existing,error:existingError}=await client.from('stripe_accounts').select('stripe_account_id').maybeSingle();
      if(existingError) return reply({error:'Could not check payout status. Try again later.'},500);
      if(!existing?.stripe_account_id) return reply({connected:false});
      if(!env('STRIPE_SECRET_KEY')) return reply({error:'Payouts are not connected yet.'},503);
      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});

      const account=await stripe.accounts.retrieve(existing.stripe_account_id);
      // Only the service role may write charges_enabled/details_submitted -- this is
      // Stripe's own verified truth, not something the caller can assert about themselves.
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {error:statusError}=await service.rpc('update_stripe_account_status',{p_stripe_account_id:existing.stripe_account_id,p_charges_enabled:account.charges_enabled,p_details_submitted:account.details_submitted});
      if(statusError) return reply({error:'Could not save payout status. Try again later.'},500);

      return reply({connected:true,charges_enabled:account.charges_enabled,details_submitted:account.details_submitted});
    } catch {return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);}
  };
}

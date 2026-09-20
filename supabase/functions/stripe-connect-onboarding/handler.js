import Stripe from 'npm:stripe@17';

export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to connect payouts.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to connect payouts.'},401);
      if(!env('STRIPE_SECRET_KEY')) return reply({error:'Payouts are not connected yet.'},503);
      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});

      // A swallowed read error here would fall through to account creation below as if
      // no account existed yet -- explicitly bail out instead of risking a duplicate Stripe account.
      const {data:existing,error:existingError}=await client.from('stripe_accounts').select('stripe_account_id').maybeSingle();
      if(existingError) return reply({error:'Could not check your existing Stripe account. Try again.'},500);
      let stripeAccountId=existing?.stripe_account_id;
      if(!stripeAccountId) {
        // An idempotency key means a retried request (network blip, double-click) reuses the
        // same Stripe account instead of creating an orphaned second one for this user.
        const account=await stripe.accounts.create({type:'express',email:identity.user.email,capabilities:{card_payments:{requested:true},transfers:{requested:true}}},{idempotencyKey:'connect-onboard-'+identity.user.id});
        stripeAccountId=account.id;
        const {error:saveError}=await client.rpc('save_stripe_account',{p_stripe_account_id:stripeAccountId});
        if(saveError) return reply({error:'Could not save your Stripe account. Try again.'},500);
      }

      const link=await stripe.accountLinks.create({
        account:stripeAccountId,
        refresh_url:`${env('APP_URL')}/?stripe_onboarding=refresh`,
        return_url:`${env('APP_URL')}/?stripe_onboarding=return`,
        type:'account_onboarding',
      });
      return reply({url:link.url});
    } catch {return reply({error:'Stripe onboarding is temporarily unavailable. Try again later.'},503);}
  };
}

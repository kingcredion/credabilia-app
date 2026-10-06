import Stripe from 'npm:stripe@17';

// Starts a Stripe "save a card" page for a member who wants to bid. Nothing is charged: the saved card only shows the member is a real
// bidder (every bid is a binding commitment to buy). The stripe-webhook records the card when Stripe confirms it was saved.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to bid.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to bid.'},401);
      if(!env('STRIPE_SECRET_KEY')) return reply({error:'Card setup is not connected yet.'},503);

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      const session=await stripe.checkout.sessions.create({
        mode:'setup',
        payment_method_types:['card'],
        // Shown on Stripe's page under the card form. The $0 line some banks show for a saved card is a card check, not a charge, and says so.
        custom_text:{submit:{message:'Credabilia saves this card only to confirm you are a real bidder. Nothing is charged now. Your bank may show a $0 card check, which is not a charge. Every bid you place is a commitment to buy.'}},
        client_reference_id:identity.user.id,
        success_url:`${env('APP_URL')}/?bidcard=success`,
        cancel_url:`${env('APP_URL')}/?bidcard=cancel`,
      });
      return reply({url:session.url});
    } catch {return reply({error:'Card setup is temporarily unavailable. Try again later.'},503);}
  };
}

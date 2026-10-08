import Stripe from 'npm:stripe@17';

// Operator-only. Reads each seller's connected Stripe account and reports whether Stripe may debit the seller's bank when their Stripe balance goes
// negative (settings.payouts.debit_negative_balances). Because the platform covers a negative balance, this should be on for every seller. With
// {fix:true} it turns the setting on for any account where it is off.
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
      let body;try{body=text?JSON.parse(text):{};}catch{return reply({error:'Invalid request.'},400);}
      const fix=body?.fix===true;

      const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await userClient.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in required.'},401);
      const {data:isOperator}=await userClient.rpc('is_operator');
      if(isOperator!==true) return reply({error:'Only an operator can do this.'},403);

      const stripe=new Stripe(env('STRIPE_SECRET_KEY'),{apiVersion:'2024-06-20',httpClient:Stripe.createFetchHttpClient()});
      const accounts=[]; let startingAfter;
      for(let page=0;page<10;page++) {
        const result=await stripe.accounts.list({limit:100,...(startingAfter?{starting_after:startingAfter}:{})});
        accounts.push(...result.data);
        if(!result.has_more || !result.data.length) break;
        startingAfter=result.data[result.data.length-1].id;
      }
      const rows=[];
      for(const account of accounts) {
        let debit=account.settings?.payouts?.debit_negative_balances===true, changed=false, error=null;
        if(fix && !debit) {
          try { await stripe.accounts.update(account.id,{settings:{payouts:{debit_negative_balances:true}}}); debit=true; changed=true; }
          catch(err) { error=String(err?.message||'unknown error').slice(0,160); }
        }
        rows.push({id:account.id,email:account.email||null,debit_negative_balances:debit,changed,error,payouts_enabled:account.payouts_enabled===true,losses:account.controller?.losses?.payments||null});
      }
      return reply({accounts:rows,off:rows.filter(row=>!row.debit_negative_balances).length});
    } catch {
      return reply({error:'Payment service is temporarily unavailable. Try again later.'},503);
    }
  };
}

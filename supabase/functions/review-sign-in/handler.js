// Signs Apple's App Review team into the test account without an emailed code -- but only while the switch in app_review_access is ON and only for
// the one address stored there. Anything else (switch off, any other address) gets the same quiet { enabled: false }, so the app falls back to the
// normal emailed code and this endpoint reveals nothing about which addresses exist. Called by the signed-out app, so this function does not need a JWT.
// The account itself is walled in by database triggers (see 202610070133_app_review_account.sql): it cannot buy, bid, or publish to buyers.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store'}});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const text=await request.text(); if(text.length>512) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const asked=typeof body?.email==='string' ? body.email.trim().toLowerCase() : '';
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
      const {data:row,error:rowError}=await service.from('app_review_access').select('enabled,email').maybeSingle();
      if(rowError) return reply({error:'Review sign-in is unavailable.'},503);
      const allowed=String(row?.email||'').trim().toLowerCase();
      // Probe: lets the app show the Review Team button only while review sign-in is switched on. Says nothing about any address.
      if(body?.probe===true) return reply({enabled:!!row?.enabled});
      if(!row?.enabled || !asked || asked!==allowed) return reply({enabled:false});
      const {data,error}=await service.auth.admin.generateLink({type:'magiclink',email:allowed});
      const tokenHash=data?.properties?.hashed_token;
      if(error || !tokenHash) return reply({error:'Review sign-in is unavailable.'},503);
      return reply({enabled:true,token_hash:tokenHash,type:data.properties.verification_type || 'magiclink'});
    } catch { return reply({error:'Review sign-in is unavailable.'},503); }
  };
}

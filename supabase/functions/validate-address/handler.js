function shippoAddress(a) {
  return {name:a?.name||'',street1:a?.street1||'',street2:a?.street2||'',city:a?.city||'',state:a?.state||'',zip:a?.zip||'',country:a?.country||'',phone:a?.phone||''};
}

export function createHandler({createClient,env,fetcher=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to verify an address.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to verify an address.'},401);
      if(!env('SHIPPO_API_KEY')) return reply({error:'Address verification is not connected yet.'},503);

      const text=await request.text(); if(text.length>2048) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const address=body?.address;
      if(!address?.street1?.trim() || !address?.city?.trim() || !address?.state?.trim() || !address?.zip?.trim() || !address?.country?.trim()) return reply({error:'Fill in street, city, state, ZIP, and country first.'},400);

      const response=await fetcher('https://api.goshippo.com/addresses/',{
        method:'POST',
        headers:{Authorization:`ShippoToken ${env('SHIPPO_API_KEY')}`,'Content-Type':'application/json'},
        body:JSON.stringify({...shippoAddress(address),validate:true}),
      });
      if(!response.ok) return reply({error:'Could not verify this address right now.'},502);
      const result=await response.json();
      return reply({
        is_valid:result?.validation_results?.is_valid ?? null,
        messages:(result?.validation_results?.messages||[]).map(m=>m.text).filter(Boolean),
        suggested:{name:result?.name||address.name||'',street1:result?.street1||'',street2:result?.street2||'',city:result?.city||'',state:result?.state||'',zip:result?.zip||'',country:result?.country||address.country||'',phone:result?.phone||address.phone||''},
      });
    } catch {return reply({error:'Address verification is temporarily unavailable.'},503);}
  };
}

// Backs King Credion's Vapi phone/voice assistant with real marketplace data via Vapi's
// function-tool webhook contract: https://docs.vapi.ai/tools/custom-tools
// Server-to-server only (Vapi calling us, not a signed-in user), so this is authenticated by a
// shared secret header -- matching the send-push pattern -- rather than a Supabase user JWT.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, x-vapi-secret','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('VAPI_TOOL_SECRET') || request.headers.get('x-vapi-secret')!==env('VAPI_TOOL_SECRET')) return reply({error:'Unauthorized.'},401);

      const text=await request.text(); if(text.length>8192) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const toolCalls=body?.message?.toolCallList;
      if(!Array.isArray(toolCalls)) return reply({results:[]});

      // Anon key only -- browse_listings_with_certificates() is public marketplace data, the same
      // thing anyone sees browsing the site signed out. No caller identity to scope to on a phone call.
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'));
      const results=[];
      for(const call of toolCalls) {
        let result;
        try {
          if(call.name==='check_item_availability') result=await checkItemAvailability(client,call.arguments?.query);
          else result='That tool is not available.';
        } catch { result='Sorry, that lookup failed. Please try again.'; }
        results.push({toolCallId:call.id,result});
      }
      return reply({results});
    } catch {return reply({error:'Voice tools are temporarily unavailable.'},503);}
  };
}

async function checkItemAvailability(client,query) {
  const clean=String(query||'').trim().slice(0,200);
  if(!clean) return 'No item description was given.';
  const {data,error}=await client.rpc('browse_listings_with_certificates');
  if(error || !Array.isArray(data)) return 'The listings could not be checked right now.';
  const needle=clean.toLowerCase();
  const matches=data.filter(item=>item.title?.toLowerCase().includes(needle) || item.category?.toLowerCase().includes(needle)).slice(0,3);
  if(!matches.length) return `No active listing matching "${clean}" was found on Credabilia right now.`;
  return matches.map(item=>`"${item.title}" (${item.category}) is available for $${(item.price_cents/100).toFixed(2)}, credibility score ${item.credibility_score} out of 100.`).join(' ');
}

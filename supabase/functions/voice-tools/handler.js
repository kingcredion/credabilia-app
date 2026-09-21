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

      // Vapi's real tool-calls payload embeds the whole call so far -- full transcript with
      // word-level timestamps, the assistant's entire config and system prompt, etc -- which grows
      // every turn. This is a sanity ceiling against outright abuse, not a real expected size.
      const text=await request.text(); if(text.length>2_000_000) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const toolCalls=body?.message?.toolCallList;
      if(!Array.isArray(toolCalls)) return reply({results:[]});

      // Anon key only -- browse_listings_with_certificates() is public marketplace data, the same
      // thing anyone sees browsing the site signed out. No caller identity to scope to on a phone call.
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'));
      const results=[];
      for(const call of toolCalls) {
        const name=call.name ?? call.function?.name;
        let args=call.arguments ?? call.function?.arguments;
        if(typeof args==='string'){try{args=JSON.parse(args);}catch{args={};}}
        let result;
        try {
          if(name==='check_item_availability') result=await checkItemAvailability(client,args?.query);
          else result='That tool is not available.';
        } catch { result='Sorry, that lookup failed. Please try again.'; }
        results.push({toolCallId:call.id,result});
      }
      return reply({results});
    } catch {return reply({error:'Voice tools are temporarily unavailable.'},503);}
  };
}

// Callers say names the way people actually say them ("Barry Bonds"), which won't substring-match
// a listing titled slightly differently ("Barry Bond signed baseball"). Word-level matching with
// light stemming tolerates plural/singular mismatches without needing an exact phrase.
const STOPWORDS=new Set(['the','and','for','are','was','were','has','have','had','with','that','this','please','anything','something','uh','um','item','items','look','looking','want','wanted','get','got','find','about','any','there','here','also','just','you','your','can','could','would','should','know','tell','see']);
function normalizeWords(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(' ').filter(Boolean);}
function stem(w){return w.length>3 && w.endsWith('s') ? w.slice(0,-1) : w;}

async function checkItemAvailability(client,query) {
  const clean=String(query||'').trim().slice(0,200);
  if(!clean) return 'No item description was given.';
  const {data,error}=await client.rpc('browse_listings_with_certificates');
  if(error || !Array.isArray(data)) return 'The listings could not be checked right now.';
  const queryWords=normalizeWords(clean).filter(w=>w.length>=3 && !STOPWORDS.has(w)).map(stem);
  const needle=clean.toLowerCase();
  const scored=data.map(item=>{
    const haystack=`${item.title||''} ${item.category||''}`;
    if(!queryWords.length) return {item,score:haystack.toLowerCase().includes(needle)?1:0};
    const haystackWords=normalizeWords(haystack).map(stem);
    return {item,score:queryWords.filter(w=>haystackWords.includes(w)).length};
  });
  const threshold=queryWords.length ? Math.max(1,Math.ceil(queryWords.length/2)) : 1;
  const matches=scored.filter(s=>s.score>=threshold).sort((a,b)=>b.score-a.score).map(s=>s.item).slice(0,3);
  if(!matches.length) return `No active listing matching "${clean}" was found on Credabilia right now.`;
  return matches.map(item=>`"${item.title}" (${item.category}) is available for $${(item.price_cents/100).toFixed(2)}, credibility score ${item.credibility_score} out of 100.`).join(' ');
}

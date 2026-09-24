// Called only by the 15-minute pg_cron job (202609300055_signature_reference_index_schedule.sql)
// via pg_net, authenticated with the real service role key as a Supabase-issued JWT -- verify_jwt
// on this function's deployment already rejects anyone who can't present that (same reasoning as
// close-auctions/release-stale-escrow/retry-background-removal). Backfills embeddings for
// signature_references rows captured since the last run -- decoupled from the publish request so
// listing creation never waits on an embeddings call.
export function createHandler({createClient,env,fetcher=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('OPENAI_API_KEY')) return reply({processed:0,succeeded:0});
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data:pending,error}=await service.rpc('list_pending_signature_embeddings',{p_limit:25});
      if(error) { console.error('index-signature-references query failed:',error.message); return reply({error:'Could not check for pending references.'},500); }

      let succeeded=0;
      for(const row of pending||[]) {
        try { if(await embedOne(service,env,fetcher,row)) succeeded++; }
        catch (err) { console.error('index-signature-references failed for',row.id,err); }
      }
      return reply({processed:(pending||[]).length,succeeded});
    } catch (err) { console.error('index-signature-references error:',err); return reply({error:'Could not process pending references.'},503); }
  };
}

async function embedOne(service, env, fetcher, row) {
  const response=await fetcher('https://api.openai.com/v1/embeddings',{
    method:'POST',headers:{Authorization:'Bearer '+env('OPENAI_API_KEY'),'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),
    body:JSON.stringify({model:'text-embedding-3-small',input:row.description}),
  });
  if(!response.ok) return false;
  const result=await response.json();
  const vector=result.data?.[0]?.embedding;
  if(!Array.isArray(vector) || vector.length!==1536) return false;
  const {error}=await service.rpc('set_signature_embedding',{p_id:row.id,p_embedding:'['+vector.join(',')+']'});
  return !error;
}

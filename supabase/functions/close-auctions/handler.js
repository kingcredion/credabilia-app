// Called only by the hourly pg_cron job (202609300036_auction_close_schedule.sql) via pg_net,
// authenticated with the real service role key as a Supabase-issued JWT -- verify_jwt on this
// function's deployment already rejects anyone who can't present that, same as release-stale-escrow.
export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data,error}=await service.rpc('settle_ended_auctions');
      if(error) { console.error('close-auctions failed:',error.message); return reply({error:'Could not settle ended auctions.'},500); }
      return reply({settled:data});
    } catch (err) { console.error('close-auctions error:',err); return reply({error:'Could not process ended auctions.'},503); }
  };
}

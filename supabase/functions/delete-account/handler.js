export function createHandler({createClient,env}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in required.'},401);
      const userClient=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await userClient.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in required.'},401);

      // delete_my_account() runs the "no active listings / no open refunds" guard and anonymizes
      // the profile row; it deliberately never touches auth.users (see its own migration comment --
      // purchases/listings/etc reference profiles without cascade, so a hard delete there would
      // either fail or destroy transaction history). Only after that succeeds do we soft-delete
      // the auth identity below -- GoTrue's soft delete scrambles the login without removing the
      // row, so every foreign key pointing at this profile stays intact.
      const {error:guardError}=await userClient.rpc('delete_my_account');
      if(guardError) return reply({error:guardError.message},400);

      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {error:deleteError}=await service.auth.admin.deleteUser(identity.user.id,true);
      if(deleteError) return reply({error:'Your data was cleared, but sign-out failed. Contact support.'},500);

      return reply({deleted:true});
    } catch {return reply({error:'Could not delete your account right now. Try again later.'},503);}
  };
}

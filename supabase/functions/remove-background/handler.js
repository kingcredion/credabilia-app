// Stateless proxy to Photoroom's Remove Background API, same shape as extract-certificate:
// the client sends a path to an already-uploaded photo, this downloads it through the user's own
// RLS-scoped client (never service-role -- ownership is enforced by Storage's own policies, not
// by us re-checking it), forwards it to Photoroom, and streams the cutout straight back. Nothing
// is written to Storage here; the client re-uploads the result itself via the normal upload path.
export function createHandler({createClient,env,fetcher=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      const authorization=request.headers.get('Authorization');
      if(!authorization?.startsWith('Bearer ')) return reply({error:'Sign in to remove a background.'},401);
      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError || !identity?.user) return reply({error:'Sign in to remove a background.'},401);
      if(!env('PHOTOROOM_API_KEY')) return reply({error:'Background removal is not connected yet.'},503);

      const text=await request.text(); if(text.length>1024) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const path=body?.path;
      if(typeof path!=='string' || !new RegExp('^'+identity.user.id+'/[0-9a-f-]{36}[.]jpg$').test(path)) return reply({error:'Choose one of your uploaded item photos.'},403);

      const {data:blob,error:downloadError}=await client.storage.from('listing-media').download(path);
      if(downloadError || !blob || blob.size>5242880 || blob.type!=='image/jpeg') return reply({error:'Photo could not be read.'},400);
      const bytes=new Uint8Array(await blob.arrayBuffer());
      if(bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255) return reply({error:'Choose a valid JPEG photo.'},400);

      const {error:quotaError}=await client.rpc('consume_background_removal');
      if(quotaError) return reply({error:'Background removal limit reached or selling permission unavailable. Try again later.'},429);

      const form=new FormData();
      form.append('image_file', new Blob([bytes],{type:'image/jpeg'}), 'photo.jpg');
      form.append('format','png'); // transparent cutout -- no bg_color -- so it sits cleanly on the item card in both light and dark mode
      const response=await fetcher('https://sdk.photoroom.com/v1/segment',{
        method:'POST', headers:{'x-api-key':env('PHOTOROOM_API_KEY')}, body:form, signal:AbortSignal.timeout(30000),
      });
      if(!response.ok) return reply({error:'The background could not be removed. Try a different photo.'},502);
      const result=new Uint8Array(await response.arrayBuffer());
      // application/octet-stream, not image/png: supabase-js's functions.invoke() only parses a
      // response body as a Blob for octet-stream/pdf Content-Types -- anything else (including
      // image/png) falls through to response.text(), which would corrupt the binary PNG bytes.
      return new Response(result,{status:200,headers:{...cors,'Content-Type':'application/octet-stream'}});
    } catch {return reply({error:'Background removal is temporarily unavailable. Try again later.'},503);}
  };
}

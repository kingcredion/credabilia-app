// Called only by the 15-minute pg_cron job (202609300050_background_removal_retry_schedule.sql)
// via pg_net, authenticated with the real service role key as a Supabase-issued JWT -- verify_jwt
// on this function's deployment already rejects anyone who can't present that (same reasoning as
// close-auctions/release-stale-escrow). Retries the Photoroom call for listings whose main item
// photo couldn't have its background removed at publish time -- see
// 202609300049_background_removal_retry.sql for why publish no longer blocks on this.
export function createHandler({createClient,env,fetcher=fetch}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('PHOTOROOM_API_KEY')) return reply({processed:0,succeeded:0});
      const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data:pending,error}=await service.from('listing_media').select('path,bg_attempts').eq('kind','item').eq('bg_pending',true).lt('bg_attempts',5).limit(25);
      if(error) { console.error('retry-background-removal query failed:',error.message); return reply({error:'Could not check for pending photos.'},500); }

      let succeeded=0;
      for(const row of pending||[]) {
        try { if(await retryOne(service,env,fetcher,row)) succeeded++; }
        catch (err) { console.error('retry-background-removal failed for',row.path,err); await bumpAttempts(service,row).catch(()=>{}); }
      }
      return reply({processed:(pending||[]).length,succeeded});
    } catch (err) { console.error('retry-background-removal error:',err); return reply({error:'Could not process pending photos.'},503); }
  };
}

async function retryOne(service, env, fetcher, row) {
  const {data:blob,error:downloadError}=await service.storage.from('listing-media').download(row.path);
  if(downloadError || !blob) { await bumpAttempts(service,row); return false; }
  const bytes=new Uint8Array(await blob.arrayBuffer());

  const form=new FormData();
  form.append('image_file', new Blob([bytes],{type:'image/jpeg'}), 'photo.jpg');
  form.append('format','png');
  const response=await fetcher('https://sdk.photoroom.com/v1/segment',{
    method:'POST', headers:{'x-api-key':env('PHOTOROOM_API_KEY')}, body:form, signal:AbortSignal.timeout(30000),
  });
  if(!response.ok) { await bumpAttempts(service,row); return false; }
  const result=new Uint8Array(await response.arrayBuffer());

  const owner=row.path.split('/')[0];
  const newPath=owner+'/'+crypto.randomUUID()+'.png';
  const {error:uploadError}=await service.storage.from('listing-media').upload(newPath,new Blob([result],{type:'image/png'}),{contentType:'image/png',upsert:false});
  if(uploadError) { await bumpAttempts(service,row); return false; }

  const {error:updateError}=await service.from('listing_media').update({path:newPath,bg_pending:false,bg_attempts:0}).eq('path',row.path);
  if(updateError) { await service.storage.from('listing-media').remove([newPath]).catch(()=>{}); await bumpAttempts(service,row); return false; }
  await service.storage.from('listing-media').remove([row.path]).catch(()=>{});
  return true;
}

// Once bg_attempts reaches 5 (the same cap every quota table in this codebase uses), bg_pending
// is cleared so the row stops being picked up -- the original photo stays live permanently rather
// than retrying forever against a photo Photoroom may never be able to process.
async function bumpAttempts(service, row) {
  const attempts=row.bg_attempts+1;
  await service.from('listing_media').update({bg_attempts:attempts, bg_pending:attempts<5}).eq('path',row.path);
}

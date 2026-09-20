// Fire-and-forget push sender, called only by notify_push() via pg_net (server-to-server, hence
// the shared-secret header instead of a Supabase user JWT -- matches the stripe-webhook/
// shippo-webhook pattern of verifying the caller with the request's own signature scheme).
// Reads every device the target user has subscribed on and sends to each; a 404/410 response
// means the browser dropped that subscription, so it's deleted here rather than retried forever.
export function createHandler({createClient,env,sendPush}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, x-push-secret','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('PUSH_TRIGGER_SECRET') || request.headers.get('x-push-secret')!==env('PUSH_TRIGGER_SECRET')) return reply({error:'Unauthorized.'},401);
      if(!env('VAPID_PUBLIC_KEY') || !env('VAPID_PRIVATE_KEY')) return reply({error:'Push notifications are not connected yet.'},503);

      const text=await request.text(); if(text.length>4096) return reply({error:'Invalid request.'},400);
      let body;try{body=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const userId=body?.user_id, title=String(body?.title||'').slice(0,120), message=String(body?.body||'').slice(0,500), url=String(body?.url||'/').slice(0,300);
      if(typeof userId!=='string' || !title) return reply({error:'Invalid request.'},400);

      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data:subs,error}=await client.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id',userId);
      if(error) return reply({error:'Could not read subscriptions.'},500);

      let sent=0,removed=0;
      const payload=JSON.stringify({title,body:message,url});
      for(const sub of subs||[]) {
        try {
          await sendPush({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,{
            vapidPublicKey:env('VAPID_PUBLIC_KEY'),vapidPrivateKey:env('VAPID_PRIVATE_KEY'),vapidSubject:env('VAPID_SUBJECT')||'mailto:kingcredion@credabilia.com',
          });
          sent++;
        } catch(err) {
          if(err?.statusCode===404 || err?.statusCode===410) { await client.from('push_subscriptions').delete().eq('endpoint',sub.endpoint); removed++; }
        }
      }
      return reply({sent,removed});
    } catch {return reply({error:'Push notification is temporarily unavailable.'},503);}
  };
}

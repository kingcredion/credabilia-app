// Fire-and-forget SMS sender, called only by notify_sms() via pg_net (server-to-server, hence the
// shared-secret header instead of a Supabase user JWT -- matches send-push's pattern exactly).
// Re-checks opt-in server-side even though notify_sms() already checked in SQL, since this
// endpoint is the one place that actually holds the phone number -- never trust the caller to
// have gotten that right, same spirit as every other edge function in this app.
export function createHandler({createClient,env,sendSms}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, x-sms-secret','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(body,status=200)=>Response.json(body,{status,headers:cors});
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return reply({error:'Use POST.'},405);
    try {
      if(!env('SMS_TRIGGER_SECRET') || request.headers.get('x-sms-secret')!==env('SMS_TRIGGER_SECRET')) return reply({error:'Unauthorized.'},401);
      if(!env('TWILIO_ACCOUNT_SID') || !env('TWILIO_AUTH_TOKEN') || !env('TWILIO_FROM_NUMBER')) return reply({error:'SMS notifications are not connected yet.'},503);

      const text=await request.text(); if(text.length>4096) return reply({error:'Invalid request.'},400);
      let payload;try{payload=JSON.parse(text);}catch{return reply({error:'Invalid request.'},400);}
      const userId=payload?.user_id, body=String(payload?.body||'').slice(0,480);
      if(typeof userId!=='string' || !body) return reply({error:'Invalid request.'},400);

      const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
      const {data:profile,error}=await client.from('profiles').select('phone_number,sms_opt_in').eq('id',userId).maybeSingle();
      if(error) return reply({error:'Could not read profile.'},500);
      if(!profile?.sms_opt_in || !profile?.phone_number) return reply({sent:0});

      await sendSms({to:profile.phone_number,from:env('TWILIO_FROM_NUMBER'),body,accountSid:env('TWILIO_ACCOUNT_SID'),authToken:env('TWILIO_AUTH_TOKEN')});
      return reply({sent:1});
    } catch {return reply({error:'SMS notification is temporarily unavailable.'},503);}
  };
}

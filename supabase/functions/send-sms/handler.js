// Fire-and-forget SMS sender, called only by notify_sms()/notify_operator_sms() via pg_net
// (server-to-server, hence the shared-secret header instead of a Supabase user JWT -- matches
// send-push's pattern exactly). Two request shapes: {user_id, body} looks up an opted-in user's
// own phone (re-checked here even though notify_sms() already checked in SQL -- this is the one
// place that actually holds the number, never trust the caller); {phone, body} sends directly to
// a fixed number with no opt-in check, used only for internal operator alerts (see
// notify_operator_sms()) that were never a per-user notification to begin with.
// Twilio only accepts international format. The app lets people save a plain 10-digit US number
// ("7025551234") or a leading-1 number, so convert at send time (this also fixes numbers already saved).
export function toE164(raw) {
  const digits=String(raw||'').replace(/\D/g,'');
  if(String(raw||'').trim().startsWith('+')) return '+'+digits;
  if(digits.length===10) return '+1'+digits;
  if(digits.length===11 && digits.startsWith('1')) return '+'+digits;
  return '+'+digits;
}

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
      const userId=payload?.user_id, directPhone=payload?.phone, body=String(payload?.body||'').slice(0,480);
      if(!body || (typeof userId!=='string' && typeof directPhone!=='string')) return reply({error:'Invalid request.'},400);

      let to;
      if(typeof directPhone==='string') {
        to=directPhone;
      } else {
        const client=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'));
        const {data:profile,error}=await client.from('profiles').select('phone_number,sms_opt_in').eq('id',userId).maybeSingle();
        if(error) return reply({error:'Could not read profile.'},500);
        if(!profile?.sms_opt_in || !profile?.phone_number) return reply({sent:0});
        to=profile.phone_number;
      }

      await sendSms({to:toE164(to),from:env('TWILIO_FROM_NUMBER'),body,accountSid:env('TWILIO_ACCOUNT_SID'),authToken:env('TWILIO_AUTH_TOKEN')});
      return reply({sent:1});
    } catch(error) {
      // Log why Twilio refused (code and reason), with any phone numbers masked, so failures are diagnosable.
      const detail=String(error?.message||error).replace(/\+?\d{7,}/g,'[number]').slice(0,300);
      console.error('send-sms failed:',detail);
      // Only the database (pg_net, behind the shared secret) ever sees this reply, so the reason can ride along.
      return reply({error:'SMS notification is temporarily unavailable.',detail},503);
    }
  };
}

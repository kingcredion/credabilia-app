// Custom tool King Credion (the Vapi voice assistant on the 866 line) calls mid-call when a
// caller asks for a human. Authenticated via a shared secret configured as a Vapi "Custom
// Credential" (header X-Vapi-Secret, no Bearer prefix) attached to this tool's server URL --
// Vapi's own docs call this the "legacy" auth style, simplest to set up from their dashboard.
// Self-contained (no Postgres round trip): the caller is never a Credabilia account, so there's
// nothing to look up -- just relay their number straight to the operator over Twilio, reusing the
// exact same sendSms call send-sms/index.ts already makes.
//
// Request/response shapes are Vapi's own "tool-calls" webhook contract, not ours -- see
// https://docs.vapi.ai/tools/custom-tools. Always reply 200 with {results:[{toolCallId,result}]}
// (or {toolCallId,error}) even on failure, so the assistant has something to say back to the
// caller instead of silently failing.
export function createHandler({env,sendSms}) {
  const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type, x-vapi-secret','Access-Control-Allow-Methods':'POST, OPTIONS'};
  return async request=>{
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST') return Response.json({error:'Use POST.'},{status:405,headers:cors});
    let payload;
    try {
      if(!env('VAPI_CALLBACK_SECRET') || request.headers.get('x-vapi-secret')!==env('VAPI_CALLBACK_SECRET')) {
        return Response.json({error:'Unauthorized.'},{status:401,headers:cors});
      }
      const text=await request.text(); if(text.length>8192) return Response.json({error:'Invalid request.'},{status:400,headers:cors});
      try{payload=JSON.parse(text);}catch{return Response.json({error:'Invalid request.'},{status:400,headers:cors});}
    } catch { return Response.json({error:'Request could not be read.'},{status:400,headers:cors}); }

    const toolCall=payload?.message?.toolCallList?.[0];
    const toolCallId=toolCall?.id;
    const callerNumber=payload?.message?.call?.customer?.number;
    const reason=String(toolCall?.function?.arguments?.reason||'').slice(0,300);

    const respond=result=>Response.json({results:[{toolCallId,...result}]},{status:200,headers:cors});

    if(!toolCallId) return respond({error:'Missing tool call.'});
    if(!callerNumber) return respond({error:"I couldn't see a callback number for this call."});
    if(!env('TWILIO_ACCOUNT_SID') || !env('TWILIO_AUTH_TOKEN') || !env('TWILIO_FROM_NUMBER') || !env('OPERATOR_PHONE')) {
      return respond({error:'Callback requests are not connected yet.'});
    }

    try {
      const body=`Credabilia: caller on the support line wants a callback. Call ${callerNumber}.`+(reason?` Reason: ${reason}`:'');
      await sendSms({to:env('OPERATOR_PHONE'),from:env('TWILIO_FROM_NUMBER'),body,accountSid:env('TWILIO_ACCOUNT_SID'),authToken:env('TWILIO_AUTH_TOKEN')});
      return respond({result:"Got it -- I've sent your number to our team and someone will call you back shortly."});
    } catch {
      return respond({error:"I couldn't send that just now. Please try again in a moment."});
    }
  };
}

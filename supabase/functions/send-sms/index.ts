import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHandler } from './handler.js';

async function sendSms({ to, from, body, accountSid, authToken }) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error('Twilio send failed: ' + (await res.text()));
}

Deno.serve(createHandler({ createClient, env: (name: string) => Deno.env.get(name), sendSms }));

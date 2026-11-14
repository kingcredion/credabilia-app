Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, {status:405});
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const tokenHeader = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!key || !tokenHeader) return new Response(null,{status:403});
  const checked = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/kingdom_authorize_dispatch", {
    method:"POST", headers:{apikey:key, Authorization:"Bearer "+key, "Content-Type":"application/json"},
    body:JSON.stringify({p_token:tokenHeader})
  });
  if (!checked.ok || (await checked.json()) !== true) {
    return new Response(null, {status:403});
  }
  const input = await request.json().catch(() => null);
  if (typeof input?.topic !== "string" || input.topic.trim().length < 5 || input.topic.length > 300) {
    return new Response("Invalid topic", {status:400});
  }
  const url = new URL(Deno.env.get("GROK_TEST_WEBHOOK_URL") ?? "");
  const webhookKey = Deno.env.get("GROK_TEST_WEBHOOK_KEY");
  if (!webhookKey || url.origin !== "https://api2.cursor.sh" || url.username || url.password) {
    return new Response("Invalid webhook configuration", {status:500});
  }
  const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token))));
  const opened = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/kingdom_open_draft", {
    method:"POST", headers:{apikey:key, Authorization:"Bearer "+key, "Content-Type":"application/json"},
    body: JSON.stringify({p_topic:input.topic, p_digest:digest})
  });
  if (!opened.ok) return new Response("Could not open draft",{status:502});
  const id = await opened.json();
  const sent = await fetch(url,{method:"POST",redirect:"error",
    headers:{Authorization:"Bearer "+webhookKey,"Content-Type":"application/json"},
    body:JSON.stringify({event:"kingdom_draft",topic:input.topic,delivery_token:token})
  });
  return Response.json({id,accepted:sent.ok}, {status:sent.ok ? 202 : 502});
});

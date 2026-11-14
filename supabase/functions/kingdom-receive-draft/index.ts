Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, {status: 405});
  const token = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return new Response(null, {status: 401});
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, {status: 400});
  const chunks = [];
  let size = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 48000) {
      await reader.cancel();
      return new Response(null, {status: 413});
    }
    chunks.push(value);
  }
  let packet;
  try {
    packet = JSON.parse(await new Blob(chunks).text());
  } catch {
    return new Response(null, {status: 400});
  }
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const response = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/kingdom_receive_draft", {
    method: "POST",
    headers: {apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json"},
    body: JSON.stringify({p_token: token, p_packet: packet}),
  });
  if (!response.ok) return new Response(null, {status: 502});
  return new Response(null, {status: (await response.json()) === true ? 204 : 403});
});

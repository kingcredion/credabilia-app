// Sends Grok one Kingdom assignment with a single-use delivery token. Three kinds:
//   {topic}                 a one-off story (how the Lennon article was requested)
//   {daily:true}            today's story, written from Grok's finished HeyGen package (run by cron)
//   {correction_of, ...}    one rewrite of a story whose paragraphs failed the source check
// Grok can only use the token to deliver that one article to kingdom-receive-draft.
const base = Deno.env.get("SUPABASE_URL")!;
const receiveUrl = base + "/functions/v1/kingdom-receive-draft";
const FORMAT = "Reply by POSTing JSON to submit_url with header 'Authorization: Bearer <delivery_token>': " +
  "{\"title\": string, \"description\": one-sentence summary under 300 characters, \"sections\": [{\"heading\": optional short heading, " +
  "\"text\": one paragraph, \"source\": the https page that states every fact in that paragraph}]}. 1 to 12 sections. " +
  "Each paragraph is checked automatically against the text of its own source page, so only state what that page says, " +
  "and cite a page whose text is readable without logging in. If delivery fails, resend the identical JSON.";

async function rpc(key: string, name: string, args: unknown) {
  return await fetch(base + "/rest/v1/rpc/" + name, {
    method: "POST", headers: {apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json"},
    body: JSON.stringify(args),
  });
}

function pacificDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"}).format(now);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, {status: 405});
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const tokenHeader = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!key || !tokenHeader) return new Response(null, {status: 403});
  const checked = await rpc(key, "kingdom_authorize_dispatch", {p_token: tokenHeader});
  if (!checked.ok || (await checked.json()) !== true) return new Response(null, {status: 403});

  const input = await request.json().catch(() => null);
  let assignment: {topic: string, purpose: string, issue_date: string | null, correction_of: string | null, instructions: string, extra?: unknown};
  if (input?.daily === true) {
    const day = pacificDate();
    const received = await rpc(key, "kingdom_daily_received", {p_issue_date: day});
    if (!received.ok) return new Response("Could not read daily status", {status: 502});
    if ((await received.json()) === true) return Response.json({skipped: "already received", issue_date: day});
    assignment = {
      topic: `Kingdom daily article for ${day} from Newsroom's finished morning story package`,
      purpose: "daily", issue_date: day, correction_of: null,
      instructions: `Use today's (${day}) finished Newsroom morning story package: the same story, research and direct source links that go to HeyGen for the video ` +
        `(saved in /workspace/heygen-daily/${day}/). Do not scout or pick a new story, and do not change the Newsroom, HeyGen, video or social workflows. ` +
        "If today's package is not finished yet, or it is not fresh from today, or its source links are not direct links to the pages that report the story, do nothing: Credabilia asks again later today. " +
        "Write one Credabilia article about that story for collectors. " + FORMAT,
    };
  } else if (typeof input?.correction_of === "string" && /^[0-9a-f-]{36}$/.test(input.correction_of)) {
    assignment = {
      topic: "One correction of a Kingdom article that failed the automatic source check",
      purpose: "correction", issue_date: null, correction_of: input.correction_of,
      instructions: "Some paragraphs of the attached article were not supported by the text of their cited source. Rewrite the article once: " +
        "fix or remove each failed paragraph (or cite a page that states it), and keep the paragraphs that passed. " + FORMAT,
      extra: {article: input.article, failed_paragraphs: input.failures},
    };
  } else if (typeof input?.topic === "string" && input.topic.trim().length >= 5 && input.topic.length <= 300) {
    assignment = {topic: input.topic, purpose: "manual", issue_date: null, correction_of: null, instructions: FORMAT};
  } else {
    return new Response("Invalid request", {status: 400});
  }

  const url = new URL(Deno.env.get("GROK_TEST_WEBHOOK_URL") ?? "");
  const webhookKey = Deno.env.get("GROK_TEST_WEBHOOK_KEY");
  if (!webhookKey || url.origin !== "https://api2.cursor.sh" || url.username || url.password) {
    return new Response("Invalid webhook configuration", {status: 500});
  }
  const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
  const opened = await rpc(key, "kingdom_open_request", {
    p_topic: assignment.topic, p_digest: digest, p_purpose: assignment.purpose,
    p_issue_date: assignment.issue_date, p_correction_of: assignment.correction_of,
  });
  if (!opened.ok) return new Response("Could not open draft", {status: 502});
  const id = await opened.json();
  const sent = await fetch(url, {
    method: "POST", redirect: "error",
    headers: {Authorization: "Bearer " + webhookKey, "Content-Type": "application/json"},
    body: JSON.stringify({
      event: "kingdom_draft", purpose: assignment.purpose, topic: assignment.topic, issue_date: assignment.issue_date,
      instructions: assignment.instructions, submit_url: receiveUrl, delivery_token: token, ...(assignment.extra ? {correction: assignment.extra} : {}),
    }),
  });
  return Response.json({id, accepted: sent.ok}, {status: sent.ok ? 202 : 502});
});

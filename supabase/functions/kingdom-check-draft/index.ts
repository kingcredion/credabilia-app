// Kingdom review dispatcher (run every 10 minutes by cron; no OpenAI). It does two things:
// 1. sends the next delivered draft to a separate Grok review run, which opens every cited page and
//    reports per paragraph to kingdom-receive-review with a single-use token;
// 2. sends a draft whose review failed back to Grok for its one correction.
// Publishing and holding happen in kingdom-receive-review when the report arrives.
const base = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rpc(name: string, args = {}) {
  const res = await fetch(base + "/rest/v1/rpc/" + name, {method: "POST", headers: {apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json"}, body: JSON.stringify(args)});
  if (!res.ok) throw Error("Database operation failed: " + name);
  return res;
}
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

export const REVIEW_INSTRUCTIONS = "You are the independent reviewer for a Credabilia Memorabilia Kingdom article; you did not write it. " +
  "For every paragraph in article.sections, open its cited source page yourself and check every factual detail (names, numbers, prices, dates, " +
  "attribution, superlatives) against what that page actually says. Do not use your own knowledge or other pages. " +
  "Reply by POSTing JSON to submit_url with header 'Authorization: Bearer <review_token>': " +
  "{\"sections\": [{\"index\": paragraph number starting at 0, \"pass\": true only if the page supports every claim, " +
  "\"quotes\": [short excerpts copied exactly from the page that support the paragraph], \"reason\": what is unsupported, or why it passes}]} " +
  "with exactly one entry per paragraph. If delivery fails, resend the identical JSON.";

Deno.serve(async req => {
  if (req.method !== "POST") return new Response(null, {status: 405});
  const token = req.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token || await (await rpc("kingdom_authorize_dispatch", {p_token: token})).json() !== true) return new Response(null, {status: 403});
  const done: Record<string, unknown> = {};

  const pending = await (await rpc("kingdom_pending_correction")).json();
  if (pending) {
    const failures = (pending.report?.sections ?? []).filter((x: {pass: boolean}) => !x.pass).map((x: {index: number, reason?: string}) => ({
      index: x.index, paragraph: pending.packet.sections[x.index]?.text, source: pending.packet.sections[x.index]?.source, reason: x.reason ?? "Not supported by the cited page"}));
    const sent = await fetch(base + "/functions/v1/kingdom-request-draft", {method: "POST", headers: {Authorization: "Bearer " + token, "Content-Type": "application/json"},
      body: JSON.stringify({correction_of: pending.id, article: pending.packet, failures})});
    done.correction_requested = sent.status;
  }

  const url = new URL(Deno.env.get("GROK_TEST_WEBHOOK_URL") ?? "");
  const webhookKey = Deno.env.get("GROK_TEST_WEBHOOK_KEY");
  if (!webhookKey || url.origin !== "https://api2.cursor.sh" || url.username || url.password) return new Response("Invalid webhook configuration", {status: 500});
  const reviewToken = hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(reviewToken))));
  const job = await (await rpc("kingdom_open_review", {p_digest: digest})).json();
  if (job) {
    const sent = await fetch(url, {method: "POST", redirect: "error", headers: {Authorization: "Bearer " + webhookKey, "Content-Type": "application/json"},
      body: JSON.stringify({event: "kingdom_review", instructions: REVIEW_INSTRUCTIONS, article: job.packet,
        submit_url: base + "/functions/v1/kingdom-receive-review", review_token: reviewToken})});
    done.review_requested = {id: job.id, accepted: sent.ok};
  }
  return Response.json(done);
});

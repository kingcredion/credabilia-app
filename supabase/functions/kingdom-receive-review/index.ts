// Receives Grok's review of one Kingdom draft (single-use review token) and decides it:
//   every paragraph passes -> published at /kingdom/<slug>
//   a first draft fails    -> marked needs_correction; the dispatcher sends it back to Grok once
//   a correction fails     -> held; it never appears on the site
// As an independent guard, a "pass" only counts if the quoted excerpts really appear on the cited page
// whenever that page's text can be read here (pages built by JavaScript fall back to the review alone).
// A repeat of the same report changes nothing.
const base = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function rpc(name: string, args = {}) {
  const res = await fetch(base + "/rest/v1/rpc/" + name, {method: "POST", headers: {apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json"}, body: JSON.stringify(args)});
  if (!res.ok) throw Error("Database operation failed: " + name);
  return res;
}

function allowed(u: URL) {
  const host = u.hostname.toLowerCase();
  return u.protocol === "https:" && !u.port && !u.username && !u.password && host.includes(".") &&
    !/^[\d.]+$/.test(host) && !host.includes(":") && !host.startsWith("[") &&
    !/(^|\.)(localhost|local|internal|lan|home|corp|supabase\.co|supabase\.in)$/.test(host);
}
const ENTITIES: Record<string, string> = {amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…"};
const decode = (text: string) => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const normalize = (text: string) => text.replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

async function pageText(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { return ""; }
  for (let hop = 0; hop < 4; hop++) {
    if (!allowed(u)) return "";
    const response = await fetch(u, {redirect: "manual", signal: AbortSignal.timeout(12000),
      headers: {"User-Agent": "Mozilla/5.0 (compatible; CredabiliaSourceCheck/1.0; +https://credabilia.com/kingdom)", Accept: "text/html"}});
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) { await response.body?.cancel(); u = new URL(response.headers.get("location")!, u); continue; }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) { await response.body?.cancel(); return ""; }
    const reader = response.body!.getReader(), decoder = new TextDecoder();
    let html = "", bytes = 0;
    while (bytes < 1500000) { const {done, value} = await reader.read(); if (done) break; bytes += value.length; html += decoder.decode(value, {stream: true}); }
    await reader.cancel();
    const text = decode(html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    return text.length >= 400 ? text : "";
  }
  return "";
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response(null, {status: 405});
  const token = request.headers.get("Authorization")?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return new Response(null, {status: 401});
  const raw = await request.text();
  if (raw.length > 60000) return new Response(null, {status: 413});
  let report;
  try { report = JSON.parse(raw); } catch { return new Response(null, {status: 400}); }
  const stored = await (await rpc("kingdom_receive_review", {p_token: token, p_report: report})).json();
  if (!stored) return new Response(null, {status: 403});
  if (stored.repeat) return new Response(null, {status: 204});

  const sections = stored.packet.sections as {text: string, source: string}[];
  const pages: Record<string, string> = {};
  await Promise.all([...new Set(sections.map(s => s.source))].map(async url => { pages[url] = await pageText(url).catch(() => ""); }));
  const results = (report.sections as {index: number, pass: boolean, quotes?: unknown[], reason?: string}[]).slice().sort((a, b) => a.index - b.index).map(r => {
    const quotes = (r.quotes ?? []).filter((q): q is string => typeof q === "string" && q.trim().length > 5).map(q => q.slice(0, 600));
    const page = pages[sections[r.index].source];
    let pass = r.pass === true && quotes.length > 0, reason = String(r.reason ?? "").slice(0, 1200);
    let confirmed = "review only (page text not readable here)";
    if (pass && page) {
      const haystack = normalize(page);
      const missing = quotes.filter(q => !haystack.includes(normalize(q)));
      if (missing.length) { pass = false; reason = "Quoted excerpts were not found on the cited page: " + missing.map(q => `"${q.slice(0, 120)}"`).join("; "); }
      confirmed = "quotes found on the page";
    }
    if (r.pass === true && !quotes.length) reason = "Review passed it without quoting the page. " + reason;
    return {index: r.index, pass, reason, quotes, confirmed};
  });
  const checked_at = new Date().toISOString();
  if (results.every(r => r.pass)) {
    const slug = await (await rpc("kingdom_publish", {p_id: stored.id, p_report: {outcome: "supported", reviewer: "grok", sections: results, checked_at}})).json();
    return Response.json({published: slug ? "https://credabilia.com/kingdom/" + slug : null});
  }
  const outcome = stored.purpose === "correction" ? "held" : "needs_correction";
  await rpc("kingdom_hold", {p_id: stored.id, p_report: {outcome, reviewer: "grok", sections: results, checked_at}});
  return Response.json({outcome});
});

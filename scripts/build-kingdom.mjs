import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../public/kingdom/', import.meta.url);
const stories = readdirSync(root).filter(name => name.endsWith('.html')).map(name => {
  const html = readFileSync(new URL(name, root), 'utf8');
  const title = html.match(/<h1>([^<]+)<\/h1>/i)?.[1];
  const date = html.match(/<meta property="article:published_time" content="([\d-]+)">/)?.[1];
  const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
  if (!title || !date || !description || !/^[a-z0-9-]+\.html$/.test(name)) throw Error('Missing article metadata or invalid filename: '+name);
  return {title, date, description, slug:name.slice(0,-5)};
}).sort((a,b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

const cards = stories.map(({title, date, description, slug}) => {
  const displayDate = new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'UTC'}).format(new Date(date+'T00:00:00Z'));
  return `<article><time datetime="${date}">${displayDate}</time><h2><a href="/kingdom/${slug}">${title}</a></h2><p>${description}</p></article>`;
}).join('\n');
writeFileSync(new URL('../kingdom.html',root), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>The Memorabilia Kingdom | Credabilia</title><meta name="description" content="Explore Credabilia’s stories about memorabilia, provenance and the evidence behind notable sales.">
<link rel="canonical" href="https://credabilia.com/kingdom">
<style>*{box-sizing:border-box}body{margin:0;background:#f9f7ee;color:#19342e;font:18px/1.6 system-ui,sans-serif}header{background:#0b2923;color:#faf5de;border-bottom:3px solid #bd9754}header div,main{max-width:52rem;margin:auto;padding:2rem clamp(1.25rem,5vw,3rem)}header a{color:#f2d193;font-weight:650}h1,h2{font-family:Georgia,serif;line-height:1.1;text-wrap:balance}h1{font-size:clamp(2.6rem,7vw,4.6rem);margin:2rem 0 1rem}h2{font-size:clamp(1.6rem,4vw,2.35rem);margin:.55rem 0}article{padding:1.5rem 0;border-bottom:1px solid #d0c7ad}time{color:#53665c;font-size:.9rem}h2 a{color:inherit;text-decoration-thickness:1px;text-underline-offset:4px}p{margin:.7rem 0}</style>
</head><body><header><div><a href="/">Credabilia</a><h1>The Memorabilia Kingdom</h1></div></header><main aria-label="Published stories">${cards}</main></body></html>\n`);


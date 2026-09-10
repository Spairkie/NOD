import { getStore } from '@netlify/blobs';

export const RESERVED = new Set(['api','admin','app','assets','login','logout','signup','pricing','about','terms','privacy','help','support','studio','links','r','.netlify']);
export const SLUG_RE = /^[a-zA-Z0-9_-]{3,40}$/;

export function linksStore() {
  return getStore({ name: 'nod-links', consistency: 'strong' });
}

export function eventsStore() {
  return getStore({ name: 'nod-clicks', consistency: 'strong' });
}

export function limitsStore() {
  return getStore({ name: 'nod-rate-limits', consistency: 'strong' });
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...extra
    }
  });
}

export function validDestination(raw, requestUrl) {
  try {
    const url = new URL(String(raw || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    if (requestUrl && url.hostname === new URL(requestUrl).hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function randomSlug(length = 7) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(byte => chars[byte % chars.length]).join('');
}

export function randomSecret(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Buffer.from(data).toString('base64url');
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getLink(slug) {
  return linksStore().get(`link:${slug}`, { type: 'json', consistency: 'strong' });
}

export async function putLink(link) {
  return linksStore().setJSON(`link:${link.slug}`, link);
}

export async function deleteStoredLink(slug) {
  return linksStore().delete(`link:${slug}`);
}

export async function checkRateLimit(ip, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const hour = Math.floor(Date.now() / 3600000);
  const ipHash = await sha256(`nod-v1:${ip || 'unknown'}`);
  const key = `rate:${ipHash}:${hour}`;
  const store = limitsStore();
  const current = Number(await store.get(key, { type: 'text', consistency: 'strong' }) || 0);
  if (current >= safeLimit) return false;
  await store.set(key, String(current + 1));
  return true;
}

export function cleanToken(raw, max = 120) {
  return String(raw || '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, max);
}

export function detectDevice(ua = '') {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function referrerHost(raw = '') {
  if (!raw) return 'Direct';
  try { return new URL(raw).hostname.slice(0, 120); } catch { return 'Other'; }
}

export function eventKey(slug) {
  const stamp = new Date().toISOString();
  const id = crypto.randomUUID();
  return `click:${slug}:${stamp}:${id}`;
}

export function htmlStatus(title, message, status) {
  const eyebrow = status === 404 ? '404 / LOST PATH' : `${status} / LINK STATUS`;
  const action = status === 404 ? 'Create a new link' : 'Return to NOD';
  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f2efe7">
<title>${title} · NOD</title>
<style>
:root{color-scheme:light dark;--bg:#f2efe7;--ink:#121310;--muted:#6c6a62;--line:rgba(18,19,16,.14);--accent:#ff5b3a;--card:rgba(255,255,255,.42)}
@media(prefers-color-scheme:dark){:root{--bg:#11120f;--ink:#f2efe7;--muted:#aaa69b;--line:rgba(242,239,231,.16);--card:rgba(255,255,255,.04)}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:24px}.shell{width:min(760px,100%);border:1px solid var(--line);border-radius:26px;padding:clamp(28px,6vw,64px);background:var(--card);backdrop-filter:blur(16px);box-shadow:0 30px 90px rgba(0,0,0,.12)}.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:.08em;font-size:13px}.mark{display:flex;gap:4px}.mark i{width:7px;height:7px;border-radius:50%;background:var(--ink)}.mark i:nth-child(2){background:var(--accent)}.eyebrow{margin:64px 0 18px;font-size:10px;letter-spacing:.18em;color:var(--muted)}h1{font-size:clamp(48px,10vw,104px);line-height:.88;letter-spacing:-.065em;margin:0;max-width:8ch}p{font-family:Georgia,serif;font-size:clamp(18px,2.5vw,24px);line-height:1.45;color:var(--muted);max-width:28em;margin:26px 0 36px}.actions{display:flex;flex-wrap:wrap;gap:10px}a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:999px;text-decoration:none;border:1px solid var(--line);color:var(--ink);font-size:12px;font-weight:700}a.primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}.foot{margin-top:56px;padding-top:18px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
</style>
</head>
<body><main class="shell"><div class="brand"><span class="mark"><i></i><i></i><i></i></span>NOD</div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${message}</p><div class="actions"><a class="primary" href="/">${action} ↗</a><a href="/#links">Open workspace</a></div><div class="foot"><span>n0d.netlify.app</span><span>Short links. Long memory.</span></div></main></body></html>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    }
  });
}

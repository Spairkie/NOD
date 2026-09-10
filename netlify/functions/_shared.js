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
  return linksStore().get(`link:${slug}`, { type: 'json' });
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
  const current = Number(await store.get(key, { type: 'text' }) || 0);
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
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px system-ui;background:#f2efe7;color:#121310;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:560px;padding:32px}h1{font-size:clamp(42px,8vw,80px);letter-spacing:-.06em;margin:0 0 18px}p{color:#69685f;line-height:1.6}</style><main><h1>${title}</h1><p>${message}</p></main>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

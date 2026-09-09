const RESERVED = new Set(['api','admin','app','assets','login','logout','signup','pricing','about','terms','privacy','help','support','studio','links','r']);
const SLUG_RE = /^[a-zA-Z0-9_-]{3,40}$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname === '/api/health') {
        return json({ ok: true, service: 'nod-edge' }, 200, cors);
      }

      if (url.pathname === '/api/links' && request.method === 'POST') {
        const originError = enforceOrigin(request, env);
        if (originError) return json({ error: originError }, 403, cors);

        const allowed = await checkRateLimit(request, env);
        if (!allowed) return json({ error: 'Too many links created. Try again later.' }, 429, cors);

        if (env.TURNSTILE_SECRET_KEY) {
          const token = request.headers.get('X-Turnstile-Token') || '';
          const valid = await verifyTurnstile(token, request, env);
          if (!valid) return json({ error: 'Human verification failed.' }, 403, cors);
        }

        return createLink(request, env, cors);
      }

      const statsMatch = url.pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)\/stats$/);
      if (statsMatch && request.method === 'GET') return getStats(statsMatch[1], request, env, cors);

      const deleteMatch = url.pathname.match(/^\/api\/links\/([a-zA-Z0-9_-]+)$/);
      if (deleteMatch && request.method === 'DELETE') return deleteLink(deleteMatch[1], request, env, cors);

      if (request.method === 'GET') {
        const slug = url.pathname.replace(/^\/+|\/+$/g, '');
        if (slug && SLUG_RE.test(slug)) return redirect(slug, request, env, ctx);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (error) {
      console.error(error);
      return json({ error: 'Unexpected server error' }, 500, cors);
    }
  }
};

async function createLink(request, env, cors) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.url !== 'string') return json({ error: 'A destination URL is required.' }, 400, cors);
  const destination = validDestination(body.url);
  if (!destination) return json({ error: 'Only complete http:// and https:// destinations are allowed.' }, 400, cors);
  const destinationUrl = new URL(destination);
  if (destinationUrl.hostname === new URL(request.url).hostname) return json({ error: 'The short domain cannot redirect back into itself.' }, 400, cors);
  if (!isAllowedDestination(destinationUrl.hostname, env.ALLOWED_HOSTS)) return json({ error: 'That destination host is not allowed by this deployment.' }, 403, cors);

  let slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : randomSlug();
  if (!SLUG_RE.test(slug)) return json({ error: 'Custom endings must be 3–40 letters, numbers, hyphens, or underscores.' }, 400, cors);
  if (RESERVED.has(slug.toLowerCase())) return json({ error: 'That ending is reserved.' }, 409, cors);

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return json({ error: 'Invalid expiry date.' }, 400, cors);
  if (expiresAt && expiresAt <= new Date()) return json({ error: 'Expiry must be in the future.' }, 400, cors);

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
  const manageKey = randomSecret(32);
  const manageHash = await sha256(manageKey);
  const createdAt = new Date().toISOString();

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await env.DB.prepare(`
        INSERT INTO links (slug, destination, title, created_at, expires_at, manage_key_hash)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(slug, destination, title || null, createdAt, expiresAt ? expiresAt.toISOString() : null, manageHash).run();

      return json({
        link: {
          id: String(result.meta.last_row_id), slug, url: destination, title,
          createdAt, expiresAt: expiresAt ? expiresAt.toISOString() : null,
          clicks: 0, events: [], manageKey,
          shortUrl: `${new URL(request.url).origin}/${encodeURIComponent(slug)}`
        }
      }, 201, cors);
    } catch (error) {
      if (!String(error).toLowerCase().includes('unique')) throw error;
      if (body.slug) return json({ error: 'That ending already exists.' }, 409, cors);
      slug = randomSlug();
    }
  }
  return json({ error: 'Could not allocate a unique short link.' }, 503, cors);
}

async function redirect(slug, request, env, ctx) {
  const link = await env.DB.prepare(`SELECT id, destination, expires_at, is_active FROM links WHERE slug = ? LIMIT 1`).bind(slug).first();
  if (!link || !link.is_active) return htmlStatus('Path not found', 'This NOD link does not exist.', 404);
  if (link.expires_at && new Date(link.expires_at) <= new Date()) return htmlStatus('Path expired', 'This NOD link is no longer active.', 410);

  const destination = validDestination(link.destination);
  if (!destination) return htmlStatus('Path unavailable', 'The destination is no longer valid.', 410);

  const occurredAt = new Date().toISOString();
  const country = cleanToken(request.cf?.country || 'XX', 8);
  const device = detectDevice(request.headers.get('User-Agent') || '');
  const referrer = referrerHost(request.headers.get('Referer') || '');
  ctx.waitUntil(env.DB.prepare(`INSERT INTO clicks (link_id, occurred_at, country, device, referrer) VALUES (?, ?, ?, ?, ?)`)
    .bind(link.id, occurredAt, country, device, referrer).run().catch(console.error));

  return Response.redirect(destination, 302);
}

async function getStats(slug, request, env, cors) {
  const link = await getManagedLink(slug, request, env);
  if (!link) return json({ error: 'Not found or management key invalid.' }, 404, cors);
  const total = await env.DB.prepare(`SELECT COUNT(*) AS n FROM clicks WHERE link_id = ?`).bind(link.id).first();
  const recent = await env.DB.prepare(`SELECT occurred_at AS at, country, device, referrer FROM clicks WHERE link_id = ? ORDER BY occurred_at DESC LIMIT 250`).bind(link.id).all();
  return json({ clicks: Number(total?.n || 0), events: recent.results || [] }, 200, cors);
}

async function deleteLink(slug, request, env, cors) {
  const link = await getManagedLink(slug, request, env);
  if (!link) return json({ error: 'Not found or management key invalid.' }, 404, cors);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM clicks WHERE link_id = ?`).bind(link.id),
    env.DB.prepare(`DELETE FROM links WHERE id = ?`).bind(link.id)
  ]);
  return new Response(null, { status: 204, headers: cors });
}

async function getManagedLink(slug, request, env) {
  const key = request.headers.get('X-NOD-Key') || '';
  if (!key) return null;
  const hash = await sha256(key);
  return env.DB.prepare(`SELECT id, slug FROM links WHERE slug = ? AND manage_key_hash = ? LIMIT 1`).bind(slug, hash).first();
}

function validDestination(raw) {
  try {
    const url = new URL(String(raw).trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

function isAllowedDestination(hostname, configured) {
  const rules = String(configured || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const host = String(hostname || '').toLowerCase();
  return rules.some(rule => host === rule || host.endsWith(`.${rule}`));
}

function randomSlug(length = 7) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map(b => chars[b % chars.length]).join('');
}

function randomSecret(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...value)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}

async function checkRateLimit(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const salt = env.RATE_LIMIT_SALT || 'nod-public-demo';
  const key = await sha256(`${salt}:${ip}`);
  const windowMs = 60 * 60 * 1000;
  const current = Date.now();
  const limit = Math.max(1, Math.min(Number(env.CREATE_LIMIT_PER_HOUR || 20), 1000));
  const row = await env.DB.prepare(`SELECT window_start, count FROM rate_limits WHERE key = ?`).bind(key).first();
  if (!row || current - Number(row.window_start) >= windowMs) {
    await env.DB.prepare(`INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start, count=1`).bind(key, current).run();
    return true;
  }
  if (Number(row.count) >= limit) return false;
  await env.DB.prepare(`UPDATE rate_limits SET count = count + 1 WHERE key = ?`).bind(key).run();
  return true;
}

async function verifyTurnstile(token, request, env) {
  if (!token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

function enforceOrigin(request, env) {
  const configured = String(env.APP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!configured.length) return null;
  const origin = request.headers.get('Origin');
  return origin && configured.includes(origin) ? null : 'Origin is not allowed.';
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.APP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const allowOrigin = !allowed.length ? '*' : (allowed.includes(origin) ? origin : allowed[0]);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST,GET,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,X-NOD-Key,X-Turnstile-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  };
}

function detectDevice(ua) {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function referrerHost(raw) {
  if (!raw) return 'Direct';
  try { return new URL(raw).hostname.slice(0,120); } catch { return 'Other'; }
}
function cleanToken(raw, max) { return String(raw).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,max) || 'XX'; }
function json(body, status = 200, headers = {}) { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' } }); }
function htmlStatus(title, message, status) { return new Response(`<!doctype html><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font:16px system-ui;background:#f2efe7;color:#121310;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:560px;padding:32px}h1{font-size:clamp(42px,8vw,80px);letter-spacing:-.06em;margin:0 0 18px}p{color:#69685f;line-height:1.6}</style><main><h1>${title}</h1><p>${message}</p></main>`, { status, headers: { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } }); }

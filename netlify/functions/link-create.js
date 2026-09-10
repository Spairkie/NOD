import { RESERVED, SLUG_RE, checkRateLimit, getLink, json, putLink, randomSecret, randomSlug, sha256, validDestination } from './_shared.js';

export default async (request, context) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });

  if (!await checkRateLimit(context.ip, 20)) {
    return json({ error: 'Too many links created. Try again later.' }, 429);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.url !== 'string') return json({ error: 'A destination URL is required.' }, 400);

  const destination = validDestination(body.url, request.url);
  if (!destination) return json({ error: 'Only complete external http:// and https:// destinations are allowed.' }, 400);

  let slug = typeof body.slug === 'string' && body.slug.trim() ? body.slug.trim() : randomSlug();
  if (!SLUG_RE.test(slug)) return json({ error: 'Custom endings must be 3–40 letters, numbers, hyphens, or underscores.' }, 400);
  if (RESERVED.has(slug.toLowerCase())) return json({ error: 'That ending is reserved.' }, 409);

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return json({ error: 'Invalid expiry date.' }, 400);
  if (expiresAt && expiresAt <= new Date()) return json({ error: 'Expiry must be in the future.' }, 400);

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await getLink(slug);
    if (!existing) break;
    if (body.slug) return json({ error: 'That ending already exists.' }, 409);
    slug = randomSlug();
    if (attempt === 4) return json({ error: 'Could not allocate a unique short link.' }, 503);
  }

  const manageKey = randomSecret();
  const createdAt = new Date().toISOString();
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
  const record = {
    slug,
    destination,
    title,
    createdAt,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    manageKeyHash: await sha256(manageKey),
    active: true
  };

  await putLink(record);
  const origin = new URL(request.url).origin;

  return json({
    link: {
      id: slug,
      slug,
      url: destination,
      title,
      createdAt,
      expiresAt: record.expiresAt,
      clicks: 0,
      events: [],
      manageKey,
      shortUrl: `${origin}/${encodeURIComponent(slug)}`
    }
  }, 201);
};

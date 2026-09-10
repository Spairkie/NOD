import { detectDevice, eventKey, eventsStore, getLink, htmlStatus, referrerHost } from './_shared.js';

export default async (request, context) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || context.params?.slug || '';
  const link = await getLink(slug);

  if (!link || !link.active) return htmlStatus('Path not found', 'This short link is not available on NOD.', 404, slug);
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return htmlStatus('Path expired', 'This short link has expired.', 410, slug);

  const destination = link.destination;
  if (!destination) return htmlStatus('Path unavailable', 'The destination for this short link is no longer valid.', 410, slug);

  const event = {
    at: new Date().toISOString(),
    country: context.geo?.country?.code || 'XX',
    device: detectDevice(request.headers.get('user-agent') || ''),
    referrer: referrerHost(request.headers.get('referer') || '')
  };

  await eventsStore().setJSON(eventKey(slug), event);
  return Response.redirect(destination, 302);
};

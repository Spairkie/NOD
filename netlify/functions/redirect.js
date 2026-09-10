import { detectDevice, eventKey, eventsStore, getLink, htmlStatus, referrerHost } from './_shared.js';

export default async (request, context) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || context.params?.slug || '';
  const link = await getLink(slug);

  if (!link || !link.active) return htmlStatus('Path not found', 'This NOD link does not exist.', 404);
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return htmlStatus('Path expired', 'This NOD link is no longer active.', 410);

  const destination = link.destination;
  if (!destination) return htmlStatus('Path unavailable', 'The destination is no longer valid.', 410);

  const event = {
    at: new Date().toISOString(),
    country: context.geo?.country?.code || 'XX',
    device: detectDevice(request.headers.get('user-agent') || ''),
    referrer: referrerHost(request.headers.get('referer') || '')
  };

  await eventsStore().setJSON(eventKey(slug), event);
  return Response.redirect(destination, 302);
};

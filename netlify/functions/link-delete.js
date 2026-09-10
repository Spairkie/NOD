import { deleteStoredLink, eventsStore, getLink, json, sha256 } from './_shared.js';

export default async (request, context) => {
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405, { allow: 'DELETE' });

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || context.params?.slug || '';
  const link = await getLink(slug);
  const key = request.headers.get('x-nod-key') || '';
  if (!link || !key || await sha256(key) !== link.manageKeyHash) {
    return json({ error: 'Not found or management key invalid.' }, 404);
  }

  const store = eventsStore();
  const page = await store.list({ prefix: `click:${slug}:` });
  await Promise.all((page.blobs || []).map(item => store.delete(item.key)));
  await deleteStoredLink(slug);
  return new Response(null, { status: 204 });
};

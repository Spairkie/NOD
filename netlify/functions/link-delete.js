import { deleteStoredLink, eventsStore, getLink, json, sha256 } from './_shared.js';

export default async (request, context) => {
  if (request.method !== 'DELETE') return json({ error: 'Method not allowed' }, 405, { allow: 'DELETE' });

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || context.params?.slug || '';
  if (!slug) return json({ error: 'A link ending is required.' }, 400);

  const link = await getLink(slug);
  const key = request.headers.get('x-nod-key') || '';

  if (!link) return json({ error: 'This link is not present in the current Netlify workspace.' }, 404);
  if (!key) return json({ error: 'This browser does not have the access key for this link.' }, 401);
  if (await sha256(key) !== link.manageKeyHash) return json({ error: 'The saved access key does not match this link.' }, 403);

  const store = eventsStore();
  const page = await store.list({ prefix: `click:${slug}:` });
  await Promise.all((page.blobs || []).map(item => store.delete(item.key)));
  await deleteStoredLink(slug);

  return json({ deleted: true, slug }, 200);
};

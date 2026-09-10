const base = (process.env.NOD_BASE_URL || 'https://n0d.netlify.app').replace(/\/$/, '');
const slug = `smoke-${Date.now().toString(36)}`;
const destination = 'https://example.com/';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function main() {
  console.log(`Testing ${base}`);

  const health = await fetch(`${base}/api/health`, { headers: { Accept: 'application/json' } });
  assert(health.ok, `Health check failed: ${health.status}`);

  const createdResponse = await fetch(`${base}/api/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ url: destination, slug, title: 'NOD smoke test' })
  });
  const created = await readJson(createdResponse);
  assert(createdResponse.status === 201, `Create failed: ${createdResponse.status} ${JSON.stringify(created)}`);

  const link = created.link || created;
  assert(link.slug === slug, 'Create returned the wrong slug');
  assert(link.manageKey, 'Create did not return a management key');

  const redirect = await fetch(`${base}/${encodeURIComponent(slug)}`, { redirect: 'manual' });
  assert(redirect.status === 302, `Redirect returned ${redirect.status}`);
  assert(redirect.headers.get('location') === destination, `Redirect location mismatch: ${redirect.headers.get('location')}`);

  const statsResponse = await fetch(`${base}/api/links/${encodeURIComponent(slug)}/stats`, {
    headers: { 'X-NOD-Key': link.manageKey, Accept: 'application/json' }
  });
  const stats = await readJson(statsResponse);
  assert(statsResponse.ok, `Stats failed: ${statsResponse.status} ${JSON.stringify(stats)}`);

  const deleteResponse = await fetch(`${base}/api/links/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
    headers: { 'X-NOD-Key': link.manageKey, Accept: 'application/json' }
  });
  const deleted = await readJson(deleteResponse);
  assert(deleteResponse.ok, `Delete failed: ${deleteResponse.status} ${JSON.stringify(deleted)}`);

  const missing = await fetch(`${base}/${encodeURIComponent(slug)}`, { redirect: 'manual' });
  assert(missing.status === 404, `Deleted slug should return 404, got ${missing.status}`);

  console.log('✓ health');
  console.log('✓ create');
  console.log('✓ redirect');
  console.log('✓ stats');
  console.log('✓ delete');
  console.log('✓ deleted link returns 404');
}

main().catch(error => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});

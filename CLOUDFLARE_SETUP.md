# NOD Cloudflare production setup

NOD is deployed as a single Cloudflare product: the Worker serves the static studio, API, D1-backed analytics, and `/<slug>` redirects from the same hostname. GitHub Pages remains a mirror of the studio rather than the canonical runtime.

## Current production

- Canonical studio and short-link origin: `https://nod-edge.saihanswissle.workers.dev/`
- GitHub Pages mirror: `https://spairkie.github.io/NOD/`
- Worker: `nod-edge`
- D1 binding: `DB`
- Turnstile: managed widget for both production hosts
- Deployment: `.github/workflows/deploy-cloudflare.yml`

A request for `/` or a real static asset is served by Cloudflare Workers Static Assets. `/api/*` and unknown single-segment paths fall through to `worker/src/index.js`, where API requests and short-link redirects are handled.

## GitHub Actions credentials

The repository already expects these Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The Cloudflare user API token needs account-scoped access for Workers Scripts, D1, and Turnstile. Keep the token in GitHub Actions secrets; never put it in the repository or client configuration.

## Automated deployment

Changes to `docs/**`, `worker/**`, or the Cloudflare workflow trigger **Deploy NOD to Cloudflare**. The workflow validates the production assets, updates Turnstile hostnames, prepares the public client config, deploys the Worker and static studio, applies D1 migrations, verifies `/api/health`, verifies the studio assets, and keeps the GitHub Pages mirror current.

The rate-limit salt and Turnstile secret are deployed as Worker secrets. `docs/config.js` contains only public values: the API base URL, public short hostname, and Turnstile site key.

## Domain migration

The current `workers.dev` hostname is functional but intentionally temporary branding. When you obtain a domain that is in an active Cloudflare zone, attach the desired hostname to `nod-edge` as a Worker Custom Domain.

The preferred final shape is:

```text
https://short-domain.example/          NOD studio
https://short-domain.example/abc123    NOD redirect
https://short-domain.example/api/...   NOD API
```

No D1 data migration is required. Update these items together:

1. the Worker Custom Domain;
2. `SHORT_DOMAIN` / `API_BASE_URL` in the generated client config;
3. `APP_ORIGINS` in `worker/wrangler.jsonc`; and
4. the Turnstile widget's allowed hostnames.

The deployment workflow should remain the only place that handles production endpoint synchronization.

# NOD — Link Studio

**Short links. Long memory.**

![NOD hero preview](./assets/nod-preview.svg)

![NOD analytics preview](./assets/nod-dashboard.svg)

NOD is a real URL-shortening product with a crafted, zero-dependency front end on GitHub Pages and a Cloudflare Worker + D1 production backend. It creates globally shareable short links, records privacy-aware click analytics, supports custom endings and expiry, and protects public creation with Cloudflare Turnstile plus rate limiting.

**Live studio:** https://spairkie.github.io/NOD/

## Product capabilities

- Globally shareable redirects served from Cloudflare's edge.
- D1 persistence for links, click events, and rate-limit state.
- Custom endings, labels, expiration, and UTM helper.
- Total clicks, 14-day signal curve, active-link count, device mix, activity pulse, and per-link details.
- Per-link private management keys for statistics and deletion.
- Cloudflare Turnstile verification on public link creation.
- Hashed-IP creation rate limiting without persisting raw visitor IPs.
- Coarse analytics only: timestamp, country, device class, and referrer host.
- Responsive light/dark UI, command palette, keyboard shortcuts, reduced-motion support, and persistent local workspace state.
- Automated Cloudflare provisioning and deployment through GitHub Actions.

## Architecture

```text
Browser
  │
  ├── Studio / management UI ──> GitHub Pages
  │                               https://spairkie.github.io/NOD/
  │
  └── Create / stats / redirect ─> Cloudflare Worker: nod-edge
                                      │
                                      ├── Turnstile verification
                                      ├── rate limiting
                                      └── D1 database
                                          ├── links
                                          ├── clicks
                                          └── rate_limits
```

## Repository layout

```text
/docs                            GitHub Pages product UI
  index.html
  config.js                      Public runtime endpoint config
  styles-loader.js
  styles-*.part
  app-loader.js
  app-*.part
/worker                          Cloudflare production service
  src/index.js
  migrations/0001_init.sql
  wrangler.jsonc                 Production Worker configuration
  wrangler.jsonc.example         Reference configuration
  package.json                   Pinned Wrangler toolchain
/.github/workflows
  deploy-cloudflare.yml          Provision + migrate + deploy + connect Pages
/assets                          README preview artwork
CLOUDFLARE_SETUP.md              One-time production bootstrap
RESEARCH.md                      Product / architecture research
SECURITY.md                      Threat model and safe defaults
README.md
LICENSE
```

The front-end source is loaded from small text chunks so the repository can be safely maintained through the GitHub connector. The loaders concatenate those chunks in the browser before executing the original tested CSS and JavaScript.

## Production deployment

GitHub Pages is already the public front end. The remaining one-time step is authorizing GitHub Actions to deploy into your Cloudflare account.

### 1. Create a scoped Cloudflare API token

Create a custom token scoped only to the Cloudflare account that will host NOD, with these **Account** permissions:

- **Workers Scripts — Edit**
- **D1 — Edit**
- **Turnstile — Edit**

Use a scoped API token, not your Global API Key.

### 2. Add two GitHub Actions secrets

In this repository open:

**Settings → Secrets and variables → Actions → New repository secret**

Add:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

### 3. Run the production workflow

Open:

**Actions → Deploy NOD to Cloudflare → Run workflow**

The workflow automatically:

1. Creates or reuses a managed Turnstile widget for `spairkie.github.io`.
2. Generates the private rate-limit salt at deploy time.
3. Deploys `nod-edge` using Wrangler.
4. Automatically provisions the D1 binding on first deploy.
5. Applies all D1 migrations.
6. Resolves and verifies the production `workers.dev` endpoint.
7. Writes the Worker URL and Turnstile site key to `docs/config.js`.
8. Commits that public configuration to `main`, causing GitHub Pages to republish in production mode.

See [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for the exact setup checklist.

## Local development

From `/worker`:

```bash
npm install
npm run dev
```

Wrangler provides local resource provisioning for the D1 binding. The static front end can be served with any local static server.

## Production security model

- Redirect destinations are stored server-side and limited to complete `http` or `https` URLs.
- Custom slugs use a narrow character set and a reserved-name list.
- Every link receives a random management secret; only its SHA-256 hash is stored in D1.
- Statistics and deletion require the matching per-link management secret.
- Public link creation is protected by Turnstile.
- Creation is rate-limited per hashed client IP; the raw IP is not stored in NOD's database.
- Analytics store only timestamp, coarse country, device class, and referrer host.
- CORS is restricted to `https://spairkie.github.io` for browser-based creation.
- `ALLOWED_HOSTS` can be configured if you want to restrict destinations to trusted domains.
- Redirects use HTTP 302 so destinations can remain editable without permanent browser caching.

Read [SECURITY.md](./SECURITY.md) before changing public-creation or destination restrictions.

## Workspace ownership and backups

NOD is currently designed as a lightweight independent product rather than a multi-user SaaS account system. The D1 database stores the live links, but each browser keeps the private management keys for links it created. Those keys are required for stats and deletion.

Use **Export private backup** before clearing browser data or moving your management workspace to another device. Treat that backup as sensitive because it contains the management capabilities for your links.

## Useful keyboard controls

- `⌘/Ctrl + K` — command palette
- `⌘/Ctrl + Enter` — create a link
- `/` — focus link search when not typing in a field
- `Esc` — close dialogs

## Custom short domain

The first production deployment uses the Cloudflare-provided `nod-edge.<account-subdomain>.workers.dev` hostname so the product can go live without a domain purchase.

For a polished public launch, attach a short custom domain to `nod-edge`, then set `SHORT_DOMAIN` in `docs/config.js` to that hostname. The API can remain on the Worker URL or share the custom hostname.

## Research

See [RESEARCH.md](./RESEARCH.md) for the competitive scan, product decisions, GitHub Pages constraint, backend choice, privacy/security model, and primary sources that shaped NOD.

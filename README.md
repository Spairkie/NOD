# NOD — Link Studio

**Short links. Long memory.**

![NOD hero preview](./assets/nod-preview.svg)

![NOD analytics preview](./assets/nod-dashboard.svg)

NOD is a production URL shortener and link-intelligence product built on Cloudflare Workers, D1, Turnstile, and static assets. The same Cloudflare deployment serves the studio, API, analytics management surface, and globally shareable redirects.

**Canonical product:** https://nod-edge.saihanswissle.workers.dev/

**GitHub Pages mirror:** https://spairkie.github.io/NOD/

## Product capabilities

- Real globally shareable redirects served from Cloudflare's edge.
- D1 persistence for links, click events, and rate-limit state.
- Custom endings, labels, expiration, and UTM source helper.
- Real click totals, 14-day activity signal, active-link count, device mix, recent activity, and per-link details.
- Per-link private management keys for statistics and deletion.
- Cloudflare Turnstile verification on public link creation.
- Hashed-IP creation rate limiting without persisting raw visitor IPs.
- Coarse analytics only: timestamp, country, device class, and referrer host.
- Responsive light/dark UI, command palette, keyboard shortcuts, reduced-motion support, and persistent management state.
- Automated production deployment through GitHub Actions.

## Architecture

```text
Browser
  │
  └── Cloudflare Worker: nod-edge
        │
        ├── /                       static NOD studio
        ├── /<slug>                 server-side redirect
        ├── /api/*                  create / stats / delete
        ├── Turnstile               abuse protection
        ├── rate limiting           hashed client key
        └── D1
            ├── links
            ├── clicks
            └── rate_limits

GitHub Pages
  └── read-only deployment mirror of the same studio assets
```

Cloudflare Workers Static Assets serves NOD's HTML/CSS/JS when the requested asset exists. Requests such as `/api/links` and `/<slug>` do not match static assets, so they fall through to the Worker script for API handling or redirects. This lets one hostname behave like one coherent product.

## Repository layout

```text
/docs
  index.html                    Product UI
  config.js                     Public production endpoint config
  styles.css                    Core UI styles
  ui-polish.css                 Responsive/product UI refinements
  styles-loader.js              Theme-safe stylesheet bootstrap
  app.js                        Production-only application runtime
  app-loader.js                 Stable application bootstrap
  .assetsignore                 Cloudflare asset exclusions
/worker
  src/index.js                  API, redirects, analytics, rate limiting
  migrations/0001_init.sql      D1 schema
  wrangler.jsonc                Production Worker + Static Assets config
  package.json                  Pinned Wrangler toolchain
/.github/workflows
  deploy-cloudflare.yml         Validate + deploy + migrate + verify
/assets                         README artwork
CLOUDFLARE_SETUP.md            Cloudflare deployment notes
RESEARCH.md                    Product / architecture research
SECURITY.md                    Threat model and safe defaults
README.md
LICENSE
```

There is no local demo data path in the production application. Links shown in the workspace are links actually created in D1 and managed by access keys stored by the browser. If the production API configuration is missing, creation is disabled rather than falling back to fake/local shortening.

## Production deployment

The repository is already connected to Cloudflare through GitHub Actions. Pushing changes under `docs/`, `worker/`, or the deployment workflow triggers the production deployment.

The workflow:

1. validates the production JavaScript and static assets;
2. resolves the account's `workers.dev` hostname;
3. creates or updates the Turnstile widget for the production hosts;
4. writes the public runtime config used by the studio;
5. deploys the Worker, static assets, and D1 binding with Wrangler;
6. applies D1 migrations;
7. verifies the health endpoint and production studio assets; and
8. keeps the GitHub Pages mirror pointed at the same production API.

Cloudflare credentials remain in GitHub Actions secrets and are never committed to the repository.

## Local development

From `/worker`:

```bash
npm install
npm run dev
```

The browser UI expects a real API endpoint. For local development, point `docs/config.js` at a Wrangler development endpoint rather than enabling a fake data mode.

## Production security model

- Redirect destinations are stored server-side and limited to complete `http` or `https` URLs.
- Custom slugs use a narrow character set and a reserved-name list.
- Every link receives a random management secret; only its SHA-256 hash is stored in D1.
- Statistics and deletion require the matching per-link management secret.
- Public link creation is protected by Turnstile.
- Creation is rate-limited per hashed client IP; the raw IP is not stored in NOD's database.
- Analytics store only timestamp, coarse country, device class, and referrer host.
- Browser creation is restricted to approved production origins.
- `ALLOWED_HOSTS` can be configured if destination restrictions are needed.
- Redirects use HTTP 302 so destinations are not permanently cached by browsers.

Read [SECURITY.md](./SECURITY.md) before relaxing public-creation or destination restrictions.

## Workspace ownership and backups

NOD currently uses accountless, per-link ownership instead of user accounts. D1 stores the live links; the browser stores the private management keys needed to retrieve analytics or delete the links it created.

Use **Back up access keys** before clearing browser data or moving the management workspace to another device. Treat that JSON file as sensitive because those keys authorize management actions.

## Keyboard controls

- `⌘/Ctrl + K` — command palette
- `⌘/Ctrl + Enter` — create a link
- `/` — focus link search when not typing in a field
- `Esc` — close dialogs

## Custom short domain

`nod-edge.saihanswissle.workers.dev` is the current canonical hostname, so both the studio and short links already share one origin:

```text
https://nod-edge.saihanswissle.workers.dev/
https://nod-edge.saihanswissle.workers.dev/NaVAwqJ
```

When a short custom domain is available, attach it to this Worker as a Cloudflare Custom Domain. The D1 data and redirect architecture do not need to move; only the hostname/origin configuration changes.

## Research

See [RESEARCH.md](./RESEARCH.md) for the competitive scan and the product, privacy, security, and architecture decisions behind NOD.

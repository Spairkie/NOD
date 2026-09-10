# NOD — Link Studio

**Short links. Long memory.**

NOD is a production URL shortener designed to run entirely on Netlify's Free plan.

**Canonical product:** https://n0d.netlify.app/

## Architecture

```text
Browser
  │
  └── Netlify
        ├── /                     static NOD studio
        ├── /<slug>               server-side 302 redirect
        ├── /api/*                Netlify Functions
        └── Netlify Blobs
            ├── links
            ├── click events
            └── rate limits
```

The studio and short links share the same hostname, so a created link looks like:

```text
https://n0d.netlify.app/Ab3xQ7
```

## Netlify import settings

When importing `Spairkie/NOD` from GitHub:

- **Base directory:** leave blank
- **Build command:** leave blank
- **Publish directory:** `docs`
- **Functions directory:** `netlify/functions`
- **Environment variables:** none required

The root `netlify.toml` contains the same deployment configuration and routing rules.

## Product capabilities

- Real globally shareable 302 redirects.
- Persistent links and click events using Netlify Blobs.
- Custom endings, labels, expiration, and UTM source helper.
- Click totals, recent activity, device mix, and per-link details.
- Private per-link management keys for stats and deletion.
- Per-IP creation rate limiting without storing raw IP addresses.
- Responsive light/dark interface, keyboard shortcuts, command palette, and private workspace backup.

## Repository layout

```text
/docs
  index.html
  config.js
  styles.css
  ui-polish.css
  styles-loader.js
  app.js
  app-loader.js
/netlify/functions
  _shared.js
  health.js
  link-create.js
  link-stats.js
  link-delete.js
  redirect.js
netlify.toml
package.json
SECURITY.md
README.md
```

## Storage and ownership

The live destination mapping is stored on Netlify. Each browser keeps the private management key for the links created from that browser. The key is required to retrieve private analytics or delete the link.

Use **Back up access keys** before clearing browser data or moving your management workspace to another device.

## Free-plan behavior

NOD is intentionally compatible with Netlify Free. Netlify's Free plan uses a hard monthly credit limit, so it pauses rather than automatically charging for overage.

## Cloudflare

Cloudflare is no longer part of NOD's active repository architecture. The previous Worker/D1 deployment files and GitHub Actions deployment workflow have been removed. If an old Cloudflare Worker still exists in the Cloudflare dashboard, it is independent of the Netlify deployment and can be deleted there when you no longer need the old URLs.

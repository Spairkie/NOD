# NOD Cloudflare production setup

NOD is already prepared for production. The repository workflow provisions the Cloudflare resources and connects the GitHub Pages front end automatically.

## What the workflow creates

Running **Deploy NOD to Cloudflare** will:

1. Create or reuse a managed Cloudflare Turnstile widget for `spairkie.github.io`.
2. Generate the private rate-limit salt at deploy time.
3. Deploy the `nod-edge` Cloudflare Worker.
4. Automatically provision the Worker's D1 binding.
5. Apply the D1 migrations in `worker/migrations/`.
6. Verify the deployed Worker's health endpoint.
7. Write the real Worker URL and Turnstile site key into `docs/config.js`.
8. Commit that public configuration back to `main`, which causes GitHub Pages to publish the production-connected UI.

No Cloudflare secret is committed to the repository.

## One-time setup

### 1. Create a scoped Cloudflare **user API token**

In the Cloudflare dashboard, go to **My Profile → API Tokens → Create Token**. Use a user API token rather than an Account API token because Turnstile currently does not support account-owned API tokens.

The easiest starting point is the **Edit Cloudflare Workers** template; then modify it so the token is limited to the single Cloudflare account that will host NOD and add the missing D1 and Turnstile permissions.

The workflow needs these permissions for that account:

- **Workers Scripts — Edit**
- **D1 — Edit**
- **Turnstile — Edit** (the API may describe this permission as **Turnstile Sites Write**)

If the Workers template also includes **Account Settings — Read**, leave that read-only permission enabled because Wrangler may use account metadata during deployment.

Do not use your Global API Key. The token secret is shown only once, so put it directly into GitHub Actions secrets rather than committing it to the repository.

### 2. Copy your Cloudflare account ID

In the Cloudflare dashboard you can use global search (`Ctrl/Cmd + K`) and choose **Copy account ID**, or open **Workers & Pages** and copy the Account ID from **Account Details**.

### 3. Add two GitHub Actions secrets

Open this repository on GitHub, then go to:

**Settings → Secrets and variables → Actions → New repository secret**

Create:

- `CLOUDFLARE_ACCOUNT_ID` — your Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN` — the scoped user API token from step 1.

### 4. Run the deployment

Open:

**Actions → Deploy NOD to Cloudflare → Run workflow**

Choose `main` and run it.

A successful run will show the GitHub Pages URL, the Worker URL, Turnstile status, and D1 migration status in the workflow summary.

## After the first deployment

Visit:

`https://spairkie.github.io/NOD/`

The status chip should say **Edge backend connected**. Newly created NOD links will use your `nod-edge.<workers-subdomain>.workers.dev/<slug>` address and will work globally, not only in the browser where they were created.

The browser stores the private management key for each link locally so it can retrieve statistics and delete that link. Use **Export private backup** if you want to preserve those management keys before clearing browser data or moving to another device.

## Production resources

The production source of truth is:

- `worker/wrangler.jsonc` — Worker settings, D1 binding, CORS origin and observability.
- `worker/src/index.js` — create, redirect, stats, delete, Turnstile and rate-limit logic.
- `worker/migrations/` — versioned D1 schema.
- `.github/workflows/deploy-cloudflare.yml` — production provisioning and deployment.
- `docs/config.js` — public runtime endpoint configuration; updated automatically by the workflow.

## Custom short domain

The first deployment intentionally uses the Cloudflare-provided `workers.dev` hostname so NOD can become functional without buying or transferring a domain.

Once you own a short domain, attach that hostname to `nod-edge` in Cloudflare and then set `SHORT_DOMAIN` in `docs/config.js` to the custom hostname. The API can remain on the Worker URL or move to the same custom hostname.

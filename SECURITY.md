# Security notes

NOD is a portfolio-oriented, single-owner URL shortener architecture. The repository includes practical safeguards, but operating a public general-purpose shortener creates ongoing abuse, phishing, moderation, privacy, and availability responsibilities.

## Safe public portfolio configuration

For the safest demonstration deployment:

1. Keep the GitHub Pages front end in local portfolio mode **or** connect the Worker.
2. If connecting the Worker, configure Cloudflare Turnstile.
3. Set `APP_ORIGINS` to the exact GitHub Pages origin.
4. Set `ALLOWED_HOSTS` to domains you control, comma separated.
5. Keep the default creation rate limit or lower it.
6. Store `RATE_LIMIT_SALT` and `TURNSTILE_SECRET_KEY` as Worker secrets, never in the repo.

Example:

```jsonc
"vars": {
  "APP_ORIGINS": "https://yourname.github.io",
  "CREATE_LIMIT_PER_HOUR": "10",
  "ALLOWED_HOSTS": "yourportfolio.com,github.com"
}
```

`ALLOWED_HOSTS` also allows subdomains of each configured host. Leave it blank only if you intentionally want a general-purpose shortener and are prepared to operate abuse controls.

## Implemented protections

- Only `http:` and `https:` destinations are accepted.
- User/password components in destination URLs are rejected.
- Redirects resolve a server-side slug mapping; the redirect endpoint does not accept arbitrary destination parameters.
- Self-referential redirects into the shortener host are rejected at creation.
- Reserved route names cannot be claimed as slugs.
- Optional destination-host allowlisting.
- Optional Cloudflare Turnstile validation for creation.
- Per-client creation rate limiting using a salted SHA-256 hash of the client IP.
- Raw visitor IPs are not written to the application analytics tables.
- Each link gets a random management key; only its SHA-256 hash is stored server-side.
- Stats and deletion require the matching per-link management key.
- CORS can be restricted to the portfolio origin.
- Responses use `X-Content-Type-Options: nosniff` and a conservative referrer policy.

## Data recorded for redirects

The click event table stores only:

- timestamp
- coarse Cloudflare country code
- device class
- referrer hostname

Review your own legal/privacy obligations before operating analytics publicly.

## Not included

NOD does not claim to provide a full commercial trust-and-safety program. A large public service would also need abuse reporting, reputation/scanning systems, automated blocking, moderation workflows, user accounts, audit logs, retention controls, monitoring, backups, alerting, and incident response.

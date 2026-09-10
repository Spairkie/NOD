# Security notes

NOD is a public URL shortener running on Netlify Functions and Netlify Blobs. Public shorteners can attract phishing, spam, and automated abuse, so the service is intentionally conservative about what it stores and how link management works.

## Implemented protections

- Only complete `http:` and `https:` destinations are accepted.
- URLs containing embedded usernames or passwords are rejected.
- Redirects resolve a server-side slug mapping; destinations are never supplied directly to the redirect endpoint.
- Self-referential redirects back into the active NOD hostname are rejected.
- Reserved route names cannot be claimed as slugs.
- Link creation is rate-limited per client using a one-way hash; raw client IP addresses are not stored in NOD's data stores.
- Every link receives a random management key. Only the SHA-256 hash of that key is stored server-side.
- Stats and deletion require the matching management key.
- Click analytics store only timestamp, coarse country, device class, and referrer hostname.
- Security headers include `X-Content-Type-Options: nosniff` and a conservative referrer policy.
- Redirects use HTTP 302 so destinations are not permanently cached by browsers.

## Storage

Netlify Blobs stores three logical data sets:

- link records and destination mappings
- click-event records
- short-lived rate-limit counters

The browser stores the private management keys for links created from that browser. Use **Back up access keys** before clearing browser storage or moving to another device.

## Abuse considerations

NOD is usable as a real public shortener, but a large-scale service would also need destination reputation checks, abuse reporting, automated blocking, moderation workflows, retention controls, monitoring, backups, incident response, and potentially user accounts.

If abuse becomes material, the next security upgrade should be an additional creation challenge or stricter destination policy rather than weakening the existing rate limit.

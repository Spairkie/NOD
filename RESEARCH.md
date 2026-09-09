# NOD — URL Shortener Product & Architecture Research

## Executive summary

Modern URL shorteners are no longer differentiated by compression alone. The leading products converge around five jobs: create a clean path quickly, preserve brand trust through custom domains and custom endings, keep destinations editable, attach QR/campaign workflows, and turn click activity into useful analytics. Bitly emphasizes links + QR + unified analytics; Dub centers a powerful link builder, custom domains, targeting, protection, and real-time analytics; Short.io combines branded links with granular targeting and a broad API; Rebrandly positions branded links and real-time click intelligence as core value.

NOD therefore avoids competing on feature count. Its product thesis is **“instrument, not dashboard”**: the first interaction stays extremely focused, while shaping controls and analytics appear progressively. This is a better portfolio story than recreating an enterprise admin console pixel-for-pixel.

## Competitive patterns worth keeping

| Pattern | Why it matters | NOD interpretation |
|---|---|---|
| Fast link builder | Creation is the product’s primary high-frequency action | One large URL field; advanced controls collapse away |
| Custom endings / domains | Readability and brand trust are core to modern shortening | Custom slug first; custom domain supported by backend config |
| Editable lifecycle | Links need expiry and destination management | Expiry included now; edit destination is a clear next extension |
| Analytics | Click count alone is no longer enough | Time signal, device mix, activity pulse, per-link details |
| QR / offline bridge | Mature platforms connect online and offline campaigns | Deliberately deferred rather than shipping a fake QR surface |
| Targeting | Advanced products route by device / geography | Architecture can add rules later without redesigning creation UX |
| API / automation | Power users expect programmatic management | Worker endpoints are intentionally small and composable |

## Why GitHub Pages alone cannot be a real public shortener

GitHub Pages is static publishing. It is excellent for the NOD portfolio interface, but a globally shareable URL shortener needs dynamic mapping between a short code and a destination plus a redirect response at request time. GitHub also states that Pages is not intended to operate a commercial SaaS. NOD therefore separates the project into:

1. **GitHub Pages** — static portfolio UI.
2. **Cloudflare Worker** — URL creation, redirect handling, input validation, rate limiting.
3. **Cloudflare D1** — link records and coarse click events.

That separation keeps GitHub hosting simple while making the architecture technically honest.

## Why Cloudflare Worker + D1

Cloudflare Workers are a natural fit for redirect workloads because the redirect logic is small, latency-sensitive, and request-driven. D1 provides managed serverless SQL with SQLite semantics and direct Worker bindings. As of the research date, Cloudflare’s free Workers tier lists 100,000 requests/day, while D1’s free tier lists 5 million rows read/day, 100,000 rows written/day, and 5 GB storage—comfortably beyond a personal portfolio workload.

KV was considered, but D1 is the stronger portfolio choice because analytics and lifecycle management benefit from relational queries and indexes. KV also has a much smaller free write allowance (1,000 writes/day) and is optimized around key/value access rather than event analysis.

## Security and abuse model

A URL shortener is inherently abuse-sensitive. OWASP warns that unvalidated redirects can become phishing infrastructure. NOD treats the server-side mapping—not user-supplied redirect parameters—as the source of truth, validates destination URLs, restricts schemes to HTTP/HTTPS, and keeps a reserved slug list.

The backend also avoids embedding a master admin secret in static GitHub Pages. Each created link receives a random management key; only its SHA-256 hash is persisted. Stats and deletion require that key. Public creation can be protected with Cloudflare Turnstile and per-client rate limiting. The rate limiter stores only a salted hash of the client IP, not the raw address.

## Privacy model

NOD’s analytics intentionally do less than many commercial products. The D1 click table records:

- event timestamp
- coarse Cloudflare country code
- device class (mobile / tablet / desktop)
- referrer hostname

It does **not** write the visitor’s IP address to the analytics table. This is enough to make the dashboard useful while supporting a more restrained product story.

## Design principles derived from the scan

### 1. Fast before fancy
The landing experience should let a visitor succeed within seconds. The URL field carries the visual hierarchy; everything else is secondary.

### 2. Progressive disclosure
Enterprise shorteners tend to accumulate controls. NOD hides slug, label, expiry, and UTM helpers behind “Shape the link,” keeping the first-use experience calm.

### 3. Editorial rather than enterprise
A portfolio piece benefits from expressive typography, negative space, subtle procedural motion, and high-quality interaction states more than from 14 navigation tabs.

### 4. Analytics as signal
Instead of a dense BI dashboard, the core surface answers four questions: How much activity exists? How many links are live? What device dominates? Is activity quiet or lively?

### 5. Demo honesty
The GitHub-only version does not pretend local-storage links are globally shareable. The UI labels that mode explicitly. A real edge backend is available when global behavior is needed.

## Primary sources

1. Bitly — URL Shortener: https://bitly.com/pages/products/url-shortener
2. Bitly — Analytics: https://bitly.com/pages/products/analytics
3. Dub — Links Overview: https://dub.co/help/article/dub-links
4. Dub — Link Builder: https://dub.co/help/article/dub-link-builder
5. Short.io — Feature List: https://short.io/features/
6. Short.io — API overview: https://docs.short.io/articles/api-reference/Technical%20questions/how-to-use-the-short.io-api
7. Rebrandly — What is Rebrandly?: https://support.rebrandly.com/en/articles/469537-what-is-rebrandly
8. Rebrandly — Analytics: https://support.rebrandly.com/en/articles/469638-what-are-rebrandly-analytics
9. GitHub — Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
10. Cloudflare — Workers pricing / limits: https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/workers/platform/limits/
11. Cloudflare — D1 overview / pricing: https://developers.cloudflare.com/d1/ and https://developers.cloudflare.com/d1/platform/pricing/
12. Cloudflare — KV pricing / limits: https://developers.cloudflare.com/kv/platform/pricing/ and https://developers.cloudflare.com/kv/platform/limits/
13. Cloudflare — Worker secrets: https://developers.cloudflare.com/workers/configuration/secrets/
14. OWASP — Unvalidated Redirects and Forwards Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html

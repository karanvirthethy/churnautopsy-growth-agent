# ChurnAutopsy Growth Agent

A private research workspace for finding and reviewing potential ChurnAutopsy customers. Phase 1 targets US B2B SaaS companies with 2–50 employees, using Hunter Discover behind an authenticated server API.

**No emails are sent. No contacts are harvested. A fit score is not permission to contact a company.**

## Phase 1

- Responsive dark dashboard, searchable Leads workspace, Settings, and clearly scoped Campaigns and Inbox pages.
- Find Leads, Save Lead, Reject Lead, and return-to-review actions.
- Explicitly unscored live leads when qualification evidence is unavailable. This phase does not call an LLM or claim AI-verified qualification.
- Server-side Hunter integration, Supabase PostgreSQL storage, canonical-domain deduplication, and owner-only authentication.
- Explicit demo mode with fictional `.example` domains; no real prospect fixtures.
- Unit, API, PostgreSQL migration, and desktop/mobile browser tests; GitHub Actions CI.

## Run locally

Requires Node.js 22.12+ (CI uses Node 24) and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Vite serves the UI on port 5173 and proxies `/api` to the Node server on port 3001. Both bind to loopback. The default `DATA_MODE=demo` needs no credentials, seeds five fictional companies, and keeps decisions in server memory. Restarting the server resets the demo. Repeated discovery preserves decisions during the process lifetime. Demo mode never calls Hunter or Supabase, even if credentials happen to be present.

```sh
npm run check       # TypeScript, production client build, unit/API/migration tests
npx playwright install chromium
npm run test:e2e    # desktop and mobile Chromium workflows
npm run build
npm start           # serves dist/ and API on port 3001
```

For a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. Use `PLAYWRIGHT_BROWSERS_PATH` when the default browser cache is not writable.

## Enable live mode

Use a **new, dedicated Supabase project**. Do not apply these migrations or reuse credentials from the existing ChurnAutopsy production project.

1. Create a dedicated project and apply both SQL files in `supabase/migrations/` in filename order through its SQL editor, or use the Supabase CLI against that project's verified project reference. No command in this repository automatically links or migrates a remote project.
2. In Supabase Auth, disable public signups. Create the single owner account with a strong password and record its user UUID. The app does not offer account registration.
3. Set the server's `DATA_MODE=live`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, and `HUNTER_API_KEY`. Store values in an ignored local `.env` or your host's secret manager. Never use a `VITE_` prefix for secrets.
4. Restart the server and sign in with that owner account. Live mode refuses to start with missing configuration; provider failures never silently fall back to fictional data.
5. Click **Find leads**. Check current Hunter plan availability and usage terms first. Phase 1 requests the first 20 matches, at most three discovery requests per minute. Repeating a search does not advance to another page.

Required outbound HTTPS destinations: `api.hunter.io` and your dedicated `<project-ref>.supabase.co`. `hunter.io` is useful for reading provider documentation. GitHub API access is separately needed for PR creation.

For deployment, build the frontend and run `NODE_ENV=production npm start` behind an HTTPS reverse proxy on the same host. Preserve the public Host and Origin headers and route the UI and API through the same origin. Production session cookies are Secure, HttpOnly, SameSite=Strict, and expire after one hour. Reauthenticate after expiry. The server binds to loopback intentionally; do not expose the demo server publicly. This is a single-process, single-owner application; in-memory rate limits are not suitable for a horizontally scaled deployment.

## Discovery and scoring

The server calls `POST https://api.hunter.io/v2/discover` with US headquarters, `1-10` and `11-50` headcount buckets, the documented `Software Development` industry, and a limit of 20. No keyword filter is imposed: requiring both literal `SaaS` and `B2B` keywords can hide relevant companies. This broader search includes companies that are not B2B SaaS; manual qualification is required.

Verified against [Hunter's official Discover documentation](https://hunter.io/api-documentation/v2#discover) and [industry list](https://hunter.io/files/industries.json) on November 10, 2026. The documented response contains `data` entries with `domain`, `organization`, and `emails_count` (`personal`, `generic`, `total`), plus pagination/filter metadata. It does **not** supply company location, industry, employee count, or keyword evidence. Email counts are explicitly not employee counts. See [contract notes](docs/hunter-discover.md).

Results are retained with unknown attributes stored as SQL `NULL` and shown as **Unverified**. Their fit score is `NULL`, displayed as **Unscored**, rather than a misleading zero or filter-derived score. Request filters and `meta.filters` describe the search, not verified attributes of individual companies. Extra undocumented fields are ignored. No enrichment endpoint is called. Any future paid enrichment requires explicit owner approval.

The `1-10` search bucket includes solo businesses, so confirm 2–50 employees manually. Also verify location, software industry, and B2B/SaaS business models before qualifying a result. Saved companies remain `eligibility=not_assessed`; saving is a shortlist decision only. Numeric demo scores remain explicitly illustrative.

For existing Phase 1 installations, apply the new `202611100002_unverified_discovery.sql` migration to the dedicated Growth Agent database. It permits unknown attributes and clears unsupported legacy Hunter metadata/scores while preserving identities, saved/rejected decisions, and demo data. Fresh installations must apply **both migrations in filename order**. No remote migration is run by the application.

## Architecture and data boundaries

```text
React / Vite → same-origin /api → owner authentication → Hunter Discover
                                          └──────────→ Supabase companies
```

- `src/`: interface, responsive styling, and same-origin requests. No provider credentials or database client.
- `server/app.ts`: API routes, owner authorization seam, mutation validation, request limits, security headers, and redacted errors.
- `server/index.ts`: server configuration, Supabase Auth, dependency wiring, and production static serving.
- `server/hunter.ts`, `companies.ts`: bounded provider adapter, response validation, normalization, unverified qualification state, and fictional fixtures.
- `server/store.ts`: shared storage interface with isolated in-memory demo and Supabase implementations.
- `shared/`: public data contracts only.
- `supabase/migrations/`: database constraints, uniqueness, timestamps, and row-level security.

Canonical domains are unique. Discovery uses conflict-ignore inserts, so rediscovery cannot reset saved/rejected decisions. RLS is enabled with no browser access policies, and grants to anonymous/authenticated roles are revoked. Only the server's service-role client can read/write companies. The API authenticates the owner before any live read, write, or Hunter call. Provider error payloads and request URLs are not logged or returned to the browser.

## Future phases

See [architecture and safety boundaries](docs/architecture.md). Legal eligibility, suppression lists, approved campaign drafts, delivery, follow-ups, and reply ingestion require separate models and explicit gates. Phase 1 has no send endpoints, mailbox integrations, delivery workers, or email provider dependencies.

## Validation and limitations

Automated tests use fictional records, mocked Hunter responses, and a real PostgreSQL engine via PGlite for migration constraints and role access. Browser tests exercise the actual demo server. No external credentials are required in CI.

Live Hunter plan compatibility, an actual Hunter response, Supabase Auth, and a hosted Supabase deployment must be smoke-tested after you provide credentials and apply the migration to the dedicated project. Mocked adapter tests do not establish live integration success. Provider contract changes should be handled in the adapter and its fixtures. Current discovery is deliberately a bounded first-page search, not a full-market crawler.

Do not commit `.env` files, credentials, exports, real company fixtures, or screenshots containing live prospect data. The repository's demo screenshots and test fixtures must remain synthetic.

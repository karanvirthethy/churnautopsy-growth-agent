# ChurnAutopsy Growth Agent

A private research workspace for finding and reviewing potential ChurnAutopsy customers. Phase 2B targets US B2B SaaS companies with 2–50 employees, using Hunter Discover behind an authenticated server API.

**Real sending and chargeable contact calls are OFF by default. A fit score is never permission to contact a company.**

The complete autonomous workflow is implemented in dry-run mode. See the [consolidated setup and activation guide](docs/activation-guide.md) for the new additive migration, private hosting, Gmail OAuth, consent evidence, budgets, tests and explicit activation. Start at Overview → Start dry run to exercise the fictional pipeline.

## Capabilities

- Responsive dark dashboard, searchable Leads workspace, Settings, and clearly scoped Campaigns and Inbox pages.
- Find Leads, Save Lead, Reject Lead, and return-to-review actions.
- Explicitly unscored live leads when qualification evidence is unavailable. Website evidence supports a separate, explainable rules-based assessment; no LLM is called.
- Server-side Hunter integration, Supabase PostgreSQL storage, canonical-domain deduplication, and owner-only authentication.
- Explicit demo mode with fictional `.example` domains; no live prospect exports.
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

Use the existing **dedicated ChurnAutopsy Growth Agent Supabase project**. See the [Phase 2A configuration and live testing guide](docs/live-setup.md) for exact Codex variables and restricted network secret destinations. Do not apply these migrations or reuse credentials from the existing ChurnAutopsy production project.

1. The owner reports the first two migrations already applied. Do not rerun them. For Phase 2B apply only `202611110001_company_qualification.sql` once, following [the upgrade guide](docs/phase-2b.md). For the autonomous system also apply only `202611120001_growth_automation.sql` once as described in the activation guide. New installations need all SQL files in `supabase/migrations/` in filename order. No command automatically links or migrates a remote project.
2. In Supabase Auth, disable public signups. Create the single owner account with a strong password and record its user UUID. The app does not offer account registration.
3. Set the server's `DATA_MODE=live`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `OWNER_USER_ID`, and `HUNTER_API_KEY`. Store values in an ignored local `.env` or your host's secret manager. Never use a `VITE_` prefix for secrets.
4. Restart the server and sign in with that owner account. Live mode refuses to start with missing configuration; provider failures never silently fall back to fictional data.
5. Open **Settings → Check connections** for owner-only, read-only Supabase and Hunter status. Then click **Find leads**. Check current Hunter plan availability and usage terms first. Each selected search requests the first 20 matches, at most three discovery requests per minute. Repeating a search does not advance to another page.

Required outbound HTTPS destinations: `api.hunter.io` and your dedicated `<project-ref>.supabase.co`. `hunter.io` is useful for reading provider documentation. GitHub API access is separately needed for PR creation.

For deployment, build the frontend and run `NODE_ENV=production npm start` behind an HTTPS reverse proxy on the same host. Preserve the public Host and Origin headers and route the UI and API through the same origin. Production session cookies are Secure, HttpOnly, SameSite=Strict, and expire after one hour. Reauthenticate after expiry. The server binds to loopback intentionally; do not expose the demo server publicly. This is a single-process, single-owner application; in-memory rate limits are not suitable for a horizontally scaled deployment.

## Discovery and scoring

See the [Phase 2B guide](docs/phase-2b.md) for search presets, costs, evidence rules, network limitations, and the additive database upgrade.

Hunter Discover returns identity only (`domain`, `organization`, `emails_count`). Search criteria are not verified company attributes, and email counts are not employee counts. Unknown attributes remain **Unverified**. Six targeted keyword presets use `match: any`, US headquarters, Software Development, and 1–10 / 11–50 buckets, with nonprofit/education/government exclusions. Each request uses limit 20 and offset 0; presets rotate instead of paid pagination. Results may overlap or be exhausted. See [official contract notes](docs/hunter-discover.md).

After discovery, the application researches public product/pricing pages, stores short evidence excerpts and source URLs, and classifies business-model fit. **Qualified**, **Potential**, **Rejected**, and **Needs Review** filters are separate from your saved/rejected decisions. Missing or conflicting evidence stays **Unscored**. Business-model qualification does not verify company size, location, revenue, churn problems, or legal eligibility. Saved means shortlisted only.

## Architecture and data boundaries

```text
React / Vite → same-origin /api → owner authentication → Hunter Discover
                                          ├──────────→ Supabase companies
                                          └──────────→ bounded public website research
```

- `src/`: interface, responsive styling, and same-origin requests. No provider credentials or database client.
- `server/app.ts`: API routes, owner authorization seam, mutation validation, request limits, security headers, and redacted errors.
- `server/index.ts`: server configuration, Supabase Auth, dependency wiring, and production static serving.
- `server/hunter.ts`, `companies.ts`: bounded provider adapter, response validation, normalization, unverified qualification state, and fictional fixtures.
- `server/store.ts`: shared storage interface with isolated in-memory demo and Supabase implementations.
- `server/website.ts`, `research.ts`, `qualify.ts`: safe public fetching, persisted research cache, and evidence-based rules.
- `shared/`: public data contracts and search presets.
- `supabase/migrations/`: database constraints, uniqueness, timestamps, and row-level security.

Canonical domains are unique. Discovery uses conflict-ignore inserts, so rediscovery cannot reset saved/rejected decisions. RLS is enabled with no browser access policies, and grants to anonymous/authenticated roles are revoked. Only the server's secret-key service-role client can read/write companies. The API authenticates the owner before any live read, write, or Hunter call. Provider error payloads and request URLs are not logged or returned to the browser.

## Autonomous workflow

The [architecture](docs/architecture.md) now includes a persistent worker, consent/suppression checks, approved campaign policy, Gmail outbox, follow-ups, inbox and opportunities. All real dispatch remains gated behind server configuration and explicit owner activation. See [provider contracts](docs/automation-contracts.md).

## Validation and limitations

Automated tests use fictional records, attributed public product-description excerpts, mocked Hunter responses, and a real PostgreSQL engine via PGlite for migration constraints and role access. Browser tests exercise the actual demo server. No external credentials are required in CI.

Live Hunter plan compatibility, an actual Hunter response, Supabase Auth, and a hosted Supabase deployment must be smoke-tested after you provide credentials and apply the migration to the dedicated project. Mocked adapter tests do not establish live integration success. Provider contract changes should be handled in the adapter and its fixtures. Discovery uses bounded first-page presets, not a full-market crawler. Company website research fails closed when direct public network access or robots permission is unavailable.

Do not commit `.env` files, credentials, exports, live prospect exports, or screenshots containing live prospect data. Demo screenshots and discovery fixtures remain synthetic; public qualification excerpts are attributed in tests.

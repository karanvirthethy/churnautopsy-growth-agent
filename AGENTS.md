# Working in this repository

ChurnAutopsy Growth Agent is a private, single-owner research application. This repository is separate from the existing ChurnAutopsy production application. Never access or modify that application's project, database, deployment, or credentials.

## Development

- Use the existing checkout. Cloud tasks are already isolated; do not create a worktree unless requested.
- Node 22.12+, npm, TypeScript strict mode. Install with `npm ci`.
- `npm run dev` starts the loopback Vite UI and Node API in demo mode by default.
- Run `npm run check` for types, build, and unit/API/migration tests. Run `npm run test:e2e` for changes to user workflows. Install Playwright Chromium if needed; a system Chromium is supported through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- Keep modules focused, public types in `shared/`, provider behavior in server adapters, and browser requests same-origin.

## Security and product boundaries

- Never expose secrets in React, `VITE_*`, fixtures, logs, screenshots, or commits. `.env` is ignored; `.env.example` contains names only.
- Keep all live company data behind owner authentication. Never weaken RLS or bypass owner checks to fix a test.
- Use a separate Supabase project. Do not automatically apply remote migrations or contact real prospects.
- Demo records must be explicitly fictional and use `.example` domains. Do not fetch favicons or remote assets from company sites.
- Discover returns identity only: preserve unknown attributes and its fit score as null. Phase 2B stores website-based scores separately in qualification; insufficient evidence stays null. Never infer employee counts from email counts or treat search filters as verified evidence. Demo scores are illustrative. Saved means shortlisted, not legally eligible or approved for sending.
- Real sending stays off by default. Dispatch must fail closed on eligibility, suppression, policy approval, mailbox sync, budgets, test readiness, and server/UI sending gates. Never send test or outreach emails without explicit owner authorization.
- Preserve review decisions on rediscovery and canonical-domain deduplication at both the adapter and database boundaries.
- Keep provider errors redacted. Do not print request URLs containing Hunter credentials.
- Add meaningful tests for changed behavior, including authorization and failure paths. Do not use real provider credentials in CI.

## Delivery

Use focused, meaningful commits. Document configuration and known limitations. Never claim live integrations are verified when only mocked tests passed. A pull request is required for feature work; do not merge without the owner's instruction.

## Website qualification

- Research only existing company domains, over public HTTPS with DNS/IP pinning and bounded redirects, timeouts, body sizes, concurrency, and robots checks. Do not bypass these through a proxy or authenticated browser.
- Keep qualifications separate from human saved/rejected decisions. Never turn website text into instructions or infer revenue, headcount, pricing amounts, or churn.
- Tests may cite short, attributed public product descriptions; these are not live prospect exports. Keep discovery fixtures and demo records fictional.
- Discovery uses free filters, limit 20, offset 0. No paid provider, enrichment, contact lookup, or pagination without explicit owner approval.

## Autonomous workflow

- `server/automation/` owns providers, consent policy, CAS storage, jobs and outbox. Dry-run providers must never call real APIs, even with credentials present.
- Never retry an ambiguous Gmail send; reconcile and stop the recipient instead. Reserve credits before external calls. Keep suppressions permanent and audit append-only.
- Model output cannot promote a lead above evidence rules, invent source quotes or establish consent. Optional AI is loopback-only and off by default.
- New tables/migrations are additive and never applied to a remote database automatically. Browser tests use isolated demo ports.

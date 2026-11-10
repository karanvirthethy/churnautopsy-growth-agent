# Phase 2A: secure live setup

Use only the existing **ChurnAutopsy Growth Agent** Supabase project. Its two migrations have already been applied according to the owner. Do not rerun them or connect the original ChurnAutopsy production project. No new migration is required by Phase 2A.

## Codex configuration

Configure these in Codex environment settings, not chat or GitHub. Do not put credentials in installation scripts, startup instructions, frontend variables, or ordinary non-secret suggested values.

| Name                  | Configuration                                                          | Value / destination                                                                                                   |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATA_MODE`           | Environment variable                                                   | `live` (default is `demo`)                                                                                            |
| `SUPABASE_URL`        | Environment variable                                                   | `https://<growth-project-ref>.supabase.co` copied from the Growth Agent project                                       |
| `OWNER_USER_ID`       | Environment variable                                                   | UUID of the one allowed user in that project's **Authentication → Users**                                             |
| `SUPABASE_SECRET_KEY` | Restricted network secret exposed under this environment-variable name | The Growth Agent project's current `sb_secret_…` key; allowed destination **only** `<growth-project-ref>.supabase.co` |
| `HUNTER_API_KEY`      | Restricted network secret exposed under this environment-variable name | Existing Hunter API key; allowed destination **only** `api.hunter.io`                                                 |

Use exact hostnames, without `https://`, paths, ports, or wildcards, in secret destination settings. Keep existing network allowances and add the Growth Agent hostname if missing. `api.hunter.io` is already allowed in this environment. Restrict the Supabase key to your Growth Agent hostname, never a wildcard covering other projects. Do not put either secret in a `VITE_*` variable.

The backend accepts Codex proxy-injected placeholders without trying to decode them as JWTs or requiring the raw `sb_secret_` prefix. Supabase requests put the bound key in the `apikey` header; real owner access tokens use `Authorization: Bearer`. Hunter uses its documented server-side `api_key` query parameter; never log that URL. The restricted proxy must substitute each binding on its configured HTTPS destination. If a check fails, verify the variable name and secret destination in settings without printing values.

`SUPABASE_SERVICE_ROLE_KEY` is no longer read. Rename your configuration to `SUPABASE_SECRET_KEY` and use the current secret key. This flow needs no frontend Supabase key, database password, Supabase management token, or SMTP credentials.

Optional: `PORT` defaults to 3001. Set `NODE_ENV=production` only when serving the app through same-origin HTTPS; it enables Secure session cookies. Local loopback development uses `npm run dev` without production mode. Cloud restore does not preserve running server processes: restart after configuration changes. Review/save environment changes, then publish the updated environment when appropriate.

## Owner account

Disable public signup in the Growth Agent Supabase Auth settings. Use an existing owner user with an email/password login, or create one in **Authentication → Users** without sending an invitation email. Ensure the account is confirmed. Set `OWNER_USER_ID` to that user's UUID, not the project ID. The application has no signup or recovery flow. Type the owner's login credentials only into the application's sign-in form, never into chat or source files.

Owner verification runs before all live company operations and connection checks. Other users are denied even if they have a valid session in the same project. Login and verification clients are separate from database clients so a user session cannot replace elevated database authorization.

## Test live discovery

1. Check out the Phase 2A branch (or merge the reviewed PR when you choose), configure the five entries above, and restart with `npm run dev`. For production, use `npm run build` followed by `NODE_ENV=production npm start` behind same-origin HTTPS.
2. Sign in using the configured owner account. An owner mismatch, expired token, or failed identity verification denies access.
3. Open **Settings → Check connections**. Both services should report **healthy**. The check is owner-only and limited to three checks per minute. Demo mode reports **demo** and never calls providers.
4. Open **Leads → Find leads**. Hunter requests the first 20 companies targeting US headquarters, small-company buckets, and Software Development. A valid empty result is possible. There is no enrichment, contact lookup, or email sending.
5. Save or reject a company, reload, and confirm the decision persists. Find leads again and confirm rediscovery does not reset it. This step intentionally writes a review decision in your Growth Agent database; the health check does not write anything.
6. Company details remain **Unverified**, and fit **Unscored**, because Discover's minimal response does not supply qualification evidence. Email counts are not employee counts. Review B2B/SaaS fit and the 2-person minimum manually.

Never export real prospect data, account responses, cookies, or diagnostic URLs into the repository or CI. Automated tests use only synthetic credentials and fictional companies.

## What health checks prove

- Public `GET /api/health` is liveness only, not provider readiness.
- Owner-only `POST /api/connections/health` (JSON body `{}`) returns separate Supabase and Hunter statuses. HTTP 200 means the check ran; inspect each status for `healthy`, `error`, or `demo`.
- Supabase: a HEAD request checks the expected public `companies` columns and read permission. It returns no prospect rows and makes no changes. Successful access does not independently verify every constraint, nullable column, write grant, or migration history.
- Hunter: `GET /v2/account` checks credentials/account connectivity without spending enrichment credits or requesting prospects. Only a fixed status/message is returned, never account data. It does not prove Discover availability or search results.
- Checks run independently, have request timeouts, reject redirects, and redact provider/network errors. Authentication failures and rate limits remain protected errors. No provider request runs on startup or automatically in Settings.

## Migration compatibility

[Supabase's current key documentation](https://supabase.com/docs/guides/getting-started/api-keys) states that secret keys use PostgreSQL's `service_role` with `BYPASSRLS`; table grants still apply. The existing migrations grant that role SELECT/INSERT/UPDATE, keep browser roles denied, enforce canonical-domain uniqueness, and allow nullable company attributes after migration 2. PostgreSQL-engine tests apply both unchanged migrations, exercise reads/inserts/updates with the service_role, confirm conflict-ignore decisions and nullable fields, and deny browser roles.

The code and migrations are locally verified. Your hosted schema application is owner-reported until live credentials are configured and the checks above are run. This change does not access, link, migrate, or inspect any hosted database. URL validation currently supports standard hosted `*.supabase.co` project URLs, not custom domains or local Supabase.

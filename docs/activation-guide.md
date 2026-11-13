# Complete Growth Agent: private setup and activation

This is the single setup guide for the autonomous workflow. The existing owner authentication, companies, Hunter Discover, qualification and saved/rejected decisions are reused. No hosted migration, email, purchase, mailbox connection or deployment is performed by installing this code.

## What works without external authorization

Run `npm ci`, then `DATA_MODE=demo npm run dev`. Open `http://localhost:5173` → **Overview → Start dry run**. Use **Run next queued job** six times to advance discovery → website evidence → decision-maker → verification → eligibility/sequence planning → initial simulated delivery. The interface shows fictional records and simulated messages. Inspect Contacts and Email Sequences, then use Inbox → Simulate reply. An interested response creates an opportunity; every response stops follow-ups. Change its stage to track the audit and conversion. Emergency pause stops new claims and dispatch.

Dry-run providers make **no external requests**, even when live credentials exist. `DATA_MODE` selects storage/authentication; the persisted automation mode separately chooses mock versus live providers. In `DATA_MODE=live`, dry-run records persist in Supabase and remain namespaced away from live contacts, jobs and deliveries. Demo-mode storage is in memory and resets on API restart. A separate demo worker has its own memory, so use manual ticks for demo testing; persistent background workers require live Supabase storage.

The software includes scheduled discovery, evidence qualification, optional local AI, Hunter contact/finder/verification adapters, consent assessment, bounded email sequences, Gmail sending and polling, signed unsubscribe, opportunities, persistent queues, usage reservations, audit history and failure alerts. Real integrations are contract-tested with mocks. Actual mailbox permissions, sender deliverability, public unsubscribe routing and real provider behavior require the private activation tests below.

## 1. Apply only the new database migration

Use the dedicated **ChurnAutopsy Growth Agent** Supabase project, never the original ChurnAutopsy production project. The first three migrations are existing work. Verify their recorded application status; do not rerun migrations already applied. This task adds only the automation migration.

1. Back up the Growth Agent database through your normal process and privately record company/saved/rejected counts.
2. Review and apply `supabase/migrations/202611120001_growth_automation.sql` once through the Supabase SQL editor or your normal migration workflow.
3. Confirm existing company counts and decisions are unchanged. The migration creates `growth_runtime`, `growth_audit`, and a service-role-only compare-and-swap function. It does not change existing companies, grants, or migrations.
4. Start the branch in live storage mode and open Overview. Missing migration errors must be resolved before starting the worker.

Rollback: stop the worker and API before reverting application code. The additive tables can remain; do not drop them, as that would destroy suppression, delivery and audit records.

## 2. Configure server-only environment entries

Keep `.env` ignored locally or use the private host/Codex secret manager. Never paste values into chat or place secrets under `VITE_*`.

| Entry                        | Purpose / safe default                                                          |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `DATA_MODE`                  | `demo` locally; `live` for private Supabase-backed operation                    |
| `SUPABASE_URL`               | Existing dedicated Growth Agent project                                         |
| `SUPABASE_SECRET_KEY`        | Existing restricted secret; server-only                                         |
| `OWNER_USER_ID`              | Existing Supabase owner UUID                                                    |
| `HUNTER_API_KEY`             | Existing restricted secret; server-only                                         |
| `AUTOMATION_WORKER_ENABLED`  | `false` until background processing is wanted                                   |
| `ENABLE_PAID_HUNTER`         | `false`; explicit cost approval required before `true`                          |
| `ENABLE_REAL_SENDING`        | `false`; separate server gate, not a replacement for campaign approval          |
| `ENABLE_TEST_SENDING`        | `false`; set only when you approve a real test to your allowlisted recipient    |
| `GOOGLE_CLIENT_ID`           | Your Google OAuth application client ID                                         |
| `GOOGLE_CLIENT_SECRET`       | OAuth client secret; server-only                                                |
| `GOOGLE_REFRESH_TOKEN`       | Offline token for **churnautopsy@gmail.com**; server-only                       |
| `TEST_RECIPIENT`             | Your controlled/consenting mailbox for explicit configuration tests             |
| `UNSUBSCRIBE_BASE_URL`       | Public HTTPS origin routing only `/u/*` to this service                         |
| `UNSUBSCRIBE_SIGNING_SECRET` | Generate at least 32 random bytes privately; retain across deployments          |
| `LOCAL_QUALIFICATION_MODEL`  | Optional existing local Ollama model name; empty uses rules only                |
| `HOST`                       | `127.0.0.1` normally; `0.0.0.0` only inside a secured container/private network |

Do not rotate the unsubscribe signing secret without retaining support for already issued links. Old links must continue working; ordinary rotation is intentionally not automated. Back up state and secrets together under appropriate access controls.

Restricted network secret destinations:

- Supabase secret: only the dedicated `<project-ref>.supabase.co`, `apikey` header. Existing user JWT authentication remains separate.
- Hunter key: only `api.hunter.io`, `api_key` query parameter. Do not log complete request URLs.
- Google client secret and refresh token: only `oauth2.googleapis.com/token`, form body. Some restricted-secret proxies do not support form-field substitution; configure these directly in the private runtime's secret manager if unsupported. Never broaden their destinations to company sites.
- Short-lived Google access tokens are created and held only on the server and sent only to `gmail.googleapis.com` Authorization headers.
- Website research needs ordinary direct public DNS/HTTPS, independent of provider secret bindings. It intentionally bypasses environment proxies to preserve DNS/IP pinning. This Codex environment previously blocked such access, so blocked sites remain unscored.

## 3. Connect the authorized Gmail mailbox

Use the official [Gmail API](https://developers.google.com/workspace/gmail/api/guides) and [Google OAuth installed/web application guide](https://developers.google.com/identity/protocols/oauth2). Create your own Google Cloud OAuth client, enable Gmail API, and authorize **churnautopsy@gmail.com** with offline access and the minimum implemented scopes:

- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.readonly`

Complete Google's authorization flow in your browser using a trusted local OAuth client. Store the resulting refresh token privately in the server secret manager. Do not use mailbox passwords or paste tokens into this app's frontend. This implementation consumes an authorized refresh token rather than hosting an OAuth callback flow. Google testing-mode refresh tokens may expire; configure the consent screen appropriately and review verification/security requirements for restricted Gmail scopes before hosting. The send adapter checks the authorized profile matches churnautopsy@gmail.com before sending.

Gmail is used directly because the requested mailbox is Gmail; Hunter Sequences is not required. No new paid sending provider is added. A free Gmail account still has platform anti-abuse and daily limits; application caps do not override them. No automatic provider switch exists.

Provider contracts: Hunter official v2 documentation and Google's official `google-api-python-client` Gmail discovery schema were inspected. Relevant operations are Hunter `domain-search`, `email-finder`, `email-verifier`, and Gmail `users.getProfile`, `messages.send`, `messages.list`, `messages.get`. Google documentation pages were inaccessible from this cloud, so live OAuth scope/account behavior remains an activation check. See [provider notes](automation-contracts.md).

## 4. Public unsubscribe, private dashboard

Recipients need an unauthenticated HTTPS unsubscribe endpoint even though your dashboard is private. Use a dedicated origin, such as a domain you already own, to proxy **only** `/u/*`. All other paths at that origin must return 404. Do not expose `/api`, static dashboard assets, or the development server on that origin. Access the dashboard through a VPN/private network or SSH tunnel with an HTTPS proxy; owner authentication remains required.

The GET page confirms the action (email scanners must not opt out a recipient merely by loading a link). POST performs permanent suppression without login, including RFC 8058 one-click POST. Links contain an opaque contact ID and HMAC signature, no email address. Do not log full unsubscribe URLs. The email also supports opting out by replying. A received opt-out immediately cancels queued follow-ups; a request already accepted by Gmail cannot be recalled.

Example dedicated reverse-proxy policy (replace the hostname privately):

```caddy
unsubscribe.your-existing-domain.example {
  @unsubscribe path /u/*
  handle @unsubscribe {
    reverse_proxy 127.0.0.1:3001
  }
  handle {
    respond 404
  }
}
```

Keep access logs off or redact token paths. Do not deploy this example automatically. Confirm externally that GET displays confirmation, POST suppresses, and `/api/companies` on this public origin is inaccessible.

## 5. Approve a conservative campaign policy

In Campaigns, enter your real sender name, physical postal mailing address, sender jurisdiction, allowed recipient countries, budgets and sequence timings. The sender remains churnautopsy@gmail.com. Defaults are five emails/day, 50/month, zero paid Hunter credits, and follow-ups nominally four and nine days after initial delivery. Due times shift forward when delivery is delayed, preserving the gap between messages. Counts use **America/Toronto** calendar boundaries. Each contact receives at most one lifetime sequence, and no more than two follow-ups. Editing a policy invalidates approval, pauses sending and cancels queued drafts.

The implemented legal policy is intentionally narrow: **documented, current express consent specifically for ChurnAutopsy audit outreach**, with dated evidence and known US/Canadian jurisdiction. It does not automate every potential CASL implied-consent or CAN-SPAM route. Unknown locations, expired/missing consent, public-email-only evidence, nonqualified companies, no-solicitation signals, catch-all/unknown email verification, stopped contacts and suppressed addresses are denied. A score, saved lead, publicly posted address or verified inbox is never consent. No code can establish the truth of imported evidence: review your consent collection process and the campaign policy for applicable laws before enabling it. The [CRTC](https://crtc.gc.ca/eng/internet/anti.htm) and [FTC](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) are the relevant official starting points; these legal pages were blocked from this environment, so no claim of a fresh legal review is made.

Import existing consent evidence in Contacts, individually or in batches of up to 50 JSON records. It can come from an opt-in form/CRM that already records permission; there is no automatic inference from Hunter. Example with fictional values:

```json
[
  {
    "email": "founder@fictional.example",
    "country": "US",
    "basis": "express_consent",
    "scope": "churnautopsy_audit_outreach",
    "source": "https://your-consent-system.example/records/123",
    "statement": "I agree to receive ChurnAutopsy free-audit outreach and related follow-ups.",
    "obtainedAt": "2026-11-12T15:00:00Z",
    "expiresAt": "2027-02-12T15:00:00Z"
  }
]
```

The app imposes a conservative maximum one-year evidence window, even where the underlying legal basis might last longer. Importing evidence never removes suppression. No manual approval of each lead or message is required after policy approval; without sufficient evidence a contact simply remains ineligible.

## 6. Costs and optional AI

Nothing is purchased or called live by this development work.

- Hunter documents Discover as free. The six presets use limit 20, offset 0 and no paid-only filters. Contact Domain Search/Finder and Email Verifier can consume search/verification credits. Review your current Hunter plan and rates before enabling `ENABLE_PAID_HUNTER`; zero budgets block calls. Domain Search requests at most 10 found addresses and selects one appropriate decision-maker per company. One conservative search credit is reserved per request, one verification credit per verifier call, including retries. Check current credit accounting in Hunter before activation; do not enable if it differs from these assumptions. Finder is implemented but not used as a fallback that might silently spend additional credits.
- Gmail adds no sending provider purchase, but account/API limits and Google OAuth requirements still apply. Hosting, database storage and egress can cost money.
- Rules-based qualification runs locally with no AI API fee. For actual model-assisted assessment, optionally install a model you approve in Ollama on the **same private host**, then set `LOCAL_QUALIFICATION_MODEL`. No model is downloaded by this app. The fixed endpoint is `127.0.0.1:11434`; using it requires sufficient CPU/RAM and may increase hosting costs. The model receives bounded public-page text, never credentials. Exact quoted evidence must match fetched sources. It cannot promote a lead above deterministic evidence rules or override exclusions; disagreement/outage leaves the lead unscored. Confidence is subjective, not a calibrated probability. In containers, run API/worker/model in an explicitly reviewed network arrangement; the supplied compose file does not automatically deploy a model.

There is no paid AI API integration. If one is later selected, assess privacy, token prices and budget enforcement before adding it.

## 7. Always-on private hosting

An existing small Linux host/VPS is the simplest option. A 1–2 GB host is normally enough for the API and single worker without a local language model; verify actual resource use. Budget roughly US$5–12/month for a small VPS as an estimate, not a quoted provider price; database and optional model resources are additional. No hosting is purchased or deployed here.

`Dockerfile` and `compose.yaml` are supplied as reviewable configuration. The app maps only `127.0.0.1:3001`; the worker has no inbound port. `restart: unless-stopped` keeps both running independently of your Mac. Configure a private VPN/HTTPS entry point for the dashboard and the narrowly routed public unsubscribe origin separately. Use persistent Supabase storage, secret injection, backups and process monitoring. To run without Docker, use Node 24 with a service manager to run `npm start` and `npm run worker` independently. Set `AUTOMATION_WORKER_ENABLED=true` only when you want jobs processed; persisted pause and sending gates still apply.

The queue, credit reservations, outbox and approvals are a PostgreSQL transactional single-owner aggregate. Compare-and-swap serializes claims across API and worker processes. This intentionally favors correctness at low volume over a distributed high-throughput queue. One job runs at a time; crashed non-delivery jobs have bounded retries. A 30-minute lease permits recovery. Audit entries are retained append-only in PostgreSQL; the UI shows the latest 300. The aggregate is capped at 10 MB and the working job list at 3,000; plan a reviewed archive migration before scaling. Suppressions must never be deleted during archival.

Dashboard alerts are persisted for provider failures, uncertain delivery and interested replies. The worker also emits fixed, redacted storage-health errors. Configure your host's process/uptime alerting separately so you learn if the whole host or database goes down; a stopped process cannot notify through its own dashboard. No third-party notification service is silently added.

## 8. Test, then explicitly activate

1. Run `npm run check` and `npm run test:e2e`. Browser tests use demo ports 5174/3002, not the live workspace.
2. Complete a dry-run journey and reply/unsubscribe/bounce scenarios. Confirm an interested reply creates an opportunity, all replies stop follow-ups, and emergency pause prevents new work.
3. Approve the live master policy in Campaigns by entering the requested confirmation. Sending remains off. Set approved Hunter budgets and the paid-call gate only if you approve those costs. Resume automation for live research; evidence may remain insufficient where robots/network/page content blocks research.
4. Configure your controlled `TEST_RECIPIENT`, Gmail authorization, sender address, unsubscribe routing and `ENABLE_TEST_SENDING=true`. In Automation Settings, explicitly confirm **SEND TEST TO CONFIGURED RECIPIENT**. No test is sent automatically. Confirm receipt, sender identity, body, postal address, plain-text unsubscribe link, POST opt-out and private-dashboard routing. Then type **CONFIRM RECEIPT AND UNSUBSCRIBE** in Automation Settings. The app checks that the test contact actually used the unsubscribe endpoint before accepting this confirmation. There is a three-test/day cap.
5. Only after you approve real sending, set `ENABLE_REAL_SENDING=true`, restart, and enter **ENABLE LIVE SENDING** in Automation Settings. A recent mailbox test, approved live policy, nonzero Hunter budgets, unsubscribe configuration and no unresolved ambiguous delivery are required. Confirmations are owner-authenticated and recorded in audit. You do not approve individual eligible emails.
6. Start the always-on worker. Monitor initial deliveries, provider usage, alerts and reply classifications. Emergency pause is available in the top bar and all automation pages. Remove the environment sending gate for a second stop layer.

Gmail does not provide a general send-idempotency key. Before dispatch the app atomically records `sending` and reserves budget. A timeout/crash at that point marks the outcome **uncertain**, pauses sending and never retries automatically. Search Gmail Sent for the displayed deterministic Message-ID. Use the UI reconciliation action to close without resending; the recipient is stopped permanently for that sequence. This favors missing an email over sending duplicates. An in-flight request may complete after pause; later work cannot start.

The inbox is polled every five minutes and refreshed immediately before each real dispatch. This is not an instantaneous push webhook. A reply received by the provider between the last poll and an in-flight send cannot be recalled; once ingested, it stops further messages immediately. Mailbox outages/backlogs fail closed. Polling overlaps by one hour and deduplicates provider IDs; at most 60 messages are read per poll before failing closed. Heavy unrelated mailbox traffic needs operational attention before continuing.

## Remaining external decisions

You still supply: real postal/sender details, policy/legal review and valid consent evidence; Hunter budget approval; Google OAuth authorization and any Google verification; a controlled test recipient; HTTPS unsubscribe routing; private always-on hosting and monitoring; optional local AI resources; application of the new migration; explicit test and final live activation. No credentials are requested in chat. The original ChurnAutopsy application stays out of scope.

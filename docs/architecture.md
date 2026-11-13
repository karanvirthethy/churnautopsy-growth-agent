# Architecture and future extension points

## Current trust boundary

The browser communicates only with the same-origin Node API. In live mode, each request validates the Supabase access token and exact owner UUID. The token is held in an HttpOnly cookie; the frontend cannot read it. Login has a separate throttle. Mutations require JSON and reject foreign Origin headers. The application does not trust proxy-supplied IP headers; the reverse proxy's shared address may impose stricter throttling, which is safe for one owner.

The current Supabase `sb_secret_` key (`SUPABASE_SECRET_KEY`) maps to service_role and bypasses RLS and must remain exclusively on the server. Sign-in uses a separate client so the persistence client's service-role authorization cannot be overwritten by a user session. Database permissions deny browser roles entirely. Error responses intentionally omit upstream detail, because Hunter URLs include credentials and responses may contain prospect data.

Demo and live storage are distinct. The live store never seeds demo rows. `DATA_MODE=live` with incomplete configuration exits instead of serving a misleading fallback.

## Company lifecycle

`new → saved | rejected`, with either decision reversible to `new`. The database's unique canonical domain is the idempotency boundary. Concurrent rediscovery inserts use `ON CONFLICT DO NOTHING`; they preserve decisions but intentionally do not refresh existing enrichment. A later enrichment job should update metadata separately without touching review status.

The company table still stores only business-level information. Contact, consent, messages and replies live in the private automation aggregate; mailbox secrets remain in server environment configuration. No tracking pixels exist. `eligibility=not_assessed` is enforced by a database constraint, not merely UI copy.

## Autonomous workflow boundaries

`server/automation/` implements the remaining lifecycle without changing existing company decisions. The PostgreSQL `growth_runtime` singleton stores a versioned workflow aggregate. A restricted compare-and-swap RPC serializes persistent job claims, budgets, policy approvals, contacts, consent, suppressions and outbox transitions; the same transaction appends immutable `growth_audit` rows. This is deliberately a low-volume, single-owner design, not a distributed high-throughput queue. State is capped at 10 MB; expansion requires a reviewed archival/normalization migration.

The worker uses durable due times and a 30-minute job lease. It reserves usage before providers, retries non-delivery failures at most three times with backoff, and marks interrupted dispatch uncertain instead of retrying. The API and worker share PostgreSQL state; paused policies block claims. A final owner policy/eligibility/suppression/evidence check precedes every send. Gmail replies are synchronized before dispatch, and ingestion stops follow-ups before intent classification. A narrow unauthenticated signed unsubscribe route is the only public surface needed.

Consent and qualification are separate records. Only current express consent for the specific outreach, known allowed jurisdiction, fresh valid verification, fresh confirmed website evidence and approved sender details can pass. No-solicitation signals, manual rejections and permanent suppressions deny. The existing company `eligibility=not_assessed` remains unchanged; contact-level assessments are evaluated just before planning and sending. Opportunity stages require the owner to perform and record actual audit work.

See [the complete activation guide](activation-guide.md) for costs, configuration, migration, failure semantics and limitations. No real sending or chargeable API call is enabled by installing this code.

## Phase 2A connection checks

See [live setup](live-setup.md). Owner-only checks probe database columns with HEAD and Hunter account availability. They return fixed diagnostic messages and no provider payloads. Elevated keys are sent only as apikey headers to the configured Supabase origin; actual user JWTs stay in Authorization headers for identity verification. Requests have timeouts and reject redirects. No automatic remote migration or enrichment runs.

# Architecture and future extension points

## Current trust boundary

The browser communicates only with the same-origin Node API. In live mode, each request validates the Supabase access token and exact owner UUID. The token is held in an HttpOnly cookie; the frontend cannot read it. Login has a separate throttle. Mutations require JSON and reject foreign Origin headers. The application does not trust proxy-supplied IP headers; the reverse proxy's shared address may impose stricter throttling, which is safe for one owner.

The current Supabase `sb_secret_` key (`SUPABASE_SECRET_KEY`) maps to service_role and bypasses RLS and must remain exclusively on the server. Sign-in uses a separate client so the persistence client's service-role authorization cannot be overwritten by a user session. Database permissions deny browser roles entirely. Error responses intentionally omit upstream detail, because Hunter URLs include credentials and responses may contain prospect data.

Demo and live storage are distinct. The live store never seeds demo rows. `DATA_MODE=live` with incomplete configuration exits instead of serving a misleading fallback.

## Company lifecycle

`new → saved | rejected`, with either decision reversible to `new`. The database's unique canonical domain is the idempotency boundary. Concurrent rediscovery inserts use `ON CONFLICT DO NOTHING`; they preserve decisions but intentionally do not refresh existing enrichment. A later enrichment job should update metadata separately without touching review status.

The current company model stores only business-level information. It has no email address, personal contact, tracking pixel, mailbox token, or message body. `eligibility=not_assessed` is enforced by a database constraint, not merely UI copy.

## Future work must add explicit boundaries

1. **Eligibility assessment:** a separate evidence record with jurisdiction, lawful basis, source provenance, assessment date, policy version, expiration, and reviewer. Unknown and expired decisions must deny sending. Add suppression and opt-out records before any outbound feature.
2. **Campaign drafting:** immutable draft versions, intended recipients, eligibility references, owner approval, and a preview. A saved company alone must never enter a delivery queue.
3. **Delivery:** transactional outbox, per-recipient idempotency, retry budgets, rate limits, provider adapters, and an audited final eligibility/suppression check immediately before dispatch. No delivery adapter is instantiated in Phase 1.
4. **Follow-ups:** explicit state machine, approved schedule, cancellation on reply/unsubscribe/bounce, and business-time rules. Avoid long-lived in-process timers.
5. **Replies:** signed, replay-protected webhooks; deduplicated provider message IDs; thread/company association; and cancellation of pending follow-ups before classification. Treat incoming message content as untrusted data.

Add these through new migrations and service interfaces. Do not repurpose fit scores as legal assessments or infer consent from a company appearing in Hunter.

## Phase 2A connection checks

See [live setup](live-setup.md). Owner-only checks probe database columns with HEAD and Hunter account availability. They return fixed diagnostic messages and no provider payloads. Elevated keys are sent only as apikey headers to the configured Supabase origin; actual user JWTs stay in Authorization headers for identity verification. Requests have timeouts and reject redirects. No automatic remote migration or enrichment runs.

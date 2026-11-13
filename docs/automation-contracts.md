# Automation provider contracts and failure boundaries

Official machine-readable Gmail schema inspected: https://github.com/googleapis/google-api-python-client/blob/main/googleapiclient/discovery_cache/documents/gmail.v1.json

Hunter documentation inspected: https://hunter.io/api-documentation/v2

## Hunter

- Discover remains six free structured search presets, limit 20, offset 0. Search filters never become verified company facts.
- Domain Search uses `type=personal`, `provenance=found`, `seniority=executive,senior`, `required_field=full_name,position`, and limit 10. Only same-company-domain addresses with public HTTPS sources and appropriate founder/CEO/customer-success/growth roles proceed. One contact per company is retained. This conservative filtering can miss suitable contacts; it never guesses an address.
- Finder accepts an already known person's name, but discards results without public sources. It is not an automatic extra-credit fallback.
- Verifier accepts only `status=valid`; `accept_all`, `unknown`, pending and other statuses never grant send eligibility. The verifier allows 25 seconds for Hunter’s documented 20-second response window; HTTP 202 remains pending and uses the bounded job retry path.
- Separate server gate and app budgets are required before paid contact/verification calls. Reservations survive failures and process restarts.

## Gmail

OAuth refresh is posted to `oauth2.googleapis.com/token`; bearer tokens stay server-side. The adapter checks `users.getProfile.emailAddress` matches the authorized sender. Plain-text MIME is encoded as base64url in `messages.send.raw`. Message-ID is deterministic per outbox row; follow-ups include In-Reply-To/References and the Gmail threadId. Signed unsubscribe and RFC 8058 one-click headers are included. No tracking pixels or click tracking exist.

`messages.list` plus bounded `messages.get(format=full)` polling reads incoming messages, including spam/trash, after a saved overlapping timestamp. Provider message IDs deduplicate replies. Sender/thread association stops follow-ups before classifying interest. Plain-text body extraction avoids executing HTML; HTML-only replies still stop the sequence and become Needs Attention. Delivery failures suppress the matched recipient. Unrecognized messages do not create contacts or send replies. Reply classification is a conservative heuristic; manual opportunity edits are supported.

No automatic retry is safe after a Gmail send timeout. The persistent outbox records ambiguity and pauses. No webhook endpoint that accepts unauthenticated provider events is exposed; owner-only synthetic events are restricted to dry-run contacts. Public access is limited to signed-purpose unsubscribe routes.

## Evidence and AI

Public website research retains the existing robots, DNS/IP pinning, redirect, body-size and timeout controls. No-solicitation phrases are added as blocking flags. Rules are not a legal determination and cannot establish consent. Optional loopback Ollama inference must provide exact source quotes, cannot promote above rules, and fails closed on unavailable or inconsistent evidence. No remote paid AI provider or automatic model download is configured.

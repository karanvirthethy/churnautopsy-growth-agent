# Phase 2B: targeted discovery and public evidence

## Costs and scope

No new paid provider, AI model, enrichment API, contact lookup, or sending service is added. Hunter documents Discover as free, with pagination and some filters restricted to paid plans. Every discovery makes one request with `limit: 20`, `offset: 0`, and documented free filters; it never retries using paid features. Provider terms and limits can change. Public website requests add ordinary hosting/network traffic, and qualification JSON uses existing Supabase storage. No chargeable API calls were made during development.

Six presets cover customer success, customer support, subscription billing, sales operations, product analytics, and team workflows. Keywords match **any** term in the selected preset. The next preset is selected after a successful search and remembered in this browser. Searches can overlap, return fewer than 20 matches, or eventually repeat. Free-plan discovery cannot promise exhaustive results or unlimited novel companies. All results are deduplicated by canonical domain; rediscovery preserves existing records and decisions.

## Research and scoring

Find leads saves identities first, then researches those domains sequentially. **Research shown (up to 20)** also works on previously saved companies. Stop pauses after the current company; completed assessments persist. Closing the browser stops subsequent requests; resume using Research shown. Cache lifetimes are 24 hours for complete research and 30 minutes for incomplete research, including across server restarts. One domain is researched at a time; simultaneous requests for the same domain share work.

Research inspects the homepage and up to two product/pricing/about pages. Evidence is short page-text excerpts with source URLs, timestamps, signals, and fetch status. It never invents a price or estimates revenue, team size, location, or churn problems. Existing unknown company attributes remain null.

| Filter / classification                 | Rule                                                                                                                                     | Score    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Qualified / Confirmed B2B SaaS          | Business audience, software product, hosted delivery, recurring billing; evidence across at least two pages                              | 90       |
| Potential / Potential B2B SaaS          | Business software with hosting or recurring billing evidence, but incomplete corroboration                                               | 65 or 80 |
| Rejected / Not a suitable prospect      | Explicit nonprofit, agency, consumer-only, or open-source desktop/language/browser evidence without relevant hosted subscription signals | 0        |
| Needs Review / Insufficient information | Missing, inaccessible, weak, or conflicting evidence                                                                                     | Unscored |

These are deterministic English-language heuristics, not probabilities or an AI verification service. “Confirmed” means the inspected website supports the business model; it is not independent verification. Sources may be stale or misleading. JS-only websites, unusual wording, unrecognized agency/consumer models, and contradictory marketing copy may need manual review. Open source alone is **not** rejection: commercial hosted subscriptions can qualify. A score is out of 100; rules intentionally do not award the remaining 10 points for unknown business facts.

Manual saved/rejected decisions are stored separately and never overwritten by research. The Rejected filter includes unsuitable assessments and manual rejections; manually rejected companies are excluded from Qualified/Potential/Needs Review. Manual status filters and qualification filters combine. A saved company can still have an unsuitable or unscored assessment. No qualification grants outreach eligibility.

## Safe access and cloud limitations

The server uses unauthenticated HTTPS only. It checks robots.txt (404 means no policy; other failures fail closed), honors disallow rules, and skips crawl delays above its two-second budget. It uses direct DNS resolution with all returned IPs required to be public, then pins the TLS connection to the checked address. Redirects are limited to the company's canonical domain and its www alias; policies are checked for each host. Local/private/reserved networks, alternate ports, URL credentials, and cross-domain redirects are blocked.

Research is bounded to three content pages, five content requests including redirects, and at most six robots requests; each response is capped at 350 KB, robots at 64 KB, DNS at three seconds, and HTTP at six seconds. There is a two-second delay between content requests. No cookies, credentials, session tokens, environment proxy, browser execution, or anti-bot bypass is used. Scripts/navigation/quotes are removed from extracted evidence; no raw HTML or contacts are stored. Owner authentication and rate limits protect the endpoint. A worst-case company can take about a minute; batches run sequentially.

**This Codex environment does not currently permit direct company-site access.** Tests validate fetching with controlled transports and mocked DNS, not live website reachability. Restricted network secrets for Hunter/Supabase do not grant website access. In this environment, inaccessible websites correctly remain unscored. For live research, run privately on your Mac or a trusted server with ordinary outbound DNS/HTTPS access. Do not send provider secrets to company domains or disable SSRF checks. Hunter and Supabase may still use `NODE_USE_ENV_PROXY=1` in Codex; the website transport intentionally does not.

## Apply the new migration safely

No remote migration was applied by this task. The first two migrations are already applied to the dedicated Growth Agent project; **do not rerun them** and do not use the original ChurnAutopsy production project.

1. Confirm the Supabase project is **ChurnAutopsy Growth Agent**. Retain a normal database backup and record the current company count and saved/rejected counts privately.
2. Before starting this branch in live mode, run only `supabase/migrations/202611110001_company_qualification.sql` once in that project's SQL editor (or your normal reviewed migration workflow). The transaction adds one nullable JSONB column and a shape/score constraint. It does not update existing rows, change RLS/grants, or reset decisions.
3. Confirm the new `qualification` column exists, existing rows have null qualification, and counts/decisions are unchanged. Do not paste company data or credentials into chat.
4. Start the app, sign in, and use Settings → Check connections. The read-only Supabase check now includes the new column. No new environment variables or secrets are needed.
5. Choose a preset and Find leads, or use Research shown on your existing companies. Expand each score to inspect evidence and page availability. Reload to confirm assessments and decisions persist.

If rolling back application code, the nullable column can remain safely in place. Do not drop the column merely to roll back the app, because that would discard research. Fresh installations apply all three migrations in filename order.

## Validation

Tests cover the documented minimal Hunter response, free filters and deduplication, GNOME/GIMP/PHP/Tor negative scenarios, attributed Plausible and Outline positive descriptions, corroborated synthetic SaaS pages, commercial open source, conflicting/missing evidence, caching, owner access, DNS/redirect/robots protections, database permissions, and desktop/mobile review workflows. Negative scenarios use explicitly synthetic text, not claims of fresh live research. Public README excerpts are unit-test inputs, not a runtime GitHub enrichment provider.

Run `npm run check` and `npm run test:e2e`. Browser tests use dedicated demo ports 5174/3002 and cannot reuse the live app on 5173/3001.

# Hunter Discover contract

Official sources checked November 11, 2026:

- https://hunter.io/api-documentation/v2#discover
- https://hunter.io/files/industries.json

Discover uses `POST /v2/discover`. Its documented per-company response is `domain`, `organization`, and `emails_count` with personal/generic/total counts. The outer response contains `data` and `meta` (results, limit, offset, params, filters). The documentation explicitly warns that email counts are not employee counts. Discover itself is documented as free; paid plans allow pagination and certain additional filters. We request only the first 20 results.

The test fixture `tests/fixtures/hunter-discover-minimal.json` follows this documented structure but substitutes a fictional company and `.example` domain. No real prospect data is used. Unknown extra fields are stripped, not interpreted as enrichment. Missing organization falls back to the canonical domain as a display label.

The previous adapter wrongly required location/headcount/software evidence on each result and silently removed minimal records. The corrected adapter retains identities and uses null attributes and null score. The UI labels these unverified and unscored. Search criteria never grant fit points; email counts are neither stored nor used for qualification.

Search targets US headquarters, 1–10/11–50 employees, and Software Development (a value confirmed in the official industry list). Phase 2B uses six narrow keyword presets with `match: any`, rather than requiring literal SaaS AND B2B. It excludes documented company types `non profit`, `educational`, `educational institution`, and `government agency`. Limit is 20 and offset is always 0; no paid pagination or paid filters (technology, funding, similar_to, year_founded) are used. Presets rotate in the browser and may overlap. B2B SaaS qualification and the 2-employee minimum require human review. The API does not identify which bucket an individual minimal result matched.

No enrichment, domain-search, contact lookup, or sending call is added. Automated tests assert that a discovery invokes exactly one HTTP request to the Discover endpoint. Any future enrichment API call requires explicit owner approval, a cost assessment, and a separate evidence model.

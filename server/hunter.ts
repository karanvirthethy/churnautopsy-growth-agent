import { searchProfiles, type SearchProfileId } from "../shared/searches.js";
import { HunterResponse, mapHunter } from "./companies.js";
export async function discoverHunter(
  apiKey: string,
  profileId: SearchProfileId = searchProfiles[0].id,
) {
  const profile = searchProfiles.find((p) => p.id === profileId);
  if (!profile) throw new Error("Unknown discovery profile");
  // Fixed ICP and bounded results prevent user-controlled queries and unbounded requests.
  const response = await fetch(
    `https://api.hunter.io/v2/discover?api_key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        headquarters_location: { include: [{ country: "US" }] },
        headcount: ["1-10", "11-50"],
        industry: { include: ["Software Development"] },
        company_type: {
          exclude: [
            "non profit",
            "educational",
            "educational institution",
            "government agency",
          ],
        },
        keywords: { include: [...profile.keywords], match: "any" },
        limit: 20,
        offset: 0,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      "Hunter discovery unavailable. Check your API key, plan, and request limits.",
    );
  const parsed = HunterResponse.parse(await response.json());
  const unique = new Map<string, ReturnType<typeof mapHunter>>();
  for (const row of parsed.data.slice(0, 20)) {
    try {
      const company = mapHunter(row);
      unique.set(company.domain, company);
    } catch {
      // Invalid domains never become website-fetch targets.
    }
  }
  return [...unique.values()];
}

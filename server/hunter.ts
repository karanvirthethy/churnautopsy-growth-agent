import { HunterResponse, mapHunter } from "./companies.js";
export async function discoverHunter(apiKey: string) {
  // Fixed ICP and bounded results prevent user-controlled queries and unbounded credit spend.
  const response = await fetch(
    `https://api.hunter.io/v2/discover?api_key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        headquarters_location: { include: [{ country: "US" }] },
        headcount: ["1-10", "11-50"],
        keywords: { include: ["SaaS", "B2B"], match: "all" },
        limit: 20,
        offset: 0,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      "Hunter discovery unavailable. Check your API key, plan, and credits.",
    );
  const parsed = HunterResponse.parse(await response.json());
  return parsed.data.flatMap((row) => {
    try {
      const company = mapHunter(row);
      return company ? [company] : [];
    } catch {
      return [];
    }
  });
}

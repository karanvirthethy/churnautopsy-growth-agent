import { z } from "zod";
import type { Company } from "../shared/company.js";
export function normalizeDomain(value: string): string {
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  const domain = url.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)
  )
    throw new Error("Invalid company domain");
  return domain;
}
const HunterCompany = z.object({
  domain: z.string(),
  organization: z.string().nullish(),
  // Discover documents identity and email counts, not company enrichment.
  // Ignore email counts and extra fields: neither establishes ICP evidence.
});
export const HunterResponse = z.object({ data: z.array(HunterCompany) });
export function mapHunter(input: z.infer<typeof HunterCompany>): Company {
  const domain = normalizeDomain(input.domain);
  return {
    domain,
    name: input.organization?.trim() || domain,
    industry: null,
    location: null,
    headcount: null,
    score: null,
    reasons: [
      "Unscored: Discover does not return company qualification evidence",
      "Industry, location, and employee count are unverified",
      "B2B and SaaS business models require manual review",
      "Search filters are targeting criteria, not verified company attributes",
      "Confirm 2–50 employees; the search includes the 1–10 bucket",
      "No enrichment requested; legal eligibility remains not assessed",
    ],
    status: "new",
    source: "hunter",
    eligibility: "not_assessed",
  };
}
export const demoCompanies: Company[] = [
  [
    "Metric Grove",
    "metricgrove.example",
    "Analytics software",
    "Austin, TX, US",
    "11-50",
    100,
  ],
  [
    "Relay Harbor",
    "relayharbor.example",
    "Customer success software",
    "Boston, MA, US",
    "11-50",
    90,
  ],
  [
    "Stack Orchard",
    "stackorchard.example",
    "Developer software",
    "Denver, CO, US",
    "1-10",
    80,
  ],
  [
    "Northstar Desk",
    "northstardesk.example",
    "Workflow software",
    "Seattle, WA, US",
    "11-50",
    90,
  ],
  [
    "Signal Loom",
    "signalloom.example",
    "Marketing software",
    "Chicago, IL, US",
    "1-10",
    70,
  ],
].map(([name, domain, industry, location, headcount, score]) => ({
  name: String(name),
  domain: String(domain),
  industry: String(industry),
  location: String(location),
  headcount: String(headcount),
  score: Number(score),
  reasons: [
    "Fictional company for demonstration",
    ...(headcount === "1-10"
      ? ["Confirm at least 2 employees"]
      : ["Employee range within 2–50"]),
    "Fit is not legal eligibility",
  ],
  status: "new",
  source: "demo",
  eligibility: "not_assessed",
}));

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
  industry: z.string().nullish(),
  headcount: z.string().nullish(),
  keywords: z.array(z.string()).nullish(),
  country: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
});
export const HunterResponse = z.object({ data: z.array(HunterCompany) });
export function mapHunter(
  input: z.infer<typeof HunterCompany>,
): Company | null {
  if (!["US", "United States"].includes(input.country ?? "")) return null;
  if (!["1-10", "11-50", "2-10"].includes(input.headcount ?? "")) return null;
  const text =
    `${input.industry ?? ""} ${(input.keywords ?? []).join(" ")}`.toLowerCase();
  if (!/software|saas/.test(text)) return null;
  const reasons = ["US headquarters", "Software industry match"];
  let score = 60;
  if (input.headcount !== "1-10") {
    score += 20;
    reasons.push("Employee range within 2–50");
  } else reasons.push("1–10 range: confirm at least 2 employees");
  if (/saas|software as a service/.test(text)) {
    score += 10;
    reasons.push("SaaS keyword match");
  } else reasons.push("SaaS business model needs review");
  if (/b2b|business.to.business/.test(text)) {
    score += 10;
    reasons.push("B2B keyword match");
  } else reasons.push("B2B business model needs review");
  return {
    domain: normalizeDomain(input.domain),
    name: input.organization || input.domain,
    industry: input.industry || "Software",
    location: [input.city, input.state, "US"].filter(Boolean).join(", "),
    headcount: input.headcount!,
    score,
    reasons,
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

export type Classification =
  "confirmed" | "potential" | "unsuitable" | "insufficient";
export interface Evidence {
  signal: string;
  quote: string;
  url: string;
}
export interface ResearchPage {
  url: string;
  status: "ok" | "blocked" | "unavailable";
  text: string;
}
export interface Qualification {
  modelAssessment?: {
    provider: "local_model";
    classification: Classification;
    confidence: number;
    uncertainties: string[];
    evidence: { quote: string; url: string }[];
  };
  version: "rules-v1";
  classification: Classification;
  score: number | null;
  reasons: string[];
  flags: string[];
  evidence: Evidence[];
  sources: { url: string; status: ResearchPage["status"] }[];
  checkedAt: string;
}
export const classificationLabels: Record<Classification, string> = {
  confirmed: "Confirmed B2B SaaS",
  potential: "Potential B2B SaaS",
  unsuitable: "Not a suitable prospect",
  insufficient: "Insufficient information",
};
export type QualificationFilter =
  "all" | "qualified" | "potential" | "rejected" | "review";
export function matchesQualification(
  company: { status: string; qualification?: Qualification | null },
  filter: QualificationFilter,
) {
  const classification = company.qualification?.classification;
  if (filter === "all") return true;
  if (filter === "rejected")
    return company.status === "rejected" || classification === "unsuitable";
  if (company.status === "rejected") return false;
  if (filter === "qualified") return classification === "confirmed";
  if (filter === "potential") return classification === "potential";
  return !classification || classification === "insufficient";
}

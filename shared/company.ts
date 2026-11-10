export type LeadStatus = "new" | "saved" | "rejected";
export interface Company {
  domain: string;
  name: string;
  industry: string;
  location: string;
  headcount: string;
  score: number;
  reasons: string[];
  status: LeadStatus;
  source: "demo" | "hunter";
  eligibility: "not_assessed";
}
export interface Workspace {
  mode: "demo" | "live";
  companies: Company[];
}
